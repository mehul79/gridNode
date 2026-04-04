# Prepares the working directory, clones the repo, and downloads the dataset or video file.

import os
import shutil
import subprocess
import requests
from tqdm import tqdm


def create(job_id):
    # Use current project directory to ensure permissions
    root = os.path.join(os.getcwd(), "workspaces")
    os.makedirs(root, exist_ok=True)
    base = os.path.join(root, f"job_{job_id}")
    for sub in ["repo", "data", "outputs", "logs"]:
        os.makedirs(os.path.join(base, sub), exist_ok=True)
    return base


def clone_repo(repo_url, workspace):
    target = os.path.join(workspace, "repo")
    print(f"  Preparing {repo_url}...", end=" ")

    if os.path.isdir(repo_url):
        # Support local folder for testing
        shutil.copytree(repo_url, target, dirs_exist_ok=True)
        print("OK (copied local)")
        return

    result = subprocess.run(
        ["git", "clone", "--depth", "1", repo_url, target],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"git clone failed: {result.stderr}")
    print("OK")


def download_file(url, workspace, filename):
    dest = os.path.join(workspace, "data", filename)
    print(f"  Downloading {filename}...")

    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        with open(dest, "wb") as f, tqdm(total=total, unit="B", unit_scale=True) as bar:
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)
                bar.update(len(chunk))

    print(f"  Saved to {dest}")
    return dest


def cleanup(workspace):
    if os.path.exists(workspace):
        shutil.rmtree(workspace)
        print(f"  Cleaned up {workspace}")