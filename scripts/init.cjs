#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const FOLONITE_PACKAGE = 'folonite.js';
const REQUIRED_NODE_VERSION = 16;

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
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

class FoloniteInitializer {
  constructor() {
    this.currentDir = process.cwd();
    this.projectName = path.basename(this.currentDir);
    this.packagePath = null;
    this.stats = {
      filesCreated: 0,
      directoriesCreated: 0,
      errors: 0,
      startTime: Date.now()
    };
  }

  async initialize() {
    try {
      log('\nFolonite.js Project Initializer', 'bright');
      log('================================', 'bright');
      
      await this.validateEnvironment();
      await this.locatePackage();
      await this.checkExistingProject();
      await this.copyFramework();
      await this.setupProject();
      await this.installDependencies();
      this.showCompletionMessage();
      
    } catch (err) {
      error(`Initialization failed: ${err.message}`);
      process.exit(1);
    }
  }

  async validateEnvironment() {
    info('Validating environment...');
    
    // Check Node.js version
    const nodeVersion = parseInt(process.version.slice(1));
    if (nodeVersion < REQUIRED_NODE_VERSION) {
      throw new Error(`Node.js ${REQUIRED_NODE_VERSION}+ required. Current: ${process.version}`);
    }
    
    // Check npm availability
    try {
      execSync('npm --version', { stdio: 'pipe' });
    } catch {
      throw new Error('npm is required but not found');
    }
    
    // Check write permissions
    try {
      fs.accessSync(this.currentDir, fs.constants.W_OK);
    } catch {
      throw new Error('No write permission in current directory');
    }
    
    success('Environment validation passed');
  }

  async locatePackage() {
    info('Locating Folonite.js package...');
    
    const possiblePaths = [
      // Local node_modules
      path.join(this.currentDir, 'node_modules', FOLONITE_PACKAGE),
      // Parent node_modules (for global installs)
      path.join(this.currentDir, '..', 'node_modules', FOLONITE_PACKAGE),
      // Global node_modules
      path.join(require.main.path, '..', FOLONITE_PACKAGE),
      // npm global directory
      this.getNpmGlobalPath()
    ].filter(Boolean);

    for (const packagePath of possiblePaths) {
      if (fs.existsSync(packagePath)) {
        this.packagePath = packagePath;
        success(`Found Folonite.js at: ${packagePath}`);
        return;
      }
    }

    throw new Error(`Folonite.js package not found. Install with: npm install ${FOLONITE_PACKAGE}`);
  }

  getNpmGlobalPath() {
    try {
      const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
      return path.join(globalPath, FOLONITE_PACKAGE);
    } catch {
      return null;
    }
  }

  async checkExistingProject() {
    const existingFiles = [
      'package.json',
      'server.js',
      'src'
    ];

    const foundFiles = existingFiles.filter(file => 
      fs.existsSync(path.join(this.currentDir, file))
    );

    if (foundFiles.length > 0) {
      warn(`Existing project files detected: ${foundFiles.join(', ')}`);
      
      // In a real CLI, you'd prompt the user here
      // For now, we'll continue but warn about overwrites
      warn('Some files may be overwritten during initialization');
    }
  }

  async copyFramework() {
    info('Copying Folonite.js framework...');
    
    const excludePatterns = [
      'node_modules',
      '.git',
      '.npm',
      'package-lock.json',
      '.DS_Store',
      'Thumbs.db',
      '*.log',
      'dist',
      'build',
      'coverage'
    ];

    await this.copyDirectoryRecursive(
      this.packagePath,
      this.currentDir,
      excludePatterns
    );

    success(`Framework copied: ${this.stats.filesCreated} files, ${this.stats.directoriesCreated} directories`);
  }

  async copyDirectoryRecursive(srcDir, destDir, excludePatterns = []) {
    if (!fs.existsSync(srcDir)) {
      throw new Error(`Source directory not found: ${srcDir}`);
    }

    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      // Check if entry should be excluded
      if (this.shouldExclude(entry.name, excludePatterns)) {
        continue;
      }

      try {
        if (entry.isDirectory()) {
          await this.ensureDirectory(destPath);
          this.stats.directoriesCreated++;
          await this.copyDirectoryRecursive(srcPath, destPath, excludePatterns);
        } else if (entry.isFile()) {
          await this.copyFileWithBackup(srcPath, destPath);
          this.stats.filesCreated++;
        }
      } catch (err) {
        warn(`Failed to copy ${srcPath}: ${err.message}`);
        this.stats.errors++;
      }
    }
  }

  shouldExclude(name, patterns) {
    return patterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple glob pattern matching
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern;
    });
  }

  async ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async copyFileWithBackup(srcPath, destPath) {
    // Create backup if file exists
    if (fs.existsSync(destPath)) {
      const backupPath = `${destPath}.backup.${Date.now()}`;
      fs.copyFileSync(destPath, backupPath);
    }

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await this.ensureDirectory(destDir);

    // Copy file
    fs.copyFileSync(srcPath, destPath);
  }

  async setupProject() {
    info('Setting up project configuration...');
    
    await this.updatePackageJson();
    await this.createProjectStructure();
    await this.setupEnvironment();
    
    success('Project configuration complete');
  }

  async updatePackageJson() {
    const packageJsonPath = path.join(this.currentDir, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      warn('package.json not found, creating default');
      await this.createDefaultPackageJson();
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Update project-specific fields
      packageJson.name = this.projectName;
      packageJson.version = '1.0.0';
      packageJson.description = `A Folonite.js application`;
      packageJson.private = true;
      
      // Ensure required scripts exist
      packageJson.scripts = {
        start: 'node server.js',
        dev: 'nodemon server.js',
        folonite: 'node scripts/cli.js',
        marketplace: 'node scripts/marketplace.js',
        ...packageJson.scripts
      };

      // Write updated package.json
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2),
        'utf8'
      );
      
      success('package.json updated');
    } catch (err) {
      warn(`Failed to update package.json: ${err.message}`);
    }
  }

  async createDefaultPackageJson() {
    const defaultPackageJson = {
      name: this.projectName,
      version: '1.0.0',
      description: 'A Folonite.js application',
      type: 'module',
      main: 'server.js',
      private: true,
      scripts: {
        start: 'node server.js',
        dev: 'nodemon server.js',
        folonite: 'node scripts/cli.js',
        marketplace: 'node scripts/marketplace.js',
        build: 'esbuild src/pages/home.js --bundle --minify --outdir=dist'
      },
      keywords: [
        'folonite',
        'ssr',
        'fml',
        'web-framework'
      ],
      dependencies: {
        'compression': '^1.7.4',
        'express': '^4.17.1'
      },
      devDependencies: {
        'nodemon': '^2.0.7',
        'esbuild': '^0.24.0'
      }
    };

    fs.writeFileSync(
      path.join(this.currentDir, 'package.json'),
      JSON.stringify(defaultPackageJson, null, 2),
      'utf8'
    );
  }

  async createProjectStructure() {
    const requiredDirs = [
      'src/api',
      'src/components',
      'src/pages',
      'src/views',
      'src/fml',
      'public/styles',
      'scripts'
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(this.currentDir, dir);
      if (!fs.existsSync(dirPath)) {
        await this.ensureDirectory(dirPath);
        this.stats.directoriesCreated++;
      }
    }

    // Create example files if they don't exist
    await this.createExampleFiles();
  }

  async createExampleFiles() {
    const examples = [
      {
        path: 'src/pages/welcome.js',
        content: this.getWelcomePageContent()
      },
      {
        path: 'src/components/WelcomeCard.js',
        content: this.getWelcomeCardContent()
      },
      {
        path: 'public/styles/welcome.css',
        content: this.getWelcomeCSSContent()
      },
      {
        path: '.gitignore',
        content: this.getGitignoreContent()
      },
      {
        path: 'README.md',
        content: this.getReadmeContent()
      }
    ];

    for (const example of examples) {
      const filePath = path.join(this.currentDir, example.path);
      if (!fs.existsSync(filePath)) {
        await this.ensureDirectory(path.dirname(filePath));
        fs.writeFileSync(filePath, example.content, 'utf8');
        this.stats.filesCreated++;
      }
    }
  }

  async setupEnvironment() {
    // Create .env file if it doesn't exist
    const envPath = path.join(this.currentDir, '.env');
    if (!fs.existsSync(envPath)) {
      const envContent = `# Folonite.js Environment Configuration
NODE_ENV=development
PORT=3000
DEBUG=folonite:*
`;
      fs.writeFileSync(envPath, envContent, 'utf8');
    }
  }

  async installDependencies() {
    info('Installing dependencies...');
    
    try {
      execSync('npm install', {
        cwd: this.currentDir,
        stdio: 'pipe'
      });
      success('Dependencies installed successfully');
    } catch (err) {
      warn('Failed to install dependencies automatically');
      info('Run "npm install" manually to install dependencies');
    }
  }

  showCompletionMessage() {
    const duration = Date.now() - this.stats.startTime;
    
    log('\n' + '='.repeat(50), 'bright');
    success('Folonite.js project initialized successfully!');
    log('='.repeat(50), 'bright');
    
    log('\nProject Statistics:', 'bright');
    log(`  Files created: ${this.stats.filesCreated}`);
    log(`  Directories created: ${this.stats.directoriesCreated}`);
    log(`  Errors: ${this.stats.errors}`);
    log(`  Time taken: ${duration}ms`);
    
    log('\nQuick Start:', 'bright');
    log('  npm run dev        Start development server');
    log('  npm run folonite   Access CLI tools');
    log('  npm start          Start production server');
    
    log('\nProject Structure:', 'bright');
    log('  src/pages/         Page components (.js/.fml)');
    log('  src/components/    Reusable components');
    log('  src/api/           API routes');
    log('  src/fml/           FML template engine');
    log('  public/            Static assets');
    
    log('\nNext Steps:', 'bright');
    log('  1. cd into your project directory');
    log('  2. Run "npm run dev" to start development');
    log('  3. Open http://localhost:3000');
    log('  4. Start building your application!');
    
    log('\nDocumentation:', 'bright');
    log('  https://github.com/FFFSTANZA/Folonite.js');
    
    log('\n' + '='.repeat(50), 'bright');
    success('Happy coding with Folonite.js!');
  }

  // Content generators for example files
  getGitignoreContent() {
    return `# Dependencies
node_modules/

# Environment variables
.env
.env.local
.env.production

# Logs
logs
*.log
npm-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# Build outputs
dist/
build/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Editor directories and files
.vscode/
.idea/
*.swp
*.swo

# Temporary files
tmp/
temp/
`;
  }

  getReadmeContent() {
    return `# ${this.projectName}

A Folonite.js application

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start development server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Open http://localhost:3000

## Project Structure

\`\`\`
${this.projectName}/
├── src/
│   ├── api/           # API routes
│   ├── components/    # Reusable components
│   ├── pages/         # Page components
│   ├── views/         # View rendering logic
│   └── fml/           # FML template engine
├── public/            # Static assets
├── scripts/           # Build scripts
└── server.js          # Main server file
\`\`\`

## Available Scripts

- \`npm run dev\` - Start development server with hot reload
- \`npm start\` - Start production server
- \`npm run folonite\` - Access CLI tools
- \`npm run marketplace\` - Access component marketplace

## License

MIT
`;
  }
}

// Main execution
if (require.main === module) {
  const initializer = new FoloniteInitializer();
  initializer.initialize().catch(err => {
    console.error('Initialization failed:', err.message);
    process.exit(1);
  });
}

module.exports = FoloniteInitializer;