#!/bin/bash
#
# Installs the GridNode compute agent as a systemd service.
# Run as root from the directory containing the built `computeshare-agent`
# binary (see build.sh).
#
set -euo pipefail

BINARY_NAME="computeshare-agent"
INSTALL_DIR="/opt/computeshare"
CONFIG_DIR="/etc/computeshare"
ENV_FILE="$CONFIG_DIR/agent.env"
GVISOR_URL="https://storage.googleapis.com/gvisor/releases/release/latest/x86_64"

echo "Installing GridNode Compute Agent..."

if [ "$(id -u)" -ne 0 ]; then
    echo "[ERROR] This installer must run as root (it creates a system user and a systemd unit)."
    echo "        Try: sudo ./install.sh"
    exit 1
fi

if [ ! -f "$BINARY_NAME" ]; then
    echo "[ERROR] '$BINARY_NAME' not found in $(pwd)."
    echo "        Build it first: ./build.sh"
    exit 1
fi

# --- Docker -----------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is required but not installed."
    echo "        Fix: https://docs.docker.com/get-docker/"
    exit 1
fi

# --- gVisor -----------------------------------------------------------------
# Downloading runsc is not enough: Docker only exposes a runtime named "runsc"
# once it is registered in daemon.json, which is what `runsc install` does.
# Without that step every CPU job falls back to runc.
if ! command -v runsc &> /dev/null; then
    echo "Installing gVisor..."
    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TMP_DIR"' EXIT

    curl -fsSL --retry 5 "$GVISOR_URL/runsc" -o "$TMP_DIR/runsc"
    curl -fsSL --retry 5 "$GVISOR_URL/runsc.sha512" -o "$TMP_DIR/runsc.sha512"

    # Verify before installing — this binary becomes part of the sandbox boundary.
    ( cd "$TMP_DIR" && sha512sum -c runsc.sha512 ) || {
        echo "[ERROR] gVisor checksum verification failed. Refusing to install."
        exit 1
    }

    install -m 0755 "$TMP_DIR/runsc" /usr/local/bin/runsc
fi

echo "Registering gVisor runtime with Docker..."
if runsc install; then
    systemctl restart docker
    sleep 2
else
    echo "[WARN] 'runsc install' failed."
fi

if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q runsc; then
    echo "  gVisor runtime registered."
else
    echo "[WARN] Docker does not report a 'runsc' runtime."
    echo "       The agent will run jobs under runc, which shares this host's kernel."
    echo "       Set COMPUTESHARE_REQUIRE_GVISOR=true in $ENV_FILE to refuse jobs instead."
fi

# --- Service user -----------------------------------------------------------
echo "Creating computeshare system user..."
if ! id "computeshare" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin computeshare
fi

# IMPORTANT SECURITY CAVEAT:
# The agent requires access to the Docker daemon to spawn jobs.
# Adding the computeshare user to the docker group effectively grants it root-equivalent privileges.
# This violates strict least-privilege, but is required until rootless Docker or a proxy is used.
usermod -aG docker computeshare

# --- Binary -----------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
install -o computeshare -g computeshare -m 0755 "$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"

# --- Configuration ----------------------------------------------------------
# The registration token is a secret, so it lives in a root-owned 0600 file
# rather than on the ExecStart line where `ps` and the journal would expose it.
mkdir -p "$CONFIG_DIR"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<'ENVFILE'
# GridNode agent configuration.
# COMPUTESHARE_TOKEN is the key from the dashboard's Machines page. It is only
# needed until the agent registers; after that the saved config takes over.
COMPUTESHARE_BACKEND_URL=http://localhost:3005
COMPUTESHARE_TOKEN=

# Refuse to run jobs at all if gVisor is unavailable, instead of falling back
# to runc with a warning.
COMPUTESHARE_REQUIRE_GVISOR=false
ENVFILE
    echo "Created $ENV_FILE — set COMPUTESHARE_TOKEN before starting the service."
fi
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

# --- systemd ----------------------------------------------------------------
# StateDirectory= makes systemd create and chown /var/lib/computeshare and
# export $STATE_DIRECTORY, which is where the agent stores its config and
# workspaces. The service user has no home directory, so this is what keeps
# state off the user's (nonexistent) ~.
cat > /etc/systemd/system/computeshare-agent.service <<'UNIT'
[Unit]
Description=GridNode Compute Agent
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

# These belong in [Unit]; systemd ignores them under [Service].
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=computeshare
Group=computeshare
SupplementaryGroups=docker
EnvironmentFile=-/etc/computeshare/agent.env
ExecStart=/opt/computeshare/computeshare-agent start
StateDirectory=computeshare
StateDirectoryMode=0700
WorkingDirectory=/var/lib/computeshare

# on-failure rather than always: an agent with no token exits deliberately, and
# should surface as a failed unit instead of restarting every 5s forever.
Restart=on-failure
RestartSec=10

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable computeshare-agent

if grep -q '^COMPUTESHARE_TOKEN=$' "$ENV_FILE"; then
    echo
    echo "Installation complete, service NOT started."
    echo "  1. Put your dashboard key in $ENV_FILE (COMPUTESHARE_TOKEN=...)"
    echo "  2. systemctl start computeshare-agent"
    echo "  3. journalctl -u computeshare-agent -f"
else
    systemctl restart computeshare-agent
    echo
    echo "Installation complete. Follow logs with:"
    echo "  journalctl -u computeshare-agent -f"
fi
