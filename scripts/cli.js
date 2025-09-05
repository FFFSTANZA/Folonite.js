#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';
import os from 'os';
import https from 'https';

const execAsync = promisify(exec);
const args = process.argv.slice(2);

// Colors for better CLI experience
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// Utility functions
function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'white') {
  console.log(colorize(message, color));
}

function error(message) {
  console.error(colorize(`ERROR: ${message}`, 'red'));
}

function success(message) {
  console.log(colorize(`SUCCESS: ${message}`, 'green'));
}

function warn(message) {
  console.warn(colorize(`WARNING: ${message}`, 'yellow'));
}

function info(message) {
  console.log(colorize(`INFO: ${message}`, 'cyan'));
}

function createSpinner(text) {
  const frames = ['|', '/', '-', '\\'];
  let index = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${frames[index]} ${text}`);
    index = (index + 1) % frames.length;
  }, 150);

  return {
    stop: (message) => {
      clearInterval(interval);
      process.stdout.write(`\r${message ? message : ''}\n`);
    }
  };
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(colorize(question, 'cyan'), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Check if we're in a valid project directory
function validateProjectDirectory() {
  if (!fs.existsSync('./package.json')) {
    error('package.json not found. Are you in a Folonite.js project directory?');
    return false;
  }
  return true;
}

// Fetch package info from npm registry (modern replacement for `npm view`)
function fetchNpmPackage(name) {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${name}`;

    https.get(url, (res) => {
      let data = '';

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }

      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error('Failed to parse response'));
        }
      });
    }).on('error', reject);
  });
}

// Enhanced version checking with direct npm registry call
async function checkVersion() {
  try {
    if (!validateProjectDirectory()) return;

    const packageJSON = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
    const currentVersion = packageJSON.version || 'unknown';
    const projectName = packageJSON.name || 'unknown';

    log('\nVersion Information:', 'bright');
    log(`  Project: ${projectName} v${currentVersion}`, 'green');
    log(`  Node.js: ${process.version}`, 'blue');
    log(`  npm: ${await getNpmVersion()}`, 'blue');
    log(`  Platform: ${os.platform()} ${os.arch()}`, 'blue');

    // Only check registry if it's a folonite.js project
    if (projectName === 'folonite.js' || packageJSON.dependencies?.['folonite.js']) {
      try {
        info('Checking latest version from npm registry...');
        const data = await fetchNpmPackage('folonite.js');
        const latestVersion = data['dist-tags'].latest;

        if (latestVersion && currentVersion !== latestVersion) {
          warn(`New version available: ${latestVersion}`);
          log(`  Update with: npm install folonite.js@${latestVersion}`, 'yellow');
        } else {
          success('You are using the latest version.');
        }
      } catch (err) {
        warn(`Could not fetch latest version: ${err.message}`);
      }
    }
  } catch (err) {
    error(`Failed to check version: ${err.message}`);
  }
}

async function getNpmVersion() {
  try {
    const { stdout } = await execAsync('npm --version');
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

// Enhanced dependency management
async function installDependencies(type = 'all') {
  if (!validateProjectDirectory()) return;

  const spinner = createSpinner('Installing dependencies...');

  try {
    let command = 'npm install';
    let description = 'all dependencies';

    switch (type) {
      case 'backend':
        command = 'npm install express compression';
        description = 'backend dependencies (express, compression)';
        break;
      case 'dev':
        command = 'npm install --save-dev nodemon';
        description = 'development dependencies';
        break;
      case 'production':
        command = 'npm ci --omit=dev';
        description = 'production dependencies only';
        break;
    }

    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(command, { timeout: 300000 });
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    spinner.stop();
    success(`Installed ${description} in ${duration}s`);

    if (stderr && !stderr.includes('WARN')) {
      warn(`Installation warnings: ${stderr.split('\n')[0]}`);
    }

    await showInstallationSummary();
  } catch (err) {
    spinner.stop();
    if (err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM') {
      error('Installation timed out. Check your network connection.');
    } else {
      error(`Installation failed: ${err.message.split('\n')[0]}`);
    }
  }
}

async function showInstallationSummary() {
  try {
    const pkgPath = './package.json';
    if (!fs.existsSync(pkgPath)) return;

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).length;
    const devDeps = Object.keys(pkg.devDependencies || {}).length;

    log('\nInstallation Summary:', 'bright');
    log(`  Dependencies: ${deps}`, 'green');
    log(`  Dev Dependencies: ${devDeps}`, 'blue');

    if (fs.existsSync('./package-lock.json')) {
      const size = fs.statSync('./package-lock.json').size / 1024;
      log(`  Lock file size: ${size.toFixed(1)} KB`, 'cyan');
    }

    if (fs.existsSync('./node_modules')) {
      try {
        const { stdout } = await execAsync('du -sh node_modules 2>/dev/null || echo "unknown"');
        const size = stdout.trim().split('\t')[0];
        log(`  node_modules size: ${size}`, 'gray');
      } catch {}
    }
  } catch {}
}

// Check outdated dependencies using `npm outdated --json` (still valid, but now robust)
async function checkOutdatedDependencies() {
  if (!validateProjectDirectory()) return;

  const spinner = createSpinner('Checking for outdated dependencies...');

  try {
    const { stdout } = await execAsync('npm outdated --json', { timeout: 30000 });
    let outdatedData;
    try {
      outdatedData = JSON.parse(stdout.trim());
    } catch {
      spinner.stop();
      warn('No outdated dependencies found or output was empty.');
      return;
    }

    spinner.stop();

    const outdatedPackages = Object.keys(outdatedData);
    if (outdatedPackages.length === 0) {
      success('All dependencies are up to date!');
      return;
    }

    warn(`Found ${outdatedPackages.length} outdated dependencies:\n`);

    const maxNameLength = Math.max(15, ...outdatedPackages.map(name => name.length));
    const header = '─'.repeat(maxNameLength + 32);

    log(`┌${header}┐`, 'white');
    log(`│ ${'Package'.padEnd(maxNameLength)} │ Current │ Wanted  │ Latest  │`, 'bright');
    log(`├${header.replace(/./g, '─')}┤`, 'white');

    for (const [pkg, { current, wanted, latest }] of Object.entries(outdatedData)) {
      log(
        `│ ${pkg.padEnd(maxNameLength)} │ ${(current || 'N/A').padEnd(7)} │ ${(wanted || 'N/A').padEnd(7)} │ ${(latest || 'N/A').padEnd(7)} │`,
        'white'
      );
    }

    log(`└${header}┘`, 'white');

    log('\nUpdate Options:', 'bright');
    log('  npm update                    - Update to wanted versions', 'cyan');
    log('  npm update <package>          - Update specific package', 'cyan');
    log('  npm install <pkg>@latest      - Force latest version', 'cyan');

    const shouldUpdate = await askQuestion('\nUpdate all to wanted versions? (y/N): ');
    if (shouldUpdate.toLowerCase() === 'y') {
      await updateDependencies();
    }
  } catch (err) {
    spinner.stop();
    if (err.code === 'ETIMEDOUT') {
      error('Check timed out. Network or registry issue.');
    } else if (err.stderr?.includes('ENOLOCK')) {
      error('Missing package-lock.json. Run `npm install` first.');
    } else {
      error(`Check failed: ${err.message.split('\n')[0]}`);
    }
  }
}

async function updateDependencies() {
  const spinner = createSpinner('Updating dependencies...');
  try {
    const startTime = Date.now();
    const { stderr } = await execAsync('npm update', { timeout: 180000 });
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    spinner.stop();
    success(`Dependencies updated in ${duration}s`);
    if (stderr) warn(`Warnings: ${stderr.split('\n')[0]}`);

    await showInstallationSummary();
  } catch (err) {
    spinner.stop();
    error(`Update failed: ${err.message.split('\n')[0]}`);
  }
}

// Clean node_modules (cross-platform)
async function cleanNodeModules() {
  if (!validateProjectDirectory()) return;

  warn('This will remove node_modules, package-lock.json, and reinstall.');
  const answer = await askQuestion('Continue? (y/N): ');
  if (answer.toLowerCase() !== 'y') {
    info('Cancelled.');
    return;
  }

  const spinner = createSpinner('Cleaning...');

  try {
    // Remove node_modules
    if (fs.existsSync('node_modules')) {
      await execAsync(os.platform() === 'win32' ? 'rmdir /s /q node_modules' : 'rm -rf node_modules');
    }

    // Remove lockfile
    if (fs.existsSync('package-lock.json')) {
      fs.unlinkSync('package-lock.json');
    }

    // Clear cache
    await execAsync('npm cache clean --force');

    // Reinstall
    const startTime = Date.now();
    await execAsync('npm install');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    spinner.stop();
    success(`Clean install complete in ${duration}s`);
    await showInstallationSummary();
  } catch (err) {
    spinner.stop();
    error(`Clean failed: ${err.message}`);
  }
}

// Clear caches
async function clearCache() {
  warn('This will clear npm cache and common project caches.');
  const answer = await askQuestion('Proceed? (y/N): ');
  if (answer.toLowerCase() !== 'y') {
    info('Cancelled.');
    return;
  }

  const spinner = createSpinner('Clearing caches...');

  try {
    await execAsync('npm cache clean --force');
    const cacheDirs = ['.cache', '.next', 'dist', '.nuxt', 'build', 'node_modules/.cache'];

    let cleared = 0;
    for (const dir of cacheDirs) {
      if (fs.existsSync(dir)) {
        try {
          await execAsync(os.platform() === 'win32' ? `rmdir /s /q "${dir}"` : `rm -rf "${dir}"`);
          cleared++;
        } catch {}
      }
    }

    spinner.stop();
    success(`npm cache cleared. Removed ${cleared} cache directories.`);
  } catch (err) {
    spinner.stop();
    error(`Cache clear failed: ${err.message}`);
  }
}

// Health check
async function healthCheck() {
  log('\nFolonite.js Health Check', 'bright');
  log('='.padEnd(30, '='), 'bright');

  const checks = [
    { name: 'package.json', check: () => fs.existsSync('./package.json'), fix: 'npm init' },
    { name: 'node_modules', check: () => fs.existsSync('./node_modules'), fix: 'npm install' },
    { name: 'src/', check: () => fs.existsSync('./src'), fix: 'mkdir src' },
    { name: 'server.js', check: () => fs.existsSync('./server.js'), fix: 'touch server.js' },
    { name: 'src/fml/', check: () => fs.existsSync('./src/fml'), fix: 'Create FML structure' },
    { name: 'src/components/', check: () => fs.existsSync('./src/components'), fix: 'mkdir -p src/components' },
    { name: 'src/pages/', check: () => fs.existsSync('./src/pages'), fix: 'mkdir -p src/pages' },
  ];

  let passed = 0;
  const failures = [];

  for (const { name, check, fix } of checks) {
    const ok = check();
    const status = ok ? colorize('PASS', 'green') : colorize('FAIL', 'red');
    log(`${status} ${name}`, 'white');
    if (ok) passed++; else failures.push({ name, fix });
  }

  const [major] = process.version.slice(1).split('.').map(Number);
  const nodeOk = major >= 16;
  const nodeStatus = nodeOk ? colorize('PASS', 'green') : colorize('FAIL', 'red');
  log(`${nodeStatus} Node.js ${process.version} (>=16)`, 'white');
  if (!nodeOk) failures.push({ name: 'Node.js version', fix: 'Upgrade to Node.js 16+' });
  else passed++;

  log('\nSystem Info:', 'bright');
  log(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`, 'cyan');
  log(`  Uptime: ${Math.round(process.uptime())}s`, 'cyan');
  log(`  CPUs: ${os.cpus().length}`, 'cyan');

  log(`\nHealth Score: ${passed}/${checks.length + 1}`, passed === checks.length + 1 ? 'green' : 'yellow');

  if (failures.length > 0) {
    log('\nSuggested Fixes:', 'yellow');
    failures.forEach(f => log(`  ${f.name}: ${f.fix}`, 'cyan'));
  }
}

// Start dev server
async function startDevServer() {
  if (!validateProjectDirectory()) return;
  if (!fs.existsSync('./server.js')) {
    error('server.js not found.');
    return;
  }

  info('Starting development server...');

  try {
    await execAsync('npx nodemon --version');
  } catch {
    warn('Installing nodemon...');
    const spinner = createSpinner('Installing nodemon...');
    try {
      await execAsync('npm install --save-dev nodemon');
      spinner.stop();
    } catch (err) {
      spinner.stop();
      error('nodemon install failed. Using node...');
    }
  }

  const useNodemon = fs.existsSync('./node_modules/nodemon');
  const [cmd, ...args] = useNodemon ? ['npx', 'nodemon', 'server.js'] : ['node', 'server.js'];

  info(`Using ${useNodemon ? 'nodemon' : 'node'}`);

  const child = spawn(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, NODE_ENV: 'development' } });

  child.on('close', (code) => {
    if (code !== 0) error(`Server exited with code ${code}`);
  });

  process.on('SIGINT', () => {
    info('Shutting down...');
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 2000);
    process.exit(0);
  });
}

// Generate structure
async function generateStructure() {
  const structure = `
📁 Folonite.js Project Structure:
├── 📄 package.json
├── 📄 server.js
├── 📁 src/
│   ├── 📁 api/
│   ├── 📁 components/
│   ├── 📁 pages/
│   ├── 📁 views/
│   └── 📁 fml/
├── 📁 public/
│   ├── 📄 script.js
│   └── 📁 styles/
└── 📁 scripts/
`;

  log(structure, 'cyan');

  const dirs = ['src', 'src/api', 'src/components', 'src/pages', 'src/views', 'public', 'public/styles', 'scripts'];
  const missing = dirs.filter(d => !fs.existsSync(d));

  if (missing.length > 0) {
    log(`\nMissing: ${missing.length} directories`, 'yellow');
    missing.forEach(d => log(`  ${d}`, 'red'));

    const create = await askQuestion('Create them? (y/N): ');
    if (create.toLowerCase() === 'y') {
      missing.forEach(d => fs.mkdirSync(d, { recursive: true }));
      success(`Created ${missing.length} directories`);
    }
  } else {
    success('All directories exist.');
  }
}

// Backend toggle
async function toggleBackend(enable) {
  const dir = './src';
  const file = `${dir}/config.js`;

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let content = '';
  if (fs.existsSync(file)) {
    content = fs.readFileSync(file, 'utf-8');
    if (content.includes('backendEnabled:')) {
      content = content.replace(/backendEnabled:\s*(true|false)/, `backendEnabled: ${enable}`);
    } else {
      content = content.replace(/(export const config = \{)/, `$1\n  backendEnabled: ${enable},`);
    }
  } else {
    content = `// Folonite.js Config
export const config = {
  backendEnabled: ${enable},
  port: process.env.PORT || 3000,
  environment: process.env.NODE_ENV || 'development'
};
export default config;
`;
  }

  fs.writeFileSync(file, content);
  success(`Backend ${enable ? 'enabled' : 'disabled'}`);
  if (enable && !fs.existsSync('src/api')) {
    fs.mkdirSync('src/api', { recursive: true });
    info('Created src/api/');
  }
}

// Help
function showHelp() {
  const help = `
${colorize('Folonite.js CLI', 'bright')}
${'='.padEnd(40, '=')}

${colorize('Management:', 'green')}
  version           Project & dependency versions
  dependencies      Install all deps
  backend:dependencies   Install express, compression
  outdated          Check for updates
  clean             Reinstall dependencies
  cache             Clear caches

${colorize('Dev:', 'blue')}
  dev               Start dev server
  health            Run diagnostics
  structure         Show project layout

${colorize('Config:', 'magenta')}
  enable:backend    Enable backend mode
  disable:backend   Disable backend

${colorize('Info:', 'cyan')}
  help              Show this

${colorize('Example:', 'yellow')}
  folonite dev
  folonite outdated
`;
  console.log(help);
}

// Main
async function main() {
  try {
    const cmd = args[0] || 'help';

    switch (cmd) {
      case '--version':
      case 'version': await checkVersion(); break;
      case 'dependencies': await installDependencies(); break;
      case 'backend:dependencies': await installDependencies('backend'); break;
      case 'dev:dependencies': await installDependencies('dev'); break;
      case 'outdated': await checkOutdatedDependencies(); break;
      case 'clean': await cleanNodeModules(); break;
      case 'cache': await clearCache(); break;
      case 'health': await healthCheck(); break;
      case 'dev': await startDevServer(); break;
      case 'structure': await generateStructure(); break;
      case 'enable:backend': await toggleBackend(true); break;
      case 'disable:backend': await toggleBackend(false); break;
      case 'help':
      case '-h':
      case '--help': showHelp(); break;
      default:
        error(`Unknown command: ${cmd}`);
        info('Use "folonite help"');
        process.exit(1);
    }
  } catch (err) {
    error(`Command failed: ${err.message}`);
    process.exit(1);
  }
}

// Graceful shutdown
['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => {
    log(`\n${sig} received. Exiting.`, 'cyan');
    process.exit(0);
  });
});

// Run
main();