#!/bin/bash
# ==============================================================================
# JURUS Level 1 (Analyst) - Domain 5: Security Management & Monitoring
# Fail2ban Installation and Jail Configuration Automation Script
# ==============================================================================

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run this script as root (sudo)."
  exit 1
fi

echo "[+] Starting Security Monitoring Setup (Fail2ban & Rsyslog)..."

# 1. Install Fail2ban
echo "[+] Installing Fail2ban packages..."
apt-get update && apt-get install -y fail2ban iptables

# 2. Configure custom Nginx filter for failed logins
echo "[+] Setting up Nginx failed login filter..."
FILTER_FILE="/etc/fail2ban/filter.d/nginx-login-limit.conf"
cat <<EOF > "$FILTER_FILE"
[Definition]
# Scan nginx access logs for failed logins returning HTTP 400 Bad Request
failregex = ^<HOST> - - \[.*\] "POST /api/auth/login HTTP/.*" 400
ignoreregex =
EOF

# 3. Create jail.local configurations (Domain 5 rubric requirement)
echo "[+] Enforcing global jail parameters (maxretry=5, bantime=1h)..."
JAIL_LOCAL="/etc/fail2ban/jail.local"
cat <<EOF > "$JAIL_LOCAL"
[DEFAULT]
# Global parameters
bantime = 3600
findtime = 600
maxretry = 5
banaction = iptables-multiport
backend = auto

# Hardened SSH Jail
[sshd]
enabled = true
port = 2222
filter = sshd
logpath = /var/log/auth.log
maxretry = 5

# Custom Nginx API Login Jail
[nginx-login-limit]
enabled = true
port = http,https
filter = nginx-login-limit
logpath = /var/log/nginx/access.log
maxretry = 5
EOF

# 4. Enable and Restart Fail2ban service
echo "[+] Starting Fail2ban service..."
systemctl daemon-reload
systemctl enable fail2ban
systemctl restart fail2ban

# Verify service status
systemctl is-active --quiet fail2ban && echo "[+] Fail2ban is active."

# ==============================================================================
# RSYSLOG CONFIGURATION NOTE (Centralized Logging)
# ==============================================================================
# To stream system and security audit logs to a centralized collector (like a SIEM),
# configure rsyslog by adding the collector IP in /etc/rsyslog.conf:
#
# # Stream authorization logs and application logs to SIEM
# authpriv.*                       @10.0.99.50:514    # UDP protocol
# local7.*                         @@10.0.99.50:514   # TCP protocol
# ==============================================================================

echo "[+] Domain 5: Security Management & Monitoring configuration completed."
