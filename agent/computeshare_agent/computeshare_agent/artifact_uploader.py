# After the job exits cleanly, scan the outputs/ folder and register artifact metadata to the backend.

import os
import requests


IGNORED_EXTENSIONS = {".tmp", ".part", ".lock"}
MAX_ARTIFACT_SIZE_MB = 500


def upload_all(job_id, workspace, backend_url, headers):
    outputs_dir = os.path.join(workspace, "outputs")
    uploaded = []
    failed = []

    if not os.path.exists(outputs_dir):
        print("  [WARN] outputs/ directory does not exist")
        return uploaded, failed

    files = [
        f for f in os.listdir(outputs_dir)
        if os.path.isfile(os.path.join(outputs_dir, f))
        and os.path.splitext(f)[1] not in IGNORED_EXTENSIONS
    ]

    if not files:
        print("  [WARN] No output files found in outputs/")
        return uploaded, failed

    for filename in files:
        filepath = os.path.join(outputs_dir, filename)
        size_bytes = os.path.getsize(filepath)
        size_mb = size_bytes / 1e6

        if size_mb > MAX_ARTIFACT_SIZE_MB:
            print(f"  [SKIP] {filename} ({size_mb:.1f} MB) exceeds limit")
            failed.append({"file": filename, "reason": "too large"})
            continue

        print(f"  Registering artifact {filename} ({size_mb:.1f} MB)...", end=" ")

        try:
            # Backend currently only handles metadata, not actual file storage
            payload = {
                "filename": filename,
                "storagePath": f"local://{job_id}/{filename}",
                "sizeBytes": size_bytes,
                "mimeType": "application/octet-stream" # basic fallback
            }
            resp = requests.post(
                f"{backend_url}/api/jobs/{job_id}/artifacts",
                json=payload,
                headers=headers,
                timeout=10
            )
            resp.raise_for_status()
            data = resp.json()
            uploaded.append({"file": filename, "id": data.get("id")})
            print("OK")

        except Exception as e:
            print(f"FAIL ({e})")
            failed.append({"file": filename, "reason": str(e)})

    return uploaded, failed
