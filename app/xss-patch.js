const fs = require('fs');

let content = fs.readFileSync('public/app.js', 'utf8');

// Add escapeHTML function if not exists
if (!content.includes('function escapeHTML')) {
  const escapeFunc = `
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
`;
  content = content.replace('// State management', escapeFunc + '\n  // State management');
}

// Replace occurrences
const varsToEscape = [
  'ann.creator', 'ann.title', 'ann.content',
  'prop.title', 'prop.description', 'prop.uploader', 'prop.file_name',
  'req.proposal_title', 'req.sender', 'req.message', 'req.collaborator',
  'log.username', 'log.details'
];

varsToEscape.forEach(v => {
  const regex = new RegExp(`\\$\\{${v.replace('.', '\\.')}\\}`, 'g');
  content = content.replace(regex, `\${escapeHTML(${v})}`);
});

fs.writeFileSync('public/app.js', content, 'utf8');
console.log('XSS patched successfully');
