"""
Agent state: where it lives, and how it is read and written.

The state root is resolved from the environment, never from __file__. Deriving
it from the module path meant the location changed with the packaging method —
the repo for a git checkout, site-packages for a pip install, and the
PyInstaller extraction directory (so, in practice, /tmp) for the frozen binary
the systemd service runs.
"""

import os
import json

DEFAULT_BACKEND_URL = "http://localhost:3005"


def state_root():
    """
    COMPUTESHARE_HOME  ->  $STATE_DIRECTORY (set by systemd)  ->  ~/.computeshare

    systemd's StateDirectory= creates the directory with the right ownership
    before the service starts, which is why it is preferred over the home
    directory of a --no-create-home service user.
    """
    explicit = os.environ.get("COMPUTESHARE_HOME")
    if explicit:
        return os.path.abspath(explicit)

    # systemd may hand over a colon-separated list; the first entry is ours.
    state_dir = os.environ.get("STATE_DIRECTORY")
    if state_dir:
        return os.path.abspath(state_dir.split(":")[0])

    return os.path.expanduser("~/.computeshare")


def config_file():
    return os.path.join(state_root(), "config.json")


def workspace_root():
    return os.environ.get(
        "COMPUTESHARE_WORKSPACE_ROOT", os.path.join(state_root(), "workspaces")
    )


def backend_url():
    return os.environ.get("COMPUTESHARE_BACKEND_URL", DEFAULT_BACKEND_URL)


def token():
    """Registration token, so systemd can supply it via EnvironmentFile rather
    than an ExecStart argument visible in `ps` and the journal."""
    return os.environ.get("COMPUTESHARE_TOKEN") or None


def require_gvisor():
    return os.environ.get("COMPUTESHARE_REQUIRE_GVISOR", "").lower() == "true"


def load():
    path = config_file()
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def save(data):
    """The config holds the agent's bearer token, so it is written 0600 rather
    than inheriting the process umask."""
    root = state_root()
    os.makedirs(root, mode=0o700, exist_ok=True)
    path = config_file()

    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
    os.chmod(path, 0o600)


def clear():
    path = config_file()
    if os.path.exists(path):
        os.remove(path)
