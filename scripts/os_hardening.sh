#!/bin/bash
# ==============================================================================
# JURUS Level 1 (Analyst) - Domain 1: System Engineering
# OS Hardening Automation Script (Target: Ubuntu Server 24.04 LTS)
# ==============================================================================

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run this script as root (sudo)."
  exit 1
fi

echo "[+] Starting OS Hardening process..."

# 1. Enforce Password Complexity (login.defs & PAM)
echo "[+] Configuring password complexity and lifetime policies..."
# Edit /etc/login.defs for age restrictions
sed -i 's/PASS_MAX_DAYS\t99999/PASS_MAX_DAYS\t90/g' /etc/login.defs
sed -i 's/PASS_MIN_DAYS\t0/PASS_MIN_DAYS\t7/g' /etc/login.defs
sed -i 's/PASS_WARN_AGE\t7/PASS_WARN_AGE\t7/g' /etc/login.defs

# Install PAM quality module
apt-get update && apt-get install -y libpam-pwquality

# Edit /etc/pam.d/common-password to require strong passwords
# - Minimum 12 characters, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character
PAM_PW_FILE="/etc/pam.d/common-password"
if ! grep -q "pam_pwquality.so" "$PAM_PW_FILE"; then
  # Insert configuration before standard pam_unix.so
  sed -i '/pam_unix.so/i password requisite pam_pwquality.so retry=3 minlen=12 ucredit=-1 lcredit=-1 dcredit=-1 ocredit=-1 enforce_for_root' "$PAM_PW_FILE"
else
  # Update existing quality line
  sed -i 's/password.*requisite.*pam_pwquality.so.*/password requisite pam_pwquality.so retry=3 minlen=12 ucredit=-1 lcredit=-1 dcredit=-1 ocredit=-1 enforce_for_root/g' "$PAM_PW_FILE"
fi

# 2. Configure Account Lockout Policy (pam_faillock)
echo "[+] Enforcing account lockout policies (5 failed attempts locks for 15 mins)..."
PAM_AUTH_FILE="/etc/pam.d/common-auth"
if ! grep -q "pam_faillock.so" "$PAM_AUTH_FILE"; then
  # Prepend lockout rules to pam config
  sed -i '1s/^/auth required pam_faillock.so preauth silent audit deny=5 unlock_time=900\n/' "$PAM_AUTH_FILE"
  sed -i '/pam_unix.so/a auth [default=die] pam_faillock.so authfail audit deny=5 unlock_time=900' "$PAM_AUTH_FILE"
  sed -i '/pam_unix.so/i auth sufficient pam_faillock.so authsucc guilt=5' "$PAM_AUTH_FILE"
fi

# 3. Secure Sudoers Configuration
echo "[+] Enforcing secure sudoer policies..."
# Enforce password entry for sudo and timeout in 5 minutes
SUDOERS_CONF="/etc/sudoers.d/jurus_sudo_policy"
echo "Defaults env_reset" > "$SUDOERS_CONF"
echo "Defaults passwd_timeout=1" >> "$SUDOERS_CONF"
echo "Defaults timestamp_timeout=5" >> "$SUDOERS_CONF"
chmod 440 "$SUDOERS_CONF"

# 4. Turn Off Unused/Insecure Legacy Services
echo "[+] Disabling unnecessary system services..."
SERVICES_TO_DISABLE=("avahi-daemon" "cups" "rpcbind" "nis")
for service in "${SERVICES_TO_DISABLE[@]}"; do
  if systemctl is-active --quiet "$service"; then
    echo "    Stopping and disabling $service..."
    systemctl stop "$service"
    systemctl disable "$service"
  fi
done

# 5. Core Dump Disabling
echo "[+] Disabling core dumps to prevent memory/credential leaks..."
echo "* hard core 0" >> /etc/security/limits.conf
echo "fs.suid_dumpable = 0" >> /etc/sysctl.conf
sysctl -p

echo "[+] Domain 1: OS Hardening Completed successfully."
