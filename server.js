const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Get port from environment or use 3000 as default
const PORT = process.env.PORT || 3000;

// Check if we should serve production files
const isProd = process.env.NODE_ENV === 'production';
const serveDir = isProd && fs.existsSync('dist') ? 'dist' : '.';

// Serve static files from the appropriate directory
app.use(express.static(serveDir));

// Add a simple route to toggle between prod and dev mode
app.get('/toggle-mode', (req, res) => {
  const newMode = isProd ? 'development' : 'production';
  console.log(`Switching to ${newMode} mode`);

  // Redirect to home with appropriate query parameter
  if (newMode === 'production') {
    res.redirect('/?prod');
  } else {
    res.redirect('/');
  }
});

// For all other routes, serve the index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, serveDir, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
  console.log(`Serving files from: ${serveDir}`);
  console.log(`Server started on http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT}/toggle-mode to switch modes`);
}); 