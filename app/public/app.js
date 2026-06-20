document.addEventListener('DOMContentLoaded', () => {
  
  
  // ================= UTILITIES =================
  function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, 
      tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[tag] || tag)
    );
  }

  // State management
  let currentUser = null;
  let activePage = 'dashboard';
  let csrfToken = null;

  // Global fetch wrapper to automatically attach CSRF Token
  const originalFetch = window.fetch;
  window.fetch = async function (url, options = {}) {
    options.credentials = options.credentials || 'same-origin';
    options.cache = options.cache || 'no-store';
    
    if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase())) {
      options.headers = options.headers || {};
      if (csrfToken) {
        if (options.body instanceof FormData) {
          options.headers['X-CSRF-Token'] = csrfToken;
        } else {
          options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
          options.headers['X-CSRF-Token'] = csrfToken;
        }
      }
    }
    return originalFetch(url, options);
  };
  
  // DOM Elements
  const headerNav = document.getElementById('header-nav');
  const btnLoginModal = document.getElementById('btn-login-modal');
  const btnLogout = document.getElementById('btn-logout');
  const navUserInfo = document.getElementById('nav-user-info');
  const modalAuth = document.getElementById('modal-auth');
  const btnCloseAuth = document.getElementById('btn-close-auth-modal');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  
  const pageViews = document.querySelectorAll('.page-view');
  const navLinks = document.querySelectorAll('.nav-link');
  
  // Modals
  const modalProposal = document.getElementById('modal-proposal');
  const btnCloseProposal = document.getElementById('btn-close-proposal-modal');
  const btnNewProposal = document.getElementById('btn-new-proposal');
  const formProposal = document.getElementById('form-proposal');
  const inputProposalFile = document.getElementById('proposal-file');
  const spanSelectedFileName = document.getElementById('selected-file-name');
  
  const modalAnnouncement = document.getElementById('modal-announcement');
  const btnCloseAnn = document.getElementById('btn-close-ann-modal');
  const btnNewAnn = document.getElementById('btn-new-announcement');
  const btnNewAnnPage = document.getElementById('btn-announcement-page-create');
  const formAnnouncement = document.getElementById('form-announcement');
  
  const modalCollabRequest = document.getElementById('modal-collab-request');
  const btnCloseCollab = document.getElementById('btn-close-collab-modal');
  const formCollabRequest = document.getElementById('form-collab-request');
  
  const modalAttachDoc = document.getElementById('modal-attach-doc');
  const btnCloseAttach = document.getElementById('btn-close-attach-modal');
  const formAttachDoc = document.getElementById('form-attach-doc');
  const inputAttachFile = document.getElementById('attach-file');
  const spanSelectedAttachName = document.getElementById('selected-attach-name');
  
  // Dynamic Containers
  const announcementsList = document.getElementById('announcements-list');
  const announcementsFullList = document.getElementById('announcements-full-list');
  const proposalsGrid = document.getElementById('proposals-grid');
  const incomingCollabList = document.getElementById('incoming-collab-list');
  const auditLogsRows = document.getElementById('audit-logs-rows');
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');
  
  // Stats
  const statProposalsCount = document.getElementById('stat-proposals-count');
  const statCollabCount = document.getElementById('stat-collab-count');

  // ================= TOAST NOTIFICATIONS =================
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';
    
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    
    const msgDiv = document.createElement('div');
    msgDiv.textContent = message; // Safe from XSS
    
    toast.appendChild(iconSpan);
    toast.appendChild(document.createTextNode(' '));
    toast.appendChild(msgDiv);
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ================= ROUTER =================
  function navigateTo(pageId) {
    activePage = pageId;
    
    // Toggle active link
    navLinks.forEach(link => {
      if (link.id === `nav-${pageId}`) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
    
    // Toggle active page view
    pageViews.forEach(view => {
      if (view.id === `page-${pageId}`) {
        view.classList.remove('hide');
        view.classList.add('active-view');
      } else {
        view.classList.add('hide');
        view.classList.remove('active-view');
      }
    });
    
    // Trigger page-specific loads
    if (pageId === 'dashboard') {
      loadAnnouncements();
      loadDashboardStats();
      loadIncomingCollaborations();
    } else if (pageId === 'proposals') {
      loadProposals();
    } else if (pageId === 'announcements') {
      loadAnnouncementsFull();
    } else if (pageId === 'admin') {
      if (currentUser && currentUser.role === 'admin') {
        loadAuditLogs();
      } else {
        navigateTo('dashboard');
      }
    }
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = link.id.replace('nav-', '');
      navigateTo(pageId);
    });
  });

  document.getElementById('banner-logs-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentUser && currentUser.role === 'admin') {
      navigateTo('admin');
    } else {
      showToast('Admin access required. Please sign in as admin.', 'warning');
      modalAuth.classList.remove('hide');
    }
  });

  // ================= AUTHENTICATION FLOW =================
  
  // Check auth status on start
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.csrfToken) {
        csrfToken = data.csrfToken;
      }
      if (data.user) {
        setLoggedInUser(data.user);
      } else {
        setLoggedOutState();
      }
    } catch (err) {
      console.error('Error checking auth:', err);
    }
  }

  function setLoggedInUser(user) {
    currentUser = user;
    
    // Update navigation
    btnLoginModal.classList.add('hide');
    btnLogout.classList.remove('hide');
    navUserInfo.textContent = `${user.username} (${user.role})`;
    navUserInfo.classList.remove('hide');
    
    // Show role-specific links/buttons
    if (user.role === 'admin') {
      document.getElementById('nav-admin').classList.remove('hide');
      btnNewAnn.classList.remove('hide');
      btnNewAnnPage.classList.remove('hide');
      btnNewProposal.classList.add('hide');
    } else if (user.role === 'researcher') {
      document.getElementById('nav-admin').classList.add('hide');
      btnNewAnn.classList.add('hide');
      btnNewAnnPage.classList.add('hide');
      btnNewProposal.classList.remove('hide');
    } else { // collaborator
      document.getElementById('nav-admin').classList.add('hide');
      btnNewAnn.classList.add('hide');
      btnNewAnnPage.classList.add('hide');
      btnNewProposal.classList.add('hide');
    }
    
    updateHeroButtons();
    // Re-run current page load to show auth-related actions
    navigateTo(activePage);
  }

  function setLoggedOutState() {
    currentUser = null;
    btnLoginModal.classList.remove('hide');
    btnLogout.classList.add('hide');
    navUserInfo.classList.add('hide');
    document.getElementById('nav-admin').classList.add('hide');
    btnNewAnn.classList.add('hide');
    btnNewAnnPage.classList.add('hide');
    btnNewProposal.classList.add('hide');
    
    incomingCollabList.innerHTML = `<p class="empty-msg">Please log in to view collaboration requests.</p>`;
    document.getElementById('card-accepted-collab')?.classList.add('hide');
    updateHeroButtons();
    navigateTo('dashboard');
  }

  function updateHeroButtons() {
    const heroActions = document.querySelector('.hero-actions');
    if (!heroActions) return;
    
    if (!currentUser) {
      heroActions.innerHTML = `
        <button id="btn-hero-explore" class="btn btn-primary">Explore Proposals</button>
        <button id="btn-hero-login" class="btn btn-secondary">Sign In to Portal</button>
      `;
      document.getElementById('btn-hero-explore').addEventListener('click', () => navigateTo('proposals'));
      document.getElementById('btn-hero-login').addEventListener('click', () => {
        modalAuth.classList.remove('hide');
        tabLogin.click();
      });
    } else if (currentUser.role === 'admin') {
      heroActions.innerHTML = `
        <button id="btn-hero-logs" class="btn btn-primary">Audit Security Logs</button>
        <button id="btn-hero-explore" class="btn btn-secondary">Manage Proposals</button>
      `;
      document.getElementById('btn-hero-logs').addEventListener('click', () => navigateTo('admin'));
      document.getElementById('btn-hero-explore').addEventListener('click', () => navigateTo('proposals'));
    } else if (currentUser.role === 'researcher') {
      heroActions.innerHTML = `
        <button id="btn-hero-upload" class="btn btn-primary">Submit Proposal</button>
        <button id="btn-hero-explore" class="btn btn-secondary">View My Proposals</button>
      `;
      document.getElementById('btn-hero-upload').addEventListener('click', () => {
        modalProposal.classList.remove('hide');
        spanSelectedFileName.textContent = '';
      });
      document.getElementById('btn-hero-explore').addEventListener('click', () => navigateTo('proposals'));
    } else { // collaborator
      heroActions.innerHTML = `
        <button id="btn-hero-explore" class="btn btn-primary">Explore Proposals</button>
        <button id="btn-hero-notices" class="btn btn-secondary">Read Announcements</button>
      `;
      document.getElementById('btn-hero-explore').addEventListener('click', () => navigateTo('proposals'));
      document.getElementById('btn-hero-notices').addEventListener('click', () => navigateTo('announcements'));
    }
  }

  // Auth Modals actions
  btnLoginModal.addEventListener('click', () => {
    modalAuth.classList.remove('hide');
    tabLogin.click();
  });
  
  btnCloseAuth.addEventListener('click', () => modalAuth.classList.add('hide'));
  
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hide');
    formRegister.classList.add('hide');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.remove('hide');
    formLogin.classList.add('hide');
  });

  // Handle Login submission
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Login successful!');
        modalAuth.classList.add('hide');
        formLogin.reset();
        if (data.csrfToken) {
          csrfToken = data.csrfToken;
        }
        setLoggedInUser(data.user);
      } else {
        showToast(data.error || 'Login failed', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  });

  // Handle Register submission
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const role = document.getElementById('register-role').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Account created successfully! Please Sign In.');
        formRegister.reset();
        tabLogin.click();
      } else {
        showToast(data.error || 'Registration failed', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  });

  // Handle Logout
  btnLogout.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        showToast('Logged out successfully');
        setLoggedOutState();
      } else {
        showToast('Logout failed', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  });

  // ================= ANNOUNCEMENTS =================
  async function loadAnnouncements() {
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      announcementsList.innerHTML = '';
      
      if (data.announcements.length === 0) {
        announcementsList.innerHTML = '<p class="empty-msg">No announcements published.</p>';
        return;
      }

      data.announcements.slice(0, 3).forEach(ann => {
        const item = document.createElement('div');
        item.className = 'announcement-item';
        const header = document.createElement('div');
        header.className = 'ann-item-header';
        
        const creatorSpan = document.createElement('span');
        creatorSpan.textContent = `👤 ${ann.creator}`;
        
        const dateSpan = document.createElement('span');
        dateSpan.textContent = `📅 ${new Date(ann.created_at).toLocaleDateString()}`;
        
        header.appendChild(creatorSpan);
        header.appendChild(dateSpan);
        
        const title = document.createElement('h3');
        title.style.fontSize = '1.05rem';
        title.style.marginBottom = '4px';
        title.style.color = 'var(--text-primary)';
        title.textContent = ann.title;
        
        const content = document.createElement('p');
        content.className = 'ann-item-content';
        content.textContent = ann.content;
        
        item.appendChild(header);
        item.appendChild(title);
        item.appendChild(content);
        
        announcementsList.appendChild(item);
      });
    } catch (err) {
      announcementsList.innerHTML = '<p class="empty-msg">Error loading announcements.</p>';
    }
  }

  async function loadAnnouncementsFull() {
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      announcementsFullList.innerHTML = '';
      
      if (data.announcements.length === 0) {
        announcementsFullList.innerHTML = '<p class="empty-msg">No announcements published.</p>';
        return;
      }

      data.announcements.forEach(ann => {
        const item = document.createElement('div');
        item.className = 'announcement-item';
        item.style.padding = '20px';
        const header = document.createElement('div');
        header.className = 'ann-item-header';
        header.style.fontSize = '0.9rem';
        header.style.marginBottom = '8px';
        
        const creatorSpan = document.createElement('span');
        creatorSpan.textContent = `👤 Published by: `;
        const creatorStrong = document.createElement('strong');
        creatorStrong.textContent = ann.creator;
        creatorSpan.appendChild(creatorStrong);
        
        const dateSpan = document.createElement('span');
        dateSpan.textContent = `📅 Date: ${new Date(ann.created_at).toLocaleString()}`;
        
        header.appendChild(creatorSpan);
        header.appendChild(dateSpan);
        
        const title = document.createElement('h2');
        title.style.fontSize = '1.3rem';
        title.style.marginBottom = '8px';
        title.style.color = 'var(--primary)';
        title.textContent = ann.title;
        
        const content = document.createElement('p');
        content.className = 'ann-item-content';
        content.style.fontSize = '1rem';
        content.style.lineHeight = '1.7';
        content.textContent = ann.content;
        
        item.appendChild(header);
        item.appendChild(title);
        item.appendChild(content);

        announcementsFullList.appendChild(item);
      });
    } catch (err) {
      announcementsFullList.innerHTML = '<p class="empty-msg">Error loading notices.</p>';
    }
  }

  // Publish Announcement Modal trigger
  btnNewAnn.addEventListener('click', () => modalAnnouncement.classList.remove('hide'));
  btnNewAnnPage.addEventListener('click', () => modalAnnouncement.classList.remove('hide'));
  btnCloseAnn.addEventListener('click', () => modalAnnouncement.classList.add('hide'));

  formAnnouncement.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('ann-title').value;
    const content = document.getElementById('ann-content').value;

    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Announcement published!');
        modalAnnouncement.classList.add('hide');
        formAnnouncement.reset();
        navigateTo(activePage);
      } else {
        showToast(data.error || 'Failed to publish', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  });

  // ================= PROPOSALS =================
  btnNewProposal.addEventListener('click', () => {
    modalProposal.classList.remove('hide');
    spanSelectedFileName.textContent = '';
  });
  
  btnCloseProposal.addEventListener('click', () => modalProposal.classList.add('hide'));
  
  inputProposalFile.addEventListener('change', () => {
    if (inputProposalFile.files[0]) {
      spanSelectedFileName.textContent = `Selected: ${inputProposalFile.files[0].name}`;
    }
  });

  // Handle Create Proposal
  formProposal.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('proposal-title').value;
    const description = document.getElementById('proposal-desc').value;
    const file = inputProposalFile.files[0];

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    if (file) {
      formData.append('proposalFile', file);
    }

    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Proposal submitted successfully!');
        modalProposal.classList.add('hide');
        formProposal.reset();
        spanSelectedFileName.textContent = '';
        navigateTo('proposals');
      } else {
        showToast(data.error || 'Submission failed', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  });

  async function loadProposals() {
    try {
      const res = await fetch('/api/proposals');
      const data = await res.json();
      proposalsGrid.innerHTML = '';

      if (data.proposals.length === 0) {
        proposalsGrid.innerHTML = '<p class="empty-msg">No proposals submitted yet.</p>';
        return;
      }

      data.proposals.forEach(prop => {
        const card = document.createElement('div');
        card.className = 'proposal-card glass-container';
        
        let actionButtons = '';
        if (currentUser) {
          if (currentUser.role === 'admin' && prop.status === 'pending') {
            actionButtons = `
              <button class="btn btn-sm btn-primary btn-approve" data-id="${prop.id}">Approve</button>
              <button class="btn btn-sm btn-danger btn-reject" data-id="${prop.id}">Reject</button>
            `;
          } else if (currentUser.role === 'collaborator' && prop.status === 'approved') {
            actionButtons = `
              <button class="btn btn-sm btn-primary btn-request-collab" data-id="${prop.id}" data-title="${escapeHTML(prop.title)}">Request Collab</button>
            `;
          } else if (currentUser.role === 'researcher' && prop.uploaded_by === currentUser.id) {
            actionButtons = `
              <button class="btn btn-sm btn-secondary btn-attach-doc" data-id="${prop.id}" data-title="${escapeHTML(prop.title)}">Attach File</button>
            `;
          }
        }

        const fileLink = prop.file_path 
          ? `<a href="${prop.file_path}" target="_blank" class="proposal-attachment-link">📄 ${escapeHTML(prop.file_name)}</a>`
          : '<span class="proposal-attachment-link" style="color:var(--text-muted)">No document</span>';

        card.innerHTML = `
          <div class="proposal-card-body">
            <span class="proposal-status-badge status-${prop.status}">${prop.status}</span>
            <h3 style="margin-top: 10px;">${escapeHTML(prop.title)}</h3>
            <p>${escapeHTML(prop.description)}</p>
            <div class="proposal-meta">
              <span>Uploaded by: <strong>${escapeHTML(prop.uploader)}</strong></span>
              <span>Date: <strong>${new Date(prop.created_at).toLocaleDateString()}</strong></span>
            </div>
          </div>
          <div class="proposal-card-actions">
            ${fileLink}
            <div style="display:flex; gap:8px;">
              ${actionButtons}
            </div>
          </div>
        `;
        proposalsGrid.appendChild(card);
      });

      // Bind dynamic actions
      document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', () => updateProposalStatus(btn.dataset.id, 'approved'));
      });
      document.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', () => updateProposalStatus(btn.dataset.id, 'rejected'));
      });
      document.querySelectorAll('.btn-request-collab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById('collab-proposal-id').value = btn.dataset.id;
          document.getElementById('collab-modal-title').textContent = `Proposal: "${btn.dataset.title}"`;
          modalCollabRequest.classList.remove('hide');
        });
      });
      document.querySelectorAll('.btn-attach-doc').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById('attach-proposal-id').value = btn.dataset.id;
          document.getElementById('attach-modal-title').textContent = `Proposal: "${btn.dataset.title}"`;
          modalAttachDoc.classList.remove('hide');
          spanSelectedAttachName.textContent = '';
        });
      });

    } catch (err) {
      proposalsGrid.innerHTML = '<p class="empty-msg">Error loading proposals.</p>';
    }
  }

  async function updateProposalStatus(id, status) {
    try {
      const res = await fetch(`/api/proposals/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        showToast(`Proposal status updated to ${status}!`);
        loadProposals();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update status', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  }

  // ================= COLLABORATION REQUESTS =================
  
  btnCloseCollab.addEventListener('click', () => modalCollabRequest.classList.add('hide'));

  formCollabRequest.addEventListener('submit', async (e) => {
    e.preventDefault();
    const proposalId = document.getElementById('collab-proposal-id').value;
    const message = document.getElementById('collab-message').value;

    try {
      const res = await fetch('/api/collaboration/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, message })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Collaboration request sent!');
        modalCollabRequest.classList.add('hide');
        formCollabRequest.reset();
      } else {
        showToast(data.error || 'Failed to send request', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  });

  async function loadIncomingCollaborations() {
    const collabTitleElem = document.getElementById('collab-inbox-title');
    
    if (!currentUser) {
      if (collabTitleElem) collabTitleElem.textContent = 'Collaboration Request Inbox';
      incomingCollabList.innerHTML = '<p class="empty-msg">Please log in to view collaboration requests.</p>';
      return;
    }
    
    if (currentUser.role === 'collaborator') {
      if (collabTitleElem) collabTitleElem.textContent = 'Sent Collaboration Requests';
      try {
        const res = await fetch('/api/collaboration/sent');
        if (!res.ok) {
          incomingCollabList.innerHTML = '<p class="empty-msg">Error loading sent collaboration requests.</p>';
          return;
        }
        const data = await res.json();
        incomingCollabList.innerHTML = '';
        
        const requests = data.requests || [];
        if (requests.length === 0) {
          incomingCollabList.innerHTML = '<p class="empty-msg">You have not sent any collaboration requests yet. Go to the <strong>Proposals</strong> tab to send one.</p>';
          return;
        }
        
        requests.forEach(req => {
          const item = document.createElement('div');
          item.className = 'collab-req-item';
          
          let statusClass = 'status-pending';
          if (req.status === 'accepted') statusClass = 'status-approved';
          if (req.status === 'rejected') statusClass = 'status-rejected';
          
          item.innerHTML = `
            <div class="collab-req-header">
              <span class="collab-proposal-title">Proposal: "${escapeHTML(req.proposal_title)}"</span>
              <span class="proposal-status-badge ${statusClass}" style="font-size: 0.7rem; padding: 2px 8px;">${req.status}</span>
            </div>
            <p class="collab-req-msg" style="margin-bottom: 4px;">Owner: @${req.proposal_owner}</p>
            <p class="collab-req-msg" style="font-size: 0.8rem; color: var(--text-muted); font-style: normal; margin-top: 6px;">Message: "${escapeHTML(req.message)}"</p>
          `;
          incomingCollabList.appendChild(item);
        });
      } catch (err) {
        incomingCollabList.innerHTML = '<p class="empty-msg">Error loading sent collaboration requests.</p>';
      }
      return;
    }

    // Admin / Researcher incoming inbox
    if (collabTitleElem) collabTitleElem.textContent = 'Collaboration Request Inbox';
    try {
      const res = await fetch('/api/collaboration/incoming');
      if (!res.ok) {
        incomingCollabList.innerHTML = '<p class="empty-msg">Only researchers and admins can manage incoming requests.</p>';
      } else {
        const data = await res.json();
        incomingCollabList.innerHTML = '';

        const requests = data.requests || [];
        if (requests.length === 0) {
          incomingCollabList.innerHTML = '<p class="empty-msg">No pending partnership requests.</p>';
        } else {
          requests.forEach(req => {
            const item = document.createElement('div');
            item.className = 'collab-req-item';
            item.innerHTML = `
              <div class="collab-req-header">
                <span class="collab-proposal-title">Proposal: "${escapeHTML(req.proposal_title)}"</span>
                <span class="collab-sender">From: @${escapeHTML(req.sender)}</span>
              </div>
              <p class="collab-req-msg">"${escapeHTML(req.message)}"</p>
              <div class="collab-req-actions">
                <button class="btn btn-sm btn-primary btn-accept-collab" data-id="${req.id}">Accept</button>
                <button class="btn btn-sm btn-danger btn-reject-collab" data-id="${req.id}">Decline</button>
              </div>
            `;
            incomingCollabList.appendChild(item);
          });

          document.querySelectorAll('.btn-accept-collab').forEach(btn => {
            btn.addEventListener('click', () => updateCollabStatus(btn.dataset.id, 'accepted'));
          });
          document.querySelectorAll('.btn-reject-collab').forEach(btn => {
            btn.addEventListener('click', () => updateCollabStatus(btn.dataset.id, 'rejected'));
          });
        }
      }

    } catch (err) {
      incomingCollabList.innerHTML = '<p class="empty-msg">Error loading collaboration requests.</p>';
    }

    // Load Accepted Collaborations
    const cardAcceptedCollab = document.getElementById('card-accepted-collab');
    const acceptedCollabList = document.getElementById('accepted-collab-list');
    
    if (cardAcceptedCollab && acceptedCollabList) {
      cardAcceptedCollab.classList.remove('hide');
      try {
        const resAccepted = await fetch('/api/collaboration/accepted');
        if (resAccepted.ok) {
          const dataAccepted = await resAccepted.json();
          const acceptedReqs = dataAccepted.requests || [];
          
          acceptedCollabList.innerHTML = '';
          if (acceptedReqs.length === 0) {
            acceptedCollabList.innerHTML = '<p class="empty-msg">No accepted collaborations yet.</p>';
          } else {
            acceptedReqs.forEach(req => {
              const item = document.createElement('div');
              item.className = 'collab-req-item';
              item.innerHTML = `
                <div class="collab-req-header">
                  <span class="collab-proposal-title">Proposal: "${escapeHTML(req.proposal_title)}"</span>
                  <span class="collab-sender" style="color: var(--success-color);">Partner: @${escapeHTML(req.collaborator)}</span>
                </div>
              `;
              acceptedCollabList.appendChild(item);
            });
          }
        }
      } catch (err) {
        acceptedCollabList.innerHTML = '<p class="empty-msg">Error loading accepted collaborations.</p>';
      }
    }
  }

  async function updateCollabStatus(id, status) {
    try {
      const res = await fetch(`/api/collaboration/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        showToast(`Request ${status}!`);
        loadIncomingCollaborations();
        loadDashboardStats();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update request', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  }

  // ================= DOCUMENT ATTACHMENTS =================
  
  btnCloseAttach.addEventListener('click', () => modalAttachDoc.classList.add('hide'));
  
  inputAttachFile.addEventListener('change', () => {
    if (inputAttachFile.files[0]) {
      spanSelectedAttachName.textContent = `Selected: ${inputAttachFile.files[0].name}`;
    }
  });

  formAttachDoc.addEventListener('submit', async (e) => {
    e.preventDefault();
    const proposalId = document.getElementById('attach-proposal-id').value;
    const file = inputAttachFile.files[0];

    const formData = new FormData();
    formData.append('documentFile', file);

    try {
      const res = await fetch(`/api/proposals/${proposalId}/documents`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Document attached successfully!');
        modalAttachDoc.classList.add('hide');
        formAttachDoc.reset();
        spanSelectedAttachName.textContent = '';
        loadProposals();
      } else {
        showToast(data.error || 'Failed to attach document', 'error');
      }
    } catch (err) {
      showToast('Connection error', 'error');
    }
  });

  // ================= STATS & AUDIT LOGS =================
  async function loadDashboardStats() {
    try {
      const res = await fetch('/api/proposals');
      const data = await res.json();
      
      const approvedProps = data.proposals.filter(p => p.status === 'approved');
      statProposalsCount.textContent = approvedProps.length;

      // Dummy calculation just for visuals
      statCollabCount.textContent = data.proposals.length + 2;
    } catch (err) {
      console.error(err);
    }
  }

  async function loadAuditLogs() {
    try {
      const res = await fetch('/api/admin/audit-logs');
      const data = await res.json();
      auditLogsRows.innerHTML = '';

      if (data.logs.length === 0) {
        auditLogsRows.innerHTML = '<tr><td colspan="5" style="text-align:center">No audit logs recorded.</td></tr>';
        return;
      }

      data.logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${new Date(log.timestamp).toLocaleString()}</td>
          <td><strong>${log.username || 'guest'}</strong></td>
          <td><span class="proposal-status-badge" style="background:rgba(210,210,210,0.1); color:var(--text-primary); border:1px solid var(--border-glass)">${log.action}</span></td>
          <td>${escapeHTML(log.details)}</td>
          <td><code>${log.ip_address}</code></td>
        `;
        auditLogsRows.appendChild(tr);
      });
    } catch (err) {
      auditLogsRows.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--danger)">Error loading audit logs.</td></tr>';
    }
  }

  btnRefreshLogs.addEventListener('click', loadAuditLogs);

  // Initialize
  checkAuth();
  navigateTo('dashboard');
});
