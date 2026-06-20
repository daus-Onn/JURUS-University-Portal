const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'jurus_portal.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // 1. Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'researcher', 'collaborator')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. Proposals Table
    db.run(`CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      uploaded_by INTEGER NOT NULL,
      file_path TEXT,
      file_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`);

    // 3. Documents Table
    db.run(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`);

    // 4. Collaboration Requests Table
    db.run(`CREATE TABLE IF NOT EXISTS collaboration_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )`);

    // 5. Announcements Table
    db.run(`CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // 6. Audit Logs Table
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Seed Data
    seedData();
  });
}

function seedData() {
  db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
    if (err) return console.error('Error counting users:', err.message);
    
    if (row.count === 0) {
      console.log('Seeding initial JURUS database data...');
      
      const adminPass = bcrypt.hashSync('SecureAdminPass123!', 10);
      const resPass1 = bcrypt.hashSync('ResearcherPass123!', 10);
      const resPass2 = bcrypt.hashSync('ResearcherPass123!', 10);
      const colPass1 = bcrypt.hashSync('CollaboratorPass123!', 10);

      // Seed Users
      db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['admin', adminPass, 'admin']);
      db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['dr_najwadi', resPass1, 'researcher']);
      db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['dr_ahmad', resPass2, 'researcher']);
      db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['azri_collaborate', colPass1, 'collaborator'], function() {
        
        // Seed Announcements
        db.run('INSERT INTO announcements (title, content, created_by) VALUES (?, ?, ?)', [
          'Welcome to JURUS Research Portal',
          'This platform supports the national research collaboration initiative. Please review the security and upload guidelines before sharing files.',
          1
        ]);
        db.run('INSERT INTO announcements (title, content, created_by) VALUES (?, ?, ?)', [
          'JURUS Cyber Challenge Phase 1 Launched',
          'The JURUS Level 1 Analyst challenge is now officially underway. Submissions must include full system architecture documentation and security hardening proof.',
          1
        ]);

        console.log('Database seeding completed successfully.');
      });
    }
  });
}

// Helper methods with Parameterized Queries to protect against SQL Injection (Domain 4 requirement)
module.exports = {
  db,
  
  // User Management
  getUserByUsername: (username, callback) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], callback);
  },
  
  getUserById: (id, callback) => {
    db.get('SELECT id, username, role, created_at FROM users WHERE id = ?', [id], callback);
  },
  
  createUser: (username, passwordHash, role, callback) => {
    db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [username, passwordHash, role], callback);
  },
  
  // Proposals
  createProposal: (title, description, userId, filePath, fileName, callback) => {
    db.run(
      'INSERT INTO proposals (title, description, uploaded_by, file_path, file_name, status) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, userId, filePath, fileName, 'pending'],
      function(err) {
        callback(err, this ? this.lastID : null);
      }
    );
  },
  
  getProposalsForUser: (userId, role, callback) => {
    if (role === 'admin') {
      db.all(
        `SELECT p.*, u.username as uploader 
         FROM proposals p 
         JOIN users u ON p.uploaded_by = u.id 
         ORDER BY p.created_at DESC`,
        [],
        callback
      );
    } else if (role === 'researcher') {
      db.all(
        `SELECT p.*, u.username as uploader 
         FROM proposals p 
         JOIN users u ON p.uploaded_by = u.id 
         WHERE p.status = 'approved'
         ORDER BY p.created_at DESC`,
        [],
        callback
      );
    } else { // collaborator
      db.all(
        `SELECT p.*, u.username as uploader 
         FROM proposals p 
         JOIN users u ON p.uploaded_by = u.id 
         WHERE p.status = 'approved'
         ORDER BY p.created_at DESC`,
        [],
        callback
      );
    }
  },

  updateProposalStatus: (id, status, callback) => {
    db.run('UPDATE proposals SET status = ? WHERE id = ?', [status, id], callback);
  },
  
  // Documents
  addDocument: (proposalId, name, filePath, userId, callback) => {
    db.run('INSERT INTO documents (proposal_id, name, file_path, uploaded_by) VALUES (?, ?, ?, ?)', [proposalId, name, filePath, userId], callback);
  },
  
  getDocumentsByProposal: (proposalId, callback) => {
    db.all('SELECT * FROM documents WHERE proposal_id = ? ORDER BY created_at DESC', [proposalId], callback);
  },
  
  // Collaboration Requests
  createCollaborationRequest: (proposalId, senderId, message, callback) => {
    db.run('INSERT INTO collaboration_requests (proposal_id, sender_id, message) VALUES (?, ?, ?)', [proposalId, senderId, message], callback);
  },
  
  getCollaborationRequestsByProposal: (proposalId, callback) => {
    db.all(
      `SELECT cr.*, u.username as sender 
       FROM collaboration_requests cr
       JOIN users u ON cr.sender_id = u.id
       WHERE cr.proposal_id = ?
       ORDER BY cr.created_at DESC`,
      [proposalId],
      callback
    );
  },
  
  getIncomingRequestsForUser: (userId, callback) => {
    db.all(
      `SELECT cr.*, p.title as proposal_title, u.username as sender
       FROM collaboration_requests cr
       JOIN proposals p ON cr.proposal_id = p.id
       JOIN users u ON cr.sender_id = u.id
       WHERE p.uploaded_by = ? AND cr.status = 'pending'
       ORDER BY cr.created_at DESC`,
      [userId],
      callback
    );
  },

  getAcceptedRequestsForUser: (userId, callback) => {
    db.all(
      `SELECT cr.*, p.title as proposal_title, u.username as collaborator
       FROM collaboration_requests cr
       JOIN proposals p ON cr.proposal_id = p.id
       JOIN users u ON cr.sender_id = u.id
       WHERE p.uploaded_by = ? AND cr.status = 'accepted'
       ORDER BY cr.created_at DESC`,
      [userId],
      callback
    );
  },

  getSentRequestsBySender: (senderId, callback) => {
    db.all(
      `SELECT cr.*, p.title as proposal_title, u.username as proposal_owner
       FROM collaboration_requests cr
       JOIN proposals p ON cr.proposal_id = p.id
       JOIN users u ON p.uploaded_by = u.id
       WHERE cr.sender_id = ?
       ORDER BY cr.created_at DESC`,
      [senderId],
      callback
    );
  },

  updateCollaborationStatus: (id, status, userId, role, callback) => {
    if (role === 'admin') {
      db.run('UPDATE collaboration_requests SET status = ? WHERE id = ?', [status, id], function(err) {
        if (err) return callback(err);
        if (this.changes === 0) return callback(new Error('Not found'));
        callback(null);
      });
    } else {
      db.run(
        `UPDATE collaboration_requests 
         SET status = ? 
         WHERE id = ? AND proposal_id IN (SELECT id FROM proposals WHERE uploaded_by = ?)`, 
        [status, id, userId], 
        function(err) {
          if (err) return callback(err);
          if (this.changes === 0) return callback(new Error('Unauthorized or not found'));
          callback(null);
        }
      );
    }
  },
  
  // Announcements
  createAnnouncement: (title, content, userId, callback) => {
    db.run('INSERT INTO announcements (title, content, created_by) VALUES (?, ?, ?)', [title, content, userId], callback);
  },
  
  getAnnouncements: (callback) => {
    db.all(
      `SELECT a.*, u.username as creator 
       FROM announcements a 
       JOIN users u ON a.created_by = u.id 
       ORDER BY a.created_at DESC`,
      [],
      callback
    );
  },
  
  // Audit Logging (Domain 5 requirement)
  logEvent: (userId, username, action, details, ipAddress, callback) => {
    db.run(
      'INSERT INTO audit_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId, username, action, details, ipAddress],
      callback
    );
  },
  
  getAuditLogs: (callback) => {
    db.all('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100', [], callback);
  }
};
