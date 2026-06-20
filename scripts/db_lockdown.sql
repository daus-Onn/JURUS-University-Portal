-- ==============================================================================
-- JURUS Level 1 (Analyst) - Domain 3: Database & Data Security
-- Database Lockdown and Least Privilege Access Control Policy (PostgreSQL)
-- ==============================================================================

-- 1. Create Production Database and Revoke Default Privileges
CREATE DATABASE jurus_university_db;
\c jurus_university_db

-- Revoke all default privileges from public role on schema public
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 2. Define Table Schemas
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK(role IN ('admin', 'researcher', 'collaborator')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    uploaded_by INT NOT NULL,
    file_path VARCHAR(255),
    file_name VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    proposal_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    uploaded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE collaboration_requests (
    id SERIAL PRIMARY KEY,
    proposal_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT,
    username VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. Create Restricted Application Database User
CREATE USER jurus_app_user WITH PASSWORD 'SecureAppConnectionP@ss1!';

-- Grant connect privileges to user
GRANT CONNECT ON DATABASE jurus_university_db TO jurus_app_user;
GRANT USAGE ON SCHEMA public TO jurus_app_user;

-- 4. Apply Least Privilege Access Rights (Domain 3 Rubric check)
-- Limit to SELECT, INSERT, UPDATE only. Specifically deny DELETE command.
GRANT SELECT, INSERT, UPDATE ON TABLE users TO jurus_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE proposals TO jurus_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE documents TO jurus_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE collaboration_requests TO jurus_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE announcements TO jurus_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE audit_logs TO jurus_app_user;

-- Grant usage on SERIAL sequences so the application can increment primary keys
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jurus_app_user;

-- ==============================================================================
-- HOST ACCESS MANAGEMENT (pg_hba.conf Guidelines)
-- ==============================================================================
-- Access control must be configured in pg_hba.conf to reject remote network IP 
-- connection requests. Only allow local Unix sockets or localhost loopbacks.
--
-- Example configuration to append in /etc/postgresql/16/main/pg_hba.conf:
--
-- # TYPE  DATABASE            USER            ADDRESS                 METHOD
-- # Local Unix socket connections (default postgres client admin)
-- local   all                 postgres                                peer
-- # Local application connections restricted only to loopback
-- local   jurus_university_db jurus_app_user                          scram-sha-256
-- host    jurus_university_db jurus_app_user  127.0.0.1/32            scram-sha-256
-- host    jurus_university_db jurus_app_user  ::1/128                 scram-sha-256
-- # Block all other external connections
-- host    all                 all             0.0.0.0/0               reject
-- ==============================================================================
