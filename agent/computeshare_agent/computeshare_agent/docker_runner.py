# Takes the job manifest and the live resource snapshot, reconciles them, and builds + runs the exact Docker command for this machine.

import subprocess
import shlex
import os

MIN_VIABLE_CPU_CORES = 0.5
MIN_VIABLE_RAM_GB    = 0.5
GPU_VRAM_HEADROOM_MB = 0    # for now

IMAGE_REGISTRY = {
    "ml_notebook": {
        "image":      "siddhantbh/gridnode-ml-base:latest",
        "gpu_image":  "siddhantbh/gridnode-ml-gpu:latest",   # used if job requests GPU
        "network":    "none",                      # no internet needed
        "entrypoint": None,                        # use image default
    },
    "video_render": {
        "image":      "siddhantbh/gridnode-video:latest",
        "gpu_image":  None,                        # no GPU variant for video
        "network":    "none",
        "entrypoint": None,
    },
    "server_run": {
        "image":      "siddhantbh/gridnode-server-runner:latest",
        "gpu_image":  None,
        "network":    "bridge",    # servers need network — proxied through agent
        "entrypoint": None,
    },
    "data_processing": {
        "image":      "siddhantbh/gridnode-data-processing:latest",
        "gpu_image":  None,
        "network":    "none",
        "entrypoint": None,
    },
}

def get_image_config(job):
    job_type = job["type"]
    config   = IMAGE_REGISTRY.get(job_type)

    if not config:
        raise ValueError(
            f"Unknown job type: '{job_type}'. "
            f"Supported types: {list(IMAGE_REGISTRY.keys())}"
        )

    # select GPU image if job requests it and a GPU variant exists
    if job.get("gpu_required") and config["gpu_image"]:
        image = config["gpu_image"]
    else:
        image = config["image"]

    return {**config, "resolved_image": image}


def resolve_allocation(job, resources):
    cpu_request = job.get("cpu_request")
    if cpu_request is None:
        tier_map = {"light": 1, "medium": 2, "heavy": 4}
        cpu_request = tier_map.get(job.get("cpuTier"), 1)

    ram_request_gb = job.get("ram_request_gb")
    if ram_request_gb is None:
        tier_map = {"gb8": 4, "gb16": 8, "gb32": 16, "gb64": 32}
        ram_request_gb = tier_map.get(job.get("memoryTier"), 4)

    cpu_alloc = max(min(cpu_request, resources["cpu"]["usable_cores"]), MIN_VIABLE_CPU_CORES)
    ram_alloc = max(min(ram_request_gb, resources["ram"]["usable_gb"]), MIN_VIABLE_RAM_GB)

    gpu_alloc = None
    # `gpu_required` is a bool on the normalised manifest, so `is not None` was
    # true even for CPU jobs: they were handed a GPU, and because GPU jobs skip
    # gVisor, every job on a GPU machine silently ran under runc.
    gpu_required = bool(job.get("gpu_required"))

    if gpu_required and resources.get("gpu"):
        gpu = resources["gpu"]

        vram_map = {
            "gb8": 8000,
            "gb12": 12000,
            "gb16": 16000,
            "gb24": 24000,
            "gb32": 32000,
            "gb48": 48000,
        }

        # The manifest carries gpu_vram_mb; gpuMemoryTier is the raw backend
        # field and is only present when a raw job dict is passed in.
        needed_mb = job.get("gpu_vram_mb") or vram_map.get(job.get("gpuMemoryTier"), 2000)
        if gpu["vram_total_mb"] + 64 >= needed_mb:
            print("[DEBUG] needed_mb =", needed_mb)
            print("[DEBUG] threshold  =", needed_mb + GPU_VRAM_HEADROOM_MB)
            gpu_alloc = {"device": 0, "vram_mb": needed_mb}    
        else:
            print(f"insufficient_vram: free={gpu['vram_free_mb']} need={needed_mb}")    
    return {
        "cpu": round(cpu_alloc, 1),
        "ram_gb": round(ram_alloc, 1),
        "gpu": gpu_alloc,
    }


def is_viable(allocation, job):
    if allocation["cpu"] < MIN_VIABLE_CPU_CORES:
        return False, "Not enough CPU available right now"
    if allocation["ram_gb"] < MIN_VIABLE_RAM_GB:
        return False, "Not enough RAM available right now"
    
    # The job dict here is the normalised manifest built in agent.py, which
    # exposes "gpu_required" — "gpuMemoryTier" is the raw backend field and is
    # never present, so this check used to be dead and a GPU job landing on a
    # GPU-less machine failed outright instead of being deferred back to queued.
    gpu_required = bool(job.get("gpu_required")) or job.get("gpuMemoryTier") is not None
    if gpu_required and allocation["gpu"] is None:
        return False, "GPU required but not available or insufficient VRAM"
    return True, None

def find_data_file(data_input_dir):
    """Find the primary data file after Kaggle extraction."""
    for root, _, files in os.walk(data_input_dir):
        for f in files:
            if f.endswith((".csv", ".parquet", ".json", ".xlsx")):
                return os.path.join(root, f)
    return data_input_dir   # fallback to directory if no file found


# in docker_runner.py, for ml_notebook jobs,
# prepend a parameters cell to the notebook before papermill runs
def inject_parameters_cell(notebook_path_host, params: dict):
    """
    If the notebook has no 'parameters' tagged cell,
    inject one at position 0 with the given params.
    Modifies the notebook file in-place (it's in the repo copy, read-only mount won't work).
    """
    import json
    
    with open(notebook_path_host) as f:
        nb = json.load(f)
    
    # check if parameters cell already exists
    has_params = any(
        "parameters" in cell.get("metadata", {}).get("tags", [])
        for cell in nb.get("cells", [])
    )
    
    if has_params:
        return  # nothing to do
    
    # build the parameters cell source
    source = "\n".join(f"{k} = {v!r}" for k, v in params.items())
    
    params_cell = {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {"tags": ["parameters"]},
        "outputs": [],
        "source": source,
    }
    
    nb["cells"].insert(0, params_cell)
    
    with open(notebook_path_host, "w") as f:
        json.dump(nb, f)
    
    print(f"  [Papermill] Injected parameters cell into notebook")


def pull_image(image):
    print(f"  Pulling image {image}...", end=" ")
    result = subprocess.run(
        ["docker", "pull", image],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"docker pull failed:\n{result.stderr}")
    print("OK")


def run_setup_phase(job, workspace, dep_volume_name, image):
    repo_dir = os.path.join(workspace, "repo")
    req_path = os.path.join(repo_dir, "requirements.txt")
    
    if not os.path.exists(req_path):
        return False
    
    print("  [Setup] Installing user dependencies...")
    cmd = [
        "docker", "run", "--rm",
        "--network", "bridge",        # internet only during install
        "--name", f"setup_{job['job_id']}",
        "--entrypoint", "",           # override entrypoint to safely run pip
        "-v", f"{workspace}/repo:/workspace/repo:ro",
        "-v", f"{dep_volume_name}:/workspace/deps",
        image,
        "python3", "-m", "pip", "install",
        "-r", "/workspace/repo/requirements.txt",
        "--target", "/workspace/deps",
        "--no-cache-dir",
        "--quiet"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"Dependency install failed:\n{result.stderr}")
    
    print("  [Setup] Dependencies installed OK")
    return True


def select_runtime(allocation, gvisor_available=True):
    """
    Pick the container runtime and describe the isolation it provides.

    GPU jobs use runc because gVisor cannot pass through the NVIDIA runtime
    (see DECISIONS.md, "gVisor vs GPU Exception"). Otherwise gVisor is used
    when Docker actually has it registered — asking for `--runtime runsc` on a
    host without it fails the container outright, which is what happened before
    this check existed.
    """
    if allocation.get("gpu"):
        return "runc", "GPU job — using standard runc runtime"
    if gvisor_available:
        return "runsc", "Using gVisor (runsc) sandbox"
    return "runc", "gVisor unavailable — falling back to runc (weaker isolation)"


def build_command(job, workspace, allocation, dep_volume=None, gvisor_available=True):
    config         = get_image_config(job)
    image          = config["resolved_image"]
    network        = config["network"]
    container_name = f"gridnode_job_{job['job_id']}"

    runtime, isolation_note = select_runtime(allocation, gvisor_available)
    print(f"  [Security] {isolation_note}")

    cmd = [
        "docker", "run",
        "-d",
        "--runtime", runtime,
        "--name",        container_name,
        f"--cpus={allocation['cpu']}",
        f"--memory={allocation['ram_gb']}g",
        "--memory-swap", f"{allocation['ram_gb']}g",
        "--network",     network,
        "--pids-limit",  "512",
        "--security-opt", "no-new-privileges",
        # "-v", f"{workspace}/repo:/workspace/repo:ro",
        "-v", f"{workspace}/repo_writable:/workspace/repo:ro",
        "-v", f"{workspace}/data/input:/workspace/data:ro",
        "-v", f"{workspace}/outputs:/workspace/outputs",
        "-v", f"{workspace}/logs:/workspace/logs",
    ]

    if allocation.get("gpu"):
        cmd += ["--gpus", "all"]        
    if dep_volume:
        cmd += ["-v", f"{dep_volume}:/workspace/deps:ro"]
        cmd += ["-e", "PYTHONPATH=/workspace/deps"]

    # job-type-specific entrypoints
    entrypoint_args = build_entrypoint(job, workspace, config)
    cmd += [image] + entrypoint_args

    return cmd, container_name


def build_entrypoint(job, workspace, config):
    job_type = job["type"]

    if job_type == "ml_notebook":
        data_input_dir = os.path.join(workspace, "data", "input")
        data_file_host = find_data_file(data_input_dir)
        # translate host path to container path
        # host: /home/siddhant/.computeshare/workspaces/job_X/data/input/file.csv
        # container: /workspace/data/file.csv
        data_file_container = "/workspace/data/" + os.path.basename(data_file_host)
    
        return [
            "papermill",
            f"/workspace/repo/{job['notebook_path']}",
            "/workspace/outputs/executed.ipynb",
            "-p", "DATA_PATH",   data_file_container,
            "-p", "OUTPUT_DIR",  "/workspace/outputs",
            "--cwd",             "/workspace/repo",
            "--log-output",
        ]

    if job_type == "video_render":
        # command is a validated FFmpeg string from the job manifest
        command = job.get("command")
        if not command:
            raise ValueError("video_render job has no command to run")
        return ["bash", "-c", command]

    if job_type == "server_run":
        #?? to be looked into ----------------------------------------------
        return ["bash", "/workspace/repo/start.sh"]                 
        # runs a startup script from the repo

    if job_type == "data_processing":
        notebook_path = job.get("notebook_path") or job.get("script_path") or ""
        return [
            f"/workspace/repo/{notebook_path}",
            "--data-dir",   "/workspace/data",
            "--output-dir", "/workspace/outputs",
        ]

    raise ValueError(f"No entrypoint defined for job type: {job_type}")


def stop_container(container_name):
    subprocess.run(
        ["docker", "stop", "--time", "5", container_name],
        capture_output=True
    )
    subprocess.run(
        ["docker", "rm", container_name],
        capture_output=True
    )


def cleanup_leftover_containers():
    print("Cleaning up leftover gridnode containers...")
    try:
        res = subprocess.run(
            ["docker", "ps", "-a", "--filter", "name=gridnode_job_", "--format", "{{.Names}}"],
            capture_output=True,
            text=True
        )
        if res.returncode == 0:
            containers = [c.strip() for c in res.stdout.splitlines() if c.strip().startswith("gridnode_job_")]
            for container in containers:
                print(f"Force removing leftover container: {container}")
                subprocess.run(["docker", "rm", "-f", container], capture_output=True)
    except Exception as e:
        print(f"Error cleaning up leftover containers: {e}")


def remove_volume(volume_name):
    if volume_name:
        subprocess.run(["docker", "volume", "rm", volume_name], capture_output=True)


def cleanup_leftover_volumes():
    try:
        res = subprocess.run(
            ["docker", "volume", "ls", "-q", "--filter", "name=deps_"],
            capture_output=True, text=True
        )
        if res.returncode == 0:
            names = res.stdout.strip().split()
            for name in names:
                subprocess.run(["docker", "volume", "rm", name], capture_output=True)
    except Exception as e:
        print(f"  [Startup Cleanup] Error cleaning up leftover volumes: {e}")


class DetachedContainerProcess:
    def __init__(self, log_process, wait_process, container_name):
        self.log_process = log_process
        self.wait_process = wait_process
        self.container_name = container_name
        self.stdout = log_process.stdout
        self.stderr = log_process.stderr
        self._exit_code = None

    @property
    def returncode(self):
        return self._exit_code

    def poll(self):
        if self._exit_code is not None:
            return self._exit_code
        
        status = self.wait_process.poll()
        if status is not None:
            try:
                out, _ = self.wait_process.communicate()
                self._exit_code = int(out.strip())
            except Exception:
                self._exit_code = self.wait_process.returncode or 0
            
            try:
                self.log_process.wait(timeout=1)
            except Exception:
                pass

            stop_container(self.container_name)
            return self._exit_code
        return None

    def wait(self, timeout=None):
        if self._exit_code is not None:
            return self._exit_code

        try:
            out, _ = self.wait_process.communicate(timeout=timeout)
            try:
                self._exit_code = int(out.strip())
            except Exception:
                self._exit_code = self.wait_process.returncode or 0
        except subprocess.TimeoutExpired:
            raise
        except Exception:
            self._exit_code = self.wait_process.returncode or 0

        try:
            self.log_process.wait(timeout=1)
        except Exception:
            pass

        stop_container(self.container_name)
        return self._exit_code

    def communicate(self, input=None, timeout=None):
        log_out, log_err = self.log_process.communicate(input=input, timeout=timeout)

        if self._exit_code is None:
            try:
                out, _ = self.wait_process.communicate(timeout=timeout)
                try:
                    self._exit_code = int(out.strip())
                except Exception:
                    self._exit_code = self.wait_process.returncode or 0
            except Exception:
                pass

        stop_container(self.container_name)
        return log_out, log_err

    def terminate(self):
        stop_container(self.container_name)
        try:
            self.log_process.terminate()
        except Exception:
            pass
        try:
            self.wait_process.terminate()
        except Exception:
            pass

    def kill(self):
        stop_container(self.container_name)
        try:
            self.log_process.kill()
        except Exception:
            pass
        try:
            self.wait_process.kill()
        except Exception:
            pass


def run(job, workspace, allocation, gvisor_available=True):
    config = get_image_config(job)
    image = config["resolved_image"]
    
    pull_image(image)

    dep_volume = f"deps_{job['job_id']}"
    repo_dir = os.path.join(workspace, "repo")
    req_path = os.path.join(repo_dir, "requirements.txt")
    has_deps = os.path.exists(req_path)

    try:
        if has_deps:
            subprocess.run(["docker", "volume", "create", dep_volume], check=True)
            success = run_setup_phase(job, workspace, dep_volume, image)
            if not success:
                has_deps = False

        cmd, container_name = build_command(
            job, workspace, allocation, dep_volume if has_deps else None, gvisor_available
        )
        
        print(f"\n  Image   : {image}")
        print(f"  Network : {config['network']}")
        print(f"  Command : {' '.join(shlex.quote(c) for c in cmd)}\n")

        # Synchronously run docker run -d
        run_res = subprocess.run(
            cmd,
            capture_output=True,
            text=True
        )
        if run_res.returncode != 0:
            raise RuntimeError(f"docker run -d failed:\n{run_res.stderr}")

        # Start wait process
        wait_process = subprocess.Popen(
            ["docker", "wait", container_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Start logs process
        log_process = subprocess.Popen(
            ["docker", "logs", "-f", container_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            bufsize=1
        )

        process = DetachedContainerProcess(log_process, wait_process, container_name)
        return process, container_name, dep_volume if has_deps else None

    except Exception:
        if has_deps:
            subprocess.run(["docker", "volume", "rm", dep_volume], capture_output=True)
        raise
