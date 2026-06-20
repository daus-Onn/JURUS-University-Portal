#!/bin/bash
# ==============================================================================
# JURUS Level 1 (Analyst) - Domain 6: Business Resiliency
# Automated Encrypted Backup Script (Target: Ubuntu Server 24.04 LTS)
# ==============================================================================

# Directories
APP_DIR="/var/www/jurus-portal/app"
BACKUP_DIR="/backups"
LOG_FILE="/var/log/jurus_backup.log"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Backup encryption passphrase (In production, load this from a secure vault or HSM)
PASSPHRASE="JurusSecureBackupPass2026!"

# Ensure backups directory exists
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[+] Starting automated backup at $(date)" >> "$LOG_FILE"

# 1. Database Dump (Export DB)
echo "[+] Dumping databases..." >> "$LOG_FILE"
TEMP_DB_DUMP="/tmp/db_dump_${TIMESTAMP}.sql"

# Check if application uses PostgreSQL or SQLite and dump
if command -v pg_dump &> /dev/null; then
  # PostgreSQL Dump (Production)
  PGPASSWORD="SecureAppConnectionP@ss1!" pg_dump -U jurus_app_user -h 127.0.0.1 jurus_university_db > "$TEMP_DB_DUMP" 2>> "$LOG_FILE"
else
  # SQLite Backup (Local development mode)
  if [ -f "${APP_DIR}/jurus_portal.db" ]; then
    sqlite3 "${APP_DIR}/jurus_portal.db" ".backup '$TEMP_DB_DUMP'" 2>> "$LOG_FILE"
  else
    echo "[-] Database file not found in ${APP_DIR}!" >> "$LOG_FILE"
    exit 1
  fi
fi

# 2. Compress Database Dump and User Uploaded Documents
echo "[+] Compressing database and uploaded documents..." >> "$LOG_FILE"
TEMP_ARCHIVE="/tmp/jurus_backup_${TIMESTAMP}.tar.gz"
tar -czf "$TEMP_ARCHIVE" -C "$APP_DIR" uploads -C /tmp "db_dump_${TIMESTAMP}.sql" 2>> "$LOG_FILE"

# Cleanup temporary uncompressed SQL file
rm -f "$TEMP_DB_DUMP"

# 3. Encrypt Archive using AES-256 Symmetric Encryption (GPG)
echo "[+] Encrypting backup archive..." >> "$LOG_FILE"
FINAL_ENC_FILE="${BACKUP_DIR}/jurus_backup_${TIMESTAMP}.tar.gz.gpg"

echo "$PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 --symmetric --cipher-algo AES256 -o "$FINAL_ENC_FILE" "$TEMP_ARCHIVE" 2>> "$LOG_FILE"

if [ $? -eq 0 ]; then
  echo "[+] Backup successfully completed, encrypted, and saved: ${FINAL_ENC_FILE}" >> "$LOG_FILE"
  # Keep only the last 7 days of backups to prevent disk depletion
  find "$BACKUP_DIR" -name "jurus_backup_*.gpg" -mtime +7 -exec rm -f {} \;
else
  echo "[-] Backup encryption failed!" >> "$LOG_FILE"
  rm -f "$FINAL_ENC_FILE"
fi

# Cleanup temp archive
rm -f "$TEMP_ARCHIVE"

echo "[+] Backup script finished." >> "$LOG_FILE"

# ==============================================================================
# CRON JOB AUTOMATION (Daily at 00:00 midnight)
# ==============================================================================
# To configure this backup script to execute automatically, run:
# sudo crontab -e
#
# Add the following entry to the bottom:
# 0 0 * * * /bin/bash /var/www/jurus-portal/scripts/backup.sh >/dev/null 2>&1
# ==============================================================================
