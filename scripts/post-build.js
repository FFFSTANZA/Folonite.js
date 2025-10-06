#!/usr/bin/env node

/**
 * Folonite.js Post-Build Script
 * Filename: scripts/post-build.js
 * 
 * Runs additional tasks after the main build completes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function postBuild() {
  log('\n Running post-build tasks...', 'bright');
  
  try {
    // 1. Verify build output
    await verifyBuildOutput();
    
    // 2. Generate size report
    await generateSizeReport();
    
    // 3. Create deployment instructions
    await createDeploymentGuide();
    
    // 4. Validate production build
    await validateProductionBuild();
    
    log('\n Post-build tasks completed successfully!', 'green');
  } catch (error) {
    log(`\n❌ Post-build failed: ${error.message}`, 'yellow');
    process.exit(1);
  }
}

async function verifyBuildOutput() {
  log('\n🔍 Verifying build output...', 'cyan');
  
  const requiredFiles = [
    'dist/server.js',
    'dist/package.json',
    'dist/build-metadata.json'
  ];
  
  const missing = [];
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      missing.push(file);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required files: ${missing.join(', ')}`);
  }
  
  log('  ✓ All required files present', 'green');
}

async function generateSizeReport() {
  log('\n Generating size report...', 'cyan');
  
  const distDir = './dist';
  
  if (!fs.existsSync(distDir)) {
    log('  ⚠ Dist directory not found', 'yellow');
    return;
  }
  
  const sizes = {};
  const categories = {
    pages: 'dist/pages',
    components: 'dist/components',
    assets: 'dist/assets',
    static: 'dist/static',
    server: 'dist/server.js'
  };
  
  let totalSize = 0;
  
  for (const [name, dir] of Object.entries(categories)) {
    if (fs.existsSync(dir)) {
      const size = getDirectorySize(dir);
      sizes[name] = size;
      totalSize += size;
    }
  }
  
  // Create report
  const report = {
    timestamp: new Date().toISOString(),
    totalSize: formatSize(totalSize),
    breakdown: Object.entries(sizes).map(([name, size]) => ({
      category: name,
      size: formatSize(size),
      percentage: ((size / totalSize) * 100).toFixed(1) + '%'
    }))
  };
  
  fs.writeFileSync(
    path.join(distDir, 'size-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  log('  ✓ Size report generated', 'green');
  log(`\n  Total Build Size: ${report.totalSize}`, 'bright');
  report.breakdown.forEach(item => {
    log(`    ${item.category}: ${item.size} (${item.percentage})`, 'cyan');
  });
}

function getDirectorySize(dirPath) {
  let size = 0;
  
  if (fs.statSync(dirPath).isFile()) {
    return fs.statSync(dirPath).size;
  }
  
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  }
  
  return size;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function createDeploymentGuide() {
  log('\n📝 Creating deployment guide...', 'cyan');
  
  const guide = `# Deployment Guide

## Quick Start

1. **Upload the \`dist\` folder to your server**

2. **Install production dependencies:**
   \`\`\`bash
   cd dist
   npm install --production
   \`\`\`

3. **Configure environment variables:**
   \`\`\`bash
   cp .env.example .env
   nano .env
   \`\`\`

4. **Start the application:**
   \`\`\`bash
   NODE_ENV=production node server.js
   \`\`\`

## Environment Variables

\`\`\`env
NODE_ENV=production
PORT=3000
\`\`\`

## Using PM2 (Recommended)

\`\`\`bash
npm install -g pm2
pm2 start server.js --name "folonite-app"
pm2 save
pm2 startup
\`\`\`

## Using Docker

\`\`\`dockerfile
FROM node:18-alpine
WORKDIR /app
COPY dist/ .
RUN npm install --production
EXPOSE 3000
CMD ["node", "server.js"]
\`\`\`

Build and run:
\`\`\`bash
docker build -t folonite-app .
docker run -p 3000:3000 -e NODE_ENV=production folonite-app
\`\`\`

## Nginx Configuration

\`\`\`nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
\`\`\`

## Health Check

Your application exposes a health check endpoint at \`/health\`

\`\`\`bash
curl http://localhost:3000/health
\`\`\`

## Troubleshooting

- **Port already in use:** Change the PORT environment variable
- **Module not found:** Run \`npm install --production\` in the dist folder
- **Permission denied:** Check file permissions and user privileges

## Support

For more information, visit: https://fffstanza.github.io/Folonite.js-Doc/
`;

  fs.writeFileSync('./dist/DEPLOYMENT.md', guide);
  log('  ✓ Deployment guide created', 'green');
}

async function validateProductionBuild() {
  log('\n🔬 Validating production build...', 'cyan');
  
  const checks = [
    {
      name: 'Server entry point',
      check: () => fs.existsSync('dist/server.js')
    },
    {
      name: 'Package.json exists',
      check: () => fs.existsSync('dist/package.json')
    },
    {
      name: 'No dev dependencies',
      check: () => {
        const pkg = JSON.parse(fs.readFileSync('dist/package.json', 'utf8'));
        return !pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0;
      }
    },
    {
      name: 'Build metadata present',
      check: () => fs.existsSync('dist/build-metadata.json')
    }
  ];
  
  let passed = 0;
  
  for (const { name, check } of checks) {
    try {
      if (check()) {
        log(`  ✓ ${name}`, 'green');
        passed++;
      } else {
        log(`  ✗ ${name}`, 'yellow');
      }
    } catch (error) {
      log(`  ✗ ${name}: ${error.message}`, 'yellow');
    }
  }
  
  log(`\n  Validation: ${passed}/${checks.length} checks passed`, 'bright');
  
  if (passed < checks.length) {
    log('  ⚠ Some validation checks failed', 'yellow');
  }
}

// Run post-build
postBuild();