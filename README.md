# JURUS Level 1 Analyst: University Research Collaboration Portal

![Security Status](https://img.shields.io/badge/Security-OWASP_Compliant-success.svg)
![Platform](https://img.shields.io/badge/Platform-Node.js%20%7C%20SQLite%20%7C%20Ubuntu-blue.svg)

## 📌 Project Overview
This project is a secure web-based application designed for the **National Public University Consortium**. It serves as a centralized Research Collaboration Portal where academic staff, researchers, and external industry partners can securely upload and manage research proposals.

This repository was developed to fulfill the requirements of the **Jurutera Siber rawSEC (JURUS) Program - Level 1 Analyst Competency**. The system integrates deep cybersecurity hardening measures spanning from the OS level (Ubuntu) down to the application logic (Node.js).

---

## 🛡️ Cyber Security Hardening & Mitigations
This application has been engineered to withstand common web vulnerabilities based on the **OWASP Top 10** standards:

*   **SQL Injection (SQLi) Prevention:** Strict implementation of Parameterized Queries (`db.run(..., [var])`).
*   **Cross-Site Scripting (XSS) Protection:** Global `escapeHTML()` sanitization applied to all dynamic DOM outputs.
*   **Brute-Force & Session Fixation:** Implemented Rate-Limiting middleware and secure rolling sessions (HTTPOnly, SameSite strict).
*   **Cross-Site Request Forgery (CSRF):** Cryptographically secure `X-CSRF-Token` mandated for all state-changing POST requests.
*   **Secure File Uploads (RCE Prevention):** Enforces strict MIME-type checking (.pdf, .doc, .zip) and utilizes `crypto.randomUUID()` to anonymize file names and prevent Directory Traversal attacks.
*   **Information Leakage Prevention:** Application runs in `NODE_ENV=production` utilizing custom `4xx` and `5xx` error pages to suppress sensitive server stack traces.

---

## 🛠️ Technology Stack
*   **Backend:** Node.js, Express.js
*   **Database:** SQLite3 (Embedded & Encrypted locally)
*   **Frontend:** HTML5, Vanilla JavaScript, CSS3 (Glassmorphism UI)
*   **Infrastructure (Production):** Ubuntu Server 24.04 LTS, UFW Firewall, Fail2ban, Cloudflare Tunnels

---

## 🚀 Installation & Setup Instructions

### Option A: Running on Windows (Development)
1. Clone this repository: `git clone https://github.com/daus-Onn/JURUS-University-Portal.git`
2. Navigate to the app directory: `cd JURUS-University-Portal/app`
3. Install dependencies: `npm install`
4. Start the server: `npm start`
5. Open browser: `http://localhost:3000`

### Option B: Running on Ubuntu Server (Production Demo)
1. Transfer the source code to your Ubuntu VM.
2. Install Node.js: `sudo apt update && sudo apt install nodejs npm -y`
3. Delete the Windows-compiled `node_modules` folder (if copied).
4. Run `npm install` to recompile native C++ binaries (like bcrypt & sqlite3) for Linux.
5. Start the server: `npm start`
6. (Optional) Run Cloudflare Tunnel to expose the portal globally:
   ```bash
   chmod +x cloudflared-linux-amd64
   ./cloudflared-linux-amd64 tunnel --url http://localhost:3000
   ```

---

## 🔑 Default Seed Accounts
Upon the first initialization, the SQLite database automatically seeds the following Role-Based Access Control (RBAC) accounts for testing:

| Role | Username | Password |
| :--- | :--- | :--- |
| **System Admin** | `admin` | `SecureAdminPass123!` |
| **Researcher 1** | `dr_najwadi` | `ResearcherPass123!` |
| **Researcher 2** | `dr_ahmad` | `ResearcherPass123!` |
| **Collaborator** | `azri_collaborate` | `CollaboratorPass123!` |

*(Note: The Admin account is strictly restricted from uploading proposals via the `/api/proposals` endpoint, demonstrating strict API-level authorization controls).*

---

## 📑 Delivery Documentation
The complete Threat Modeling, Network Diagrams, BCP/DR plans, and ASVS Checklists can be found in the accompanying technical report located in the root directory:
*   `JURUS_University_Portal_Report_FINAL.docx`
*   `JURUS_University_Portal_Report.md`

---
*Developed for JURUS Cyber Engineering Challenge 2026.*
