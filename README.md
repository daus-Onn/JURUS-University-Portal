# JURUS Level 1 (Analyst) - University Research Collaboration Portal

This repository contains the complete technical package and secure deployment solution for the JURUS Level 1 Competency Challenge.

---

## 1. How to Run the Web Application

The portal is built using a lightweight Node.js Express server and a local SQLite database, making it easy to run on any operating system (Windows, macOS, Linux) without requiring external database server dependencies.

### Prerequisites
- **Node.js** (v18.0.0 or higher recommended)

### Setup Instructions
1. Extract/unzip the project folder.
2. Open your terminal/command prompt and navigate to the `app/` folder:
   ```bash
   cd app
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open your web browser and navigate to:
   ```
   http://localhost:3000
   ```

### Pre-seeded Demo Accounts
- **Administrator:** `admin` / `SecureAdminPass123!` (Access to security audit logs, approve/reject proposals)
- **Researcher:** `dr_najwadi` / `ResearcherPass123!` (Submit new proposals, attach project docs, publish notices)
- **Collaborator:** `azri_collaborate` / `CollaboratorPass123!` (Submit collaboration partnership requests)

---

## 2. Project Directory Structure

```
JURUS/
├── README.md                       # Setup and submission guide
├── JURUS_University_Portal_Report.md # Main Technical Analyst Report (6 Domains)
├── app/                            # Web Application
│   ├── server.js                   # Secure Express API Server
│   ├── db.js                       # SQL injection protected SQLite connector
│   ├── package.json                # Dependencies configuration
│   └── public/                     # Apple-style Light Mode SPA UI
│       ├── index.html              # Main HTML markup
│       ├── style.css               # Clean Apple UI styling
│       └── app.js                  # Client-side router and form controllers
└── scripts/                        # OS & Security Hardening Templates
    ├── os_hardening.sh             # Domain 1: PAM controls, lockout & password policy
    ├── ufw_ssh_setup.sh            # Domain 2: SSH port 2222 & default-deny firewall
    ├── db_lockdown.sql             # Domain 3: PostgreSQL least-privilege SQL grants
    ├── nginx_secure.conf           # Domain 4: Nginx reverse proxy & security headers
    ├── fail2ban_setup.sh           # Domain 5: Fail2ban automated jail & monitoring
    ├── backup.sh                   # Domain 6: GPG encrypted automated backups
    └── restore.sh                  # Domain 6: Decryption & RTO metric log
```

---

## 3. Verifying the Security Configurations (6 Domains)

- **Domain 1 & 2 (OS/Network Hardening):** Review `scripts/os_hardening.sh` and `scripts/ufw_ssh_setup.sh`. These scripts are targeted for a Linux Ubuntu Server 24.04 LTS host.
- **Domain 3 (Database Security):** Review `scripts/db_lockdown.sql`. It contains standard PostgreSQL lockdown grants and `pg_hba.conf` connection restrictions.
- **Domain 4 (Application Security):** Review `scripts/nginx_secure.conf` for reverse proxy configurations. Safe file validation is handled directly in `app/server.js` via Multer filters.
- **Domain 5 (Security Monitoring):** Jails, filters, and failed login tracking patterns are detailed in `scripts/fail2ban_setup.sh`.
- **Domain 6 (Business Resiliency):** Backups are compressed and encrypted using AES-256 (GPG) via `scripts/backup.sh` and restored via `scripts/restore.sh`.
