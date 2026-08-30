#!/bin/bash
set -e

echo "Installing GridNode Compute Agent..."

# Install gVisor (runsc) if not present
if ! command -v runsc &> /dev/null; then
    echo "Installing gVisor..."
    URL="https://storage.googleapis.com/gvisor/releases/release/latest/x86_64"
    curl -sSL --retry 5 "$URL/runsc" -o /usr/local/bin/runsc
    chmod a+rx /usr/local/bin/runsc
fi

# Ensure docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is required but not installed. Please install Docker first."
    exit 1
fi

# Create unprivileged system user for the agent
echo "Creating computeshare system user..."
if ! id "computeshare" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin computeshare
fi

# IMPORTANT SECURITY CAVEAT: 
# The agent requires access to the Docker daemon to spawn jobs.
# Adding the computeshare user to the docker group effectively grants it root-equivalent privileges.
# This violates strict least-privilege, but is required until rootless Docker or a proxy is used.
usermod -aG docker computeshare

# Install Agent Binary
mkdir -p /opt/computeshare
# (Assuming the binary is downloaded or copied here during an actual install step)
cp computeshare-agent /opt/computeshare/
chown -R computeshare:computeshare /opt/computeshare
chmod +x /opt/computeshare/computeshare-agent

# Create systemd service
cat << 'UNIT' > /etc/systemd/system/computeshare-agent.service
[Unit]
Description=GridNode Compute Agent
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=computeshare
Group=computeshare
ExecStart=/opt/computeshare/computeshare-agent
Restart=always
RestartSec=5
WorkingDirectory=/opt/computeshare

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable computeshare-agent
systemctl restart computeshare-agent

echo "Installation complete."
