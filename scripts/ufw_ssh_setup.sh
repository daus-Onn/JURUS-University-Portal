#!/bin/bash
# ==============================================================================
# JURUS Level 1 (Analyst) - Domain 2: Network Security
# Network & SSH Hardening Automation Script (Target: Ubuntu Server 24.04 LTS)
# ==============================================================================

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run this script as root (sudo)."
  exit 1
fi

echo "[+] Starting Network and SSH Daemon hardening..."

# 1. Enforce SSH Daemon Restrictions
SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_CONFIG_D="/etc/ssh/sshd_config.d/jurus_ssh_hardening.conf"

echo "[+] Configuring SSH parameters..."
# Create configuration file override
cat <<EOF > "$SSHD_CONFIG_D"
# JURUS Custom SSH Hardening policy
Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
EOF

# Verify syntax of config files
sshd -t
if [ $? -eq 0 ]; then
  echo "[+] SSH configurations verified. Restarting sshd service..."
  systemctl restart sshd
else
  echo "[-] SSH configuration validation failed! Restoring backup..."
  rm "$SSHD_CONFIG_D"
fi

# 2. Host Firewall Configuration (UFW)
echo "[+] Initializing UFW host firewall..."
# Reset to factory default
ufw --force reset

# Set default policies (Default Deny Incoming, Default Allow Outgoing)
ufw default deny incoming
ufw default allow outgoing

# Open required web services
ufw allow 80/tcp comment 'Allow HTTP'
ufw allow 443/tcp comment 'Allow HTTPS (TLS 1.3)'

# Open custom hardened SSH Port
ufw allow 2222/tcp comment 'Allow custom SSH access'

# Enable firewall
ufw --force enable

# Show status
ufw status verbose

echo "[+] Domain 2: Network Security Hardening Completed."
