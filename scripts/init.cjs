#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get the current directory of the user (where the command is run)
const currentDir = process.cwd();

// Define the path to the folonite.js package directory in node_modules
const packageDir = path.resolve(__dirname, '../..');

// Files you want to copy from the package directory to the user’s project
const filesToCopy = [
  'src/index.js',   // Add the relative paths to the files inside the package
  'src/components/Footer.js',
  'src/components/Header.js',
  'src/pages/home.js',
  'src/pages/products/index.js'
];

// Function to copy files
function copyFile(src, dest) {
  fs.copyFile(src, dest, (err) => {
    if (err) {
      console.error(`Error copying ${src} to ${dest}:`, err);
    } else {
      console.log(`${src} copied to ${dest}`);
    }
  });
}

// Loop through each file and copy to the user's directory
filesToCopy.forEach((file) => {
  const srcFile = path.join(packageDir, file);  // File in the node_modules/folonite.js
  const destFile = path.join(currentDir, file); // Destination in the user's project
  copyFile(srcFile, destFile);
});
