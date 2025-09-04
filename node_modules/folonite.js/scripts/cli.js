#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import readline from 'readline';

const args = process.argv.slice(2);

// Function to check Folonite.js version
function checkVersion() {
  const packageJSONPath = path.resolve('./package.json');
  const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));
  console.log(`Folonite.js version: ${packageJSON.version}`);
}

// Function to install dependencies
function installDependencies() {
  exec('npm install', (err, stdout, stderr) => {
    if (err) {
      console.error(`Error installing dependencies: ${err.message}`);
      return;
    }
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
  });
}

// Function to install backend dependencies
function installBackendDependencies() {
  exec('npm install express compression', (err, stdout, stderr) => {
    if (err) {
      console.error(`Error installing backend dependencies: ${err.message}`);
      return;
    }
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
  });
}

// Advanced check for outdated dependencies
function checkOutdatedDependencies() {
  exec('npm outdated --json', (err, stdout, stderr) => {
    if (err && !stdout) {
      console.error(`Error checking outdated dependencies: ${err.message}`);
      return;
    }

    if (stdout) {
      const outdated = JSON.parse(stdout);
      if (Object.keys(outdated).length === 0) {
        console.log('All dependencies are up to date.');
      } else {
        console.log('Outdated dependencies:');
        for (const [dep, details] of Object.entries(outdated)) {
          const { current, wanted, latest } = details;
          console.log(`- ${dep}: current(${current}) -> wanted(${wanted}) -> latest(${latest})`);
        }
        console.log('\nUse "npm update" to update dependencies.');
      }
    }

    if (stderr) {
      console.error(stderr);
    }
  });
}

// Advanced clean node_modules
function cleanNodeModules() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('This will delete node_modules and reinstall dependencies. Are you sure? (y/n) ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      exec('rm -rf node_modules && npm install', (err, stdout, stderr) => {
        if (err) {
          console.error(`Error cleaning node_modules: ${err.message}`);
          return;
        }
        console.log('node_modules cleaned and dependencies reinstalled successfully.');
        console.log(stdout);
        if (stderr) {
          console.error(stderr);
        }
      });
    } else {
      console.log('Clean operation canceled.');
    }
    rl.close();
  });
}

// Advanced clear npm cache
function clearCache() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('This will clear the npm cache. Are you sure? (y/n) ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      exec('npm cache clean --force', (err, stdout, stderr) => {
        if (err) {
          console.error(`Error clearing npm cache: ${err.message}`);
          return;
        }
        console.log('npm cache cleared successfully.');
        console.log(stdout);
        if (stderr) {
          console.error(stderr);
        }
      });
    } else {
      console.log('Cache clear operation canceled.');
    }
    rl.close();
  });
}

// Function to toggle backend configuration
function toggleBackend(enable) {
  const configPath = path.resolve('./src/config.js');
  const config = fs.readFileSync(configPath, 'utf-8').replace(
    /backendEnabled: (true|false)/,
    `backendEnabled: ${enable}`
  );
  fs.writeFileSync(configPath, config);
  console.log(`Backend is now ${enable ? 'enabled' : 'disabled'}.`);
}

// Main CLI logic
switch (args[0]) {
  case '--version':
  case 'version':
    checkVersion();
    break;

  case 'dependencies':
    installDependencies();
    break;

  case 'backend:dependencies':
    installBackendDependencies();
    break;

  case 'outdated':
    checkOutdatedDependencies();
    break;

  case 'clean':
    cleanNodeModules();
    break;

  case 'cache':
    clearCache();
    break;

  case 'enable:backend':
    toggleBackend(true);
    break;

  case 'disable:backend':
    toggleBackend(false);
    break;

  default:
    console.log(`
Usage:
  --version                 Check Folonite.js version
  dependencies              Auto-install project dependencies
  backend:dependencies       Install backend dependencies (express, compression)
  outdated                  Check for outdated dependencies (with upgrade options)
  clean                     Clean node_modules and reinstall dependencies
  cache                     Clear npm cache
  enable:backend             Enable backend integration
  disable:backend            Disable backend integration
`);
}
