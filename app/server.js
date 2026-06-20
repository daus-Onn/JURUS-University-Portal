require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const dbHelper = require('./db');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');


const app = express();
app.set('trust proxy', 1); // Enable if you're behind a reverse proxy (Nginx, Cloudflare Tunnel)

const PORT = process.env.PORT || 3000;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Global API Rate Limiter (Max 100 requests per 15 mins)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login Brute Force Limiter (Max 5 attempts per 15 mins)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global limiter to all /api/ routes EXCEPT login (which has its own stricter limiter)
app.use('/api/', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  apiLimiter(req, res, next);
});

// 1. Helmet Middlewares for security headers (Domain 4 requirement)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  },
  xFrameOptions: { action: "deny" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// Hide server banner (express default banner)
app.disable('x-powered-by');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSION_SECRET = process.env.SESSION_SECRET || 'jurus_super_secret_key_12345!';

// 2. Session Configuration with secure settings
app.use(session({
  name: 'jurus_session',
  secret: SESSION_SECRET,
  resave: true,
  rolling: true, // Reset session timeout on activity
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.SECURE_COOKIES === 'true',
    sameSite: 'strict', // CSRF Protection
    maxAge: 1000 * 60 * 30 // 30 minutes idle timeout
  }
}));

// CSRF Token generation
app.use((req, res, next) => {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// CSRF validation middleware
const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const tokenFromHeader = req.headers['x-csrf-token'];
  if (!tokenFromHeader || tokenFromHeader !== req.session.csrfToken) {
    console.warn(`CSRF validation failed for ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'CSRF token mismatch or missing' });
  }
  next();
};

app.use('/api/', csrfProtection);


// Serves static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// 3. Multer Upload Configuration (Domain 4 Upload security)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const cleanExt = path.extname(file.originalname).toLowerCase();
    const randomUuid = crypto.randomUUID();
    cb(null, `${randomUuid}${cleanExt}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file limit
  fileFilter: function (req, file, cb) {
    // Whitelist MIME types and extensions
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.zip'];
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/x-zip-compressed'
    ];
    
    const ext = path.extname(file.originalname).toLowerCase();
    const isExtAllowed = allowedExtensions.includes(ext);
    const isMimeAllowed = allowedMimeTypes.includes(file.mimetype);

    if (isExtAllowed && isMimeAllowed) {
      return cb(null, true);
    }
    cb(new Error('Only .pdf, .doc, .docx, and .zip files are allowed!'));
  }
});

// Helper Middlewares
function getIpAddress(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
}

function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized: Authentication required' });
}

function hasRole(roles) {
  return (req, res, next) => {
    if (req.session && roles.includes(req.session.role)) {
      return next();
    }
    res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  };
}

// ================= AUTH ROUTES =================

app.post('/api/auth/register', (req, res) => {
  const { username, password, role } = req.body;
  const clientIp = getIpAddress(req);

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!['researcher', 'collaborator'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role selection' });
  }

  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores.' });
  }

  // Password Strength Check
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long, and include at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&#).' });
  }

  dbHelper.getUserByUsername(username, (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (user) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    dbHelper.createUser(username, passwordHash, role, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Registration failed' });
      }

      dbHelper.logEvent(null, username, 'USER_REGISTER', `Created user account with role: ${role}`, clientIp);
      res.status(201).json({ message: 'User registered successfully. You can now login.' });
    });
  });
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const clientIp = getIpAddress(req);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  dbHelper.getUserByUsername(username, (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      // Security warning: log failed attempts (for Fail2ban monitoring - Domain 5)
      dbHelper.logEvent(null, username || 'UNKNOWN', 'LOGIN_FAILED', `Failed login attempt for username: ${username}`, clientIp);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Regenerate session to prevent Session Fixation (ASVS V2 / A2)
    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Session regeneration failed' });
      }

      // Set session values
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      // Re-generate a fresh CSRF token
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');

      dbHelper.logEvent(user.id, user.username, 'LOGIN_SUCCESS', 'User logged in successfully', clientIp);
      res.json({
        message: 'Login successful',
        user: { id: user.id, username: user.username, role: user.role },
        csrfToken: req.session.csrfToken
      });
    });
  });
});

app.post('/api/auth/logout', isAuthenticated, (req, res) => {
  const { userId, username } = req.session;
  const clientIp = getIpAddress(req);

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    dbHelper.logEvent(userId, username, 'LOGOUT', 'User logged out', clientIp);
    res.json({ message: 'Logout successful' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({
      user: { id: req.session.userId, username: req.session.username, role: req.session.role },
      csrfToken: req.session.csrfToken
    });
  }
  res.json({ user: null, csrfToken: req.session ? req.session.csrfToken : null });
});

// ================= PROPOSALS ROUTES =================

app.get('/api/proposals', isAuthenticated, (req, res) => {
  dbHelper.getProposalsForUser(req.session.userId, req.session.role, (err, proposals) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve proposals' });
    }
    res.json({ proposals });
  });
});

app.post('/api/proposals', isAuthenticated, hasRole(['researcher']), (req, res) => {
  upload.single('proposalFile')(req, res, function (err) {
    const clientIp = getIpAddress(req);
    
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { title, description } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    const fileName = req.file ? req.file.originalname : null;

    dbHelper.createProposal(title, description, req.session.userId, filePath, fileName, (err, lastId) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to create proposal' });
      }

      dbHelper.logEvent(
        req.session.userId,
        req.session.username,
        'PROPOSAL_CREATE',
        `Created proposal #${lastId}: "${title}" with file: ${fileName || 'None'}`,
        clientIp
      );

      res.status(201).json({ message: 'Proposal created successfully', proposalId: lastId });
    });
  });
});

app.post('/api/proposals/:id/status', isAuthenticated, hasRole(['admin']), (req, res) => {
  const proposalId = req.params.id;
  const { status } = req.body;
  const clientIp = getIpAddress(req);

  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  dbHelper.updateProposalStatus(proposalId, status, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update proposal status' });
    }

    dbHelper.logEvent(
      req.session.userId,
      req.session.username,
      'PROPOSAL_STATUS_UPDATE',
      `Proposal #${proposalId} set to status: ${status}`,
      clientIp
    );

    res.json({ message: `Proposal status updated to ${status}` });
  });
});

// ================= DOCUMENTS ROUTES =================

app.get('/api/proposals/:id/documents', isAuthenticated, (req, res) => {
  const proposalId = req.params.id;
  dbHelper.getDocumentsByProposal(proposalId, (err, documents) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve documents' });
    }
    res.json({ documents });
  });
});

app.post('/api/proposals/:id/documents', isAuthenticated, (req, res) => {
  const proposalId = req.params.id;
  
  upload.single('documentFile')(req, res, function (err) {
    const clientIp = getIpAddress(req);
    
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No document file uploaded' });
    }

    const filePath = `/uploads/${req.file.filename}`;
    const name = req.file.originalname;

    dbHelper.addDocument(proposalId, name, filePath, req.session.userId, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to attach document' });
      }

      dbHelper.logEvent(
        req.session.userId,
        req.session.username,
        'DOCUMENT_UPLOAD',
        `Uploaded document: "${name}" to proposal #${proposalId}`,
        clientIp
      );

      res.status(201).json({ message: 'Document uploaded successfully' });
    });
  });
});

// ================= COLLABORATION ROUTES =================

app.post('/api/collaboration/request', isAuthenticated, hasRole(['collaborator']), (req, res) => {
  const { proposalId, message } = req.body;
  const clientIp = getIpAddress(req);

  if (!proposalId) {
    return res.status(400).json({ error: 'Proposal ID is required' });
  }

  dbHelper.createCollaborationRequest(proposalId, req.session.userId, message, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to send collaboration request' });
    }

    dbHelper.logEvent(
      req.session.userId,
      req.session.username,
      'COLLAB_REQUEST',
      `Sent collaboration request for proposal #${proposalId}`,
      clientIp
    );

    res.status(201).json({ message: 'Collaboration request sent successfully' });
  });
});

app.get('/api/collaboration/incoming', isAuthenticated, hasRole(['researcher', 'admin']), (req, res) => {
  dbHelper.getIncomingRequestsForUser(req.session.userId, (err, requests) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve collaboration requests' });
    }
    res.json({ requests });
  });
});

app.get('/api/collaboration/accepted', isAuthenticated, hasRole(['researcher', 'admin']), (req, res) => {
  dbHelper.getAcceptedRequestsForUser(req.session.userId, (err, requests) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve accepted collaborations' });
    }
    res.json({ requests });
  });
});

app.get('/api/collaboration/sent', isAuthenticated, hasRole(['collaborator', 'admin']), (req, res) => {
  dbHelper.getSentRequestsBySender(req.session.userId, (err, requests) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to retrieve sent requests' });
    }
    res.json({ requests });
  });
});

app.post('/api/collaboration/:id/status', isAuthenticated, hasRole(['researcher', 'admin']), (req, res) => {
  const requestId = req.params.id;
  const { status } = req.body;
  const clientIp = getIpAddress(req);

  if (!status || !['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  dbHelper.updateCollaborationStatus(requestId, status, req.session.userId, req.session.role, (err) => {
    if (err) {
      return res.status(403).json({ error: err.message === 'Unauthorized or not found' ? 'Unauthorized or request not found' : 'Failed to update request' });
    }

    dbHelper.logEvent(
      req.session.userId,
      req.session.username,
      'COLLAB_STATUS_UPDATE',
      `Collaboration request #${requestId} updated to: ${status}`,
      clientIp
    );

    res.json({ message: `Request status updated to ${status}` });
  });
});

// ================= ANNOUNCEMENTS ROUTES =================

app.get('/api/announcements', (req, res) => {
  dbHelper.getAnnouncements((err, announcements) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve announcements' });
    }
    res.json({ announcements });
  });
});

app.post('/api/announcements', isAuthenticated, hasRole(['admin']), (req, res) => {
  const { title, content } = req.body;
  const clientIp = getIpAddress(req);

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  dbHelper.createAnnouncement(title, content, req.session.userId, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to create announcement' });
    }

    dbHelper.logEvent(
      req.session.userId,
      req.session.username,
      'ANNOUNCEMENT_CREATE',
      `Created announcement: "${title}"`,
      clientIp
    );

    res.status(201).json({ message: 'Announcement published successfully' });
  });
});

// ================= ADMIN AUDIT LOGS =================

app.get('/api/admin/audit-logs', isAuthenticated, hasRole(['admin']), (req, res) => {
  dbHelper.getAuditLogs((err, logs) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
    res.json({ logs });
  });
});

// Custom 404 handler for routes not found
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Custom error handler (No stack traces exposed to users)
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File size limit exceeded. Max limit is 10MB.' });
  }
  
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
  
  res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`JURUS University Portal server running on port ${PORT}`);
});
