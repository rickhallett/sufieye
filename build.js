const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Function to minify JavaScript using Terser
function minifyJS() {
  console.log('Copying JavaScript...');
  try {
    // Just copy app.js to dist
    fs.copyFileSync('app.js', 'dist/app.js');
    console.log('JavaScript copied successfully!');
  } catch (error) {
    console.error('Error copying JavaScript:', error.message);
  }
}

// Function to minify CSS
function minifyCSS() {
  console.log('Copying CSS...');
  try {
    // Just copy style.css to dist
    fs.copyFileSync('style.css', 'dist/style.css');
    console.log('CSS copied successfully!');
  } catch (error) {
    console.error('Error copying CSS:', error.message);
  }
}

// Create production version of index.html
function createProductionHTML() {
  console.log('Creating simplified index.html...');
  try {
    // Read the original index.html
    let html = fs.readFileSync('index.html', 'utf8');

    // Replace conditional CSS loading with direct reference
    html = html.replace(/<script>\s*\/\/ Function to check if we should use production files[\s\S]*?<\/script>/m,
      '<link rel="stylesheet" href="style.css">');

    // Replace conditional JS loading
    html = html.replace(/<!-- Dynamically load either dev or production JS -->\s*<script>[\s\S]*?<\/script>/m,
      '<script src="app.js"></script>');

    // Write simplified HTML to dist folder
    fs.writeFileSync('dist/index.html', html);
    console.log('Simplified index.html created successfully!');
  } catch (error) {
    console.error('Error creating simplified HTML:', error.message);
  }
}

// Copy other necessary files to dist
function copyStaticAssets() {
  console.log('Copying static assets...');
  try {
    // Copy any additional files needed in production
    if (fs.existsSync('graph-data.json')) {
      fs.copyFileSync('graph-data.json', 'dist/graph-data.json');
    }

    if (fs.existsSync('ayse_colours.json')) {
      fs.copyFileSync('ayse_colours.json', 'dist/ayse_colours.json');
    }

    // You can add more files to copy here as needed

    console.log('Static assets copied successfully!');
  } catch (error) {
    console.error('Error copying static assets:', error.message);
  }
}

// Main build function
function build() {
  console.log('Starting build process...');
  minifyJS();
  minifyCSS();
  createProductionHTML();
  copyStaticAssets();
  console.log('Build completed! Production files are in the dist/ directory.');
}

// Run the build process
build(); 