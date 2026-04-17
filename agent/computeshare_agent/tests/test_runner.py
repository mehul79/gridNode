import os
import shutil
import subprocess
from computeshare_agent import docker_runner

def setup_test_workspace():
    workspace = os.path.abspath("/tmp/test_workspace")
    if os.path.exists(workspace):
        shutil.rmtree(workspace)
    os.makedirs(os.path.join(workspace, "repo"))
    os.makedirs(os.path.join(workspace, "data", "input"))
    os.makedirs(os.path.join(workspace, "outputs"))
    os.makedirs(os.path.join(workspace, "logs"))

    # Write a requirements.txt file
    with open(os.path.join(workspace, "repo", "requirements.txt"), "w") as f:
        f.write("requests==2.31.0\n")
        f.write("cowsay==6.1\n") # Fun dependency to test

    # Write a test script
    with open(os.path.join(workspace, "repo", "test.py"), "w") as f:
        f.write("import requests\n")
        f.write("import cowsay\n")
        f.write("cowsay.cow('gVisor isolation & Dependencies loaded successfully!')\n")

    return workspace

def main():
    workspace = setup_test_workspace()
    job = {
        "job_id": "test_gvisor_e2e",
        "type": "data_processing",
        "script_path": "test.py",
        "gpu_required": False
    }
    allocation = {
        "cpu": 1.0,
        "ram_gb": 1.0,
        "gpu": None
    }
    dep_volume = None
    try:
        process, container, dep_volume = docker_runner.run(job, workspace, allocation)
        stdout, stderr = process.communicate()
        
        print("--- STDOUT ---")
        print(stdout)
        if stderr:
            print("--- STDERR ---")
            print(stderr)
        
        if "Dependencies loaded successfully!" in stdout:
            print("Test PASSED: The dependencies were installed and used inside the gVisor sandbox.")
        else:
            print("Test FAILED: The output did not contain the expected message.")
        
    except Exception as e:
        print(f"Test FAILED with exception: {e}")
    finally:
        # Cleanup volume
        if dep_volume:
            subprocess.run(["docker", "volume", "rm", dep_volume], check=False, capture_output=True)

if __name__ == "__main__":
    main()