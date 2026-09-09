"""
Container runtime selection. build_command used to hardcode `--runtime runsc`
for every non-GPU job, so on a host without gVisor registered every CPU job
failed with "unknown runtime: runsc".
"""

import sys
import unittest

sys.path.insert(0, ".")
from computeshare_agent.docker_runner import select_runtime, build_command

CPU_ALLOC = {"cpu": 2.0, "ram_gb": 4.0, "gpu": None}
GPU_ALLOC = {"cpu": 2.0, "ram_gb": 4.0, "gpu": {"index": 0}}

JOB = {
    "job_id": "job_sandbox",
    "type": "data_processing",
    "github_repo": "https://github.com/test/repo",
    "notebook_path": "run.py",
    "cpu_request": 2.0,
    "ram_request_gb": 4.0,
    "gpu_required": False,
    "timeout_seconds": 600,
}


class TestSelectRuntime(unittest.TestCase):
    def test_cpu_job_uses_gvisor_when_available(self):
        runtime, note = select_runtime(CPU_ALLOC, gvisor_available=True)
        self.assertEqual(runtime, "runsc")
        self.assertIn("gVisor", note)

    def test_cpu_job_falls_back_to_runc_when_gvisor_is_absent(self):
        runtime, note = select_runtime(CPU_ALLOC, gvisor_available=False)
        self.assertEqual(runtime, "runc")
        self.assertIn("weaker isolation", note)

    def test_gpu_job_always_uses_runc(self):
        # gVisor cannot pass through the NVIDIA runtime.
        for available in (True, False):
            runtime, _ = select_runtime(GPU_ALLOC, gvisor_available=available)
            self.assertEqual(runtime, "runc")


class TestBuildCommandRuntime(unittest.TestCase):
    def test_runsc_is_not_requested_when_unavailable(self):
        cmd, _ = build_command(JOB, "/tmp/ws", CPU_ALLOC, None, False)
        self.assertNotIn("runsc", cmd)
        self.assertIn("runc", cmd)

    def test_runsc_is_requested_when_available(self):
        cmd, _ = build_command(JOB, "/tmp/ws", CPU_ALLOC, None, True)
        self.assertIn("runsc", cmd)

    def test_hardening_flags_survive_the_fallback(self):
        cmd, _ = build_command(JOB, "/tmp/ws", CPU_ALLOC, None, False)
        cmd_str = " ".join(cmd)
        self.assertIn("--pids-limit", cmd_str)
        self.assertIn("no-new-privileges", cmd_str)
        self.assertIn("--cpus=", cmd_str)
        self.assertIn("--memory=", cmd_str)


class TestVideoRenderCommand(unittest.TestCase):
    def test_missing_command_is_a_clear_error(self):
        from computeshare_agent.docker_runner import build_entrypoint, get_image_config

        job = {**JOB, "type": "video_render", "command": ""}
        with self.assertRaises(ValueError):
            build_entrypoint(job, "/tmp/ws", get_image_config(job))

    def test_command_is_passed_through(self):
        from computeshare_agent.docker_runner import build_entrypoint, get_image_config

        job = {**JOB, "type": "video_render", "command": "ffmpeg -i in.mp4 out.mp4"}
        args = build_entrypoint(job, "/tmp/ws", get_image_config(job))
        self.assertEqual(args, ["bash", "-c", "ffmpeg -i in.mp4 out.mp4"])


if __name__ == "__main__":
    unittest.main()


class TestNormalisedManifest(unittest.TestCase):
    """The manifest is the contract between the backend payload and every
    consumer in docker_runner; a missing key surfaces as a KeyError mid-job."""

    def test_manifest_carries_every_key_its_consumers_read(self):
        from computeshare_agent.agent import normalise_job

        manifest = normalise_job({
            "id": "job_1",
            "type": "video_render",
            "repoUrl": "https://github.com/test/repo",
            "command": "ffmpeg -i in.mp4 out.mp4",
            "kaggleDatasetUrl": None,
            "cpuTier": "medium",
            "memoryTier": "gb16",
            "gpuMemoryTier": None,
            "estimatedDuration": "lt1h",
        })

        for key in (
            "job_id", "type", "github_repo", "notebook_path", "command",
            "dataset_url", "cpu_request", "ram_request_gb", "gpu_required",
            "gpu_vram_mb", "timeout_seconds",
        ):
            self.assertIn(key, manifest, f"manifest is missing {key!r}")

        self.assertEqual(manifest["command"], "ffmpeg -i in.mp4 out.mp4")
        self.assertEqual(manifest["cpu_request"], 4)
        self.assertEqual(manifest["ram_request_gb"], 16)
        self.assertFalse(manifest["gpu_required"])

    def test_gpu_requirement_is_derived_from_the_tier(self):
        from computeshare_agent.agent import normalise_job

        manifest = normalise_job({
            "id": "job_2",
            "type": "ml_notebook",
            "repoUrl": "https://github.com/test/repo",
            "command": "train.ipynb",
            "gpuMemoryTier": "gb16",
            "cpuTier": "light",
            "memoryTier": "gb8",
        })
        self.assertTrue(manifest["gpu_required"])
        self.assertEqual(manifest["gpu_vram_mb"], 16384)


class TestGpuAllocationGating(unittest.TestCase):
    """Regression: `gpu_required` is a bool, so `is not None` was true for CPU
    jobs. They were allocated a GPU, and since GPU jobs skip gVisor, every job
    on a GPU-equipped machine silently ran under runc."""

    RESOURCES = {
        "cpu": {"total_cores": 8, "free_cores": 6.0, "usable_cores": 5.0},
        "ram": {"total_gb": 16.0, "available_gb": 12.0, "usable_gb": 10.0},
        "gpu": {"name": "NVIDIA GeForce RTX 4060", "vram_total_mb": 8188, "vram_free_mb": 7956},
    }

    def test_cpu_job_gets_no_gpu_on_a_gpu_machine(self):
        from computeshare_agent.docker_runner import resolve_allocation

        alloc = resolve_allocation({**JOB, "gpu_required": False}, self.RESOURCES)
        self.assertIsNone(alloc["gpu"])

    def test_cpu_job_still_gets_the_sandbox_on_a_gpu_machine(self):
        from computeshare_agent.docker_runner import resolve_allocation

        alloc = resolve_allocation({**JOB, "gpu_required": False}, self.RESOURCES)
        runtime, _ = select_runtime(alloc, gvisor_available=True)
        self.assertEqual(runtime, "runsc")

    def test_gpu_job_is_allocated_the_gpu(self):
        from computeshare_agent.docker_runner import resolve_allocation

        alloc = resolve_allocation(
            {**JOB, "gpu_required": True, "gpu_vram_mb": 8192}, self.RESOURCES
        )
        self.assertIsNotNone(alloc["gpu"])
        self.assertEqual(alloc["gpu"]["vram_mb"], 8192)

    def test_gpu_job_is_refused_when_the_card_is_too_small(self):
        from computeshare_agent.docker_runner import resolve_allocation

        alloc = resolve_allocation(
            {**JOB, "gpu_required": True, "gpu_vram_mb": 49152}, self.RESOURCES
        )
        self.assertIsNone(alloc["gpu"])
