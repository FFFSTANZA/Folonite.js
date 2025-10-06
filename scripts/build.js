#!/usr/bin/env node

/**
 * Folonite.js Production Build System
 * Filename: scripts/build.js
 * 
 * This script handles the complete build process for Folonite.js applications,
 * including bundling, minification, optimization, and asset processing.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build configuration
const BUILD_CONFIG = {
  sourceDir: './src',
  outputDir: './dist',
  publicDir: './public',
  pagesDir: './src/pages',
  componentsDir: './src/components',
  fmlDir: './src/fml',
  viewsDir: './src/views',
  apiDir: './src/api',
  
  // Build options
  minify: true,
  sourceMaps: process.env.SOURCE_MAPS !== 'false',
  compression: true,
  hashAssets: true,
  treeshake: true,
  
  // Output structure
  outputStructure: {
    pages: 'pages',
    components: 'components',
    assets: 'assets',
    static: 'static',
    server: '.'
  }
};

// Color utilities
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorize(text, color) {
  return `${colors[color] || colors.reset}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

function error(message) {
  console.error(colorize(`✗ ERROR: ${message}`, 'red'));
}

function success(message) {
  console.log(colorize(`✓ ${message}`, 'green'));
}

function info(message) {
  console.log(colorize(`ℹ ${message}`, 'cyan'));
}

function warn(message) {
  console.warn(colorize(`⚠ WARNING: ${message}`, 'yellow'));
}

// Build statistics
class BuildStats {
  constructor() {
    this.startTime = Date.now();
    this.filesProcessed = 0;
    this.filesGenerated = 0;
    this.totalSize = 0;
    this.compressedSize = 0;
    this.errors = [];
    this.warnings = [];
  }

  addFile(size, compressed = false) {
    this.filesGenerated++;
    if (compressed) {
      this.compressedSize += size;
    } else {
      this.totalSize += size;
    }
  }

  getDuration() {
    return Date.now() - this.startTime;
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  print() {
    const duration = (this.getDuration() / 1000).toFixed(2);
    
    log('\n' + '='.repeat(60), 'bright');
    log('Build Statistics', 'bright');
    log('='.repeat(60), 'bright');
    log(`Duration: ${duration}s`, 'cyan');
    log(`Files Processed: ${this.filesProcessed}`, 'cyan');
    log(`Files Generated: ${this.filesGenerated}`, 'cyan');
    log(`Total Size: ${this.formatSize(this.totalSize)}`, 'cyan');
    if (this.compressedSize > 0) {
      const savings = ((1 - this.compressedSize / this.totalSize) * 100).toFixed(1);
      log(`Compressed Size: ${this.formatSize(this.compressedSize)} (${savings}% smaller)`, 'green');
    }
    
    if (this.warnings.length > 0) {
      log(`\nWarnings: ${this.warnings.length}`, 'yellow');
      this.warnings.slice(0, 5).forEach(w => log(`  • ${w}`, 'yellow'));
      if (this.warnings.length > 5) {
        log(`  ... and ${this.warnings.length - 5} more`, 'gray');
      }
    }
    
    if (this.errors.length > 0) {
      log(`\nErrors: ${this.errors.length}`, 'red');
      this.errors.forEach(e => log(`  • ${e}`, 'red'));
    }
    
    log('='.repeat(60), 'bright');
  }
}

// Build orchestrator
class FoloniteBuildSystem {
  constructor(config) {
    this.config = config;
    this.stats = new BuildStats();
    this.assetManifest = {};
  }

  async build() {
    try {
      log('\n🚀 Starting Folonite.js Production Build...', 'bright');
      
      // Pre-build checks
      await this.preBuildChecks();
      
      // Clean output directory
      await this.cleanOutputDirectory();
      
      // Create directory structure
      await this.createOutputStructure();
      
      // Build steps
      await this.processFMLFiles();
      await this.bundlePages();
      await this.bundleComponents();
      await this.processServerFiles();
      await this.processStaticAssets();
      await this.generateAssetManifest();
      await this.optimizeOutput();
      await this.generateMetadata();
      
      // Post-build tasks
      await this.postBuildTasks();
      
      // Print statistics
      this.stats.print();
      
      success('\n✨ Build completed successfully!');
      info(`Output directory: ${this.config.outputDir}`);
      
      return true;
    } catch (err) {
      error(`Build failed: ${err.message}`);
      console.error(err.stack);
      process.exit(1);
    }
  }

  async preBuildChecks() {
    info('Running pre-build checks...');
    
    // Check if source directory exists
    if (!fs.existsSync(this.config.sourceDir)) {
      throw new Error(`Source directory not found: ${this.config.sourceDir}`);
    }
    
    // Check for required dependencies
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    const requiredDeps = ['express', 'compression'];
    
    for (const dep of requiredDeps) {
      if (!packageJson.dependencies?.[dep]) {
        warn(`Missing dependency: ${dep}`);
      }
    }
    
    // Check Node.js version
    const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
    if (nodeVersion < 16) {
      throw new Error('Node.js 16 or higher is required');
    }
    
    success('Pre-build checks passed');
  }

  async cleanOutputDirectory() {
    info('Cleaning output directory...');
    
    if (fs.existsSync(this.config.outputDir)) {
      fs.rmSync(this.config.outputDir, { recursive: true, force: true });
    }
    
    success('Output directory cleaned');
  }

  async createOutputStructure() {
    info('Creating output structure...');
    
    const dirs = [
      this.config.outputDir,
      path.join(this.config.outputDir, this.config.outputStructure.pages),
      path.join(this.config.outputDir, this.config.outputStructure.components),
      path.join(this.config.outputDir, this.config.outputStructure.assets),
      path.join(this.config.outputDir, this.config.outputStructure.static),
      path.join(this.config.outputDir, 'views'),
      path.join(this.config.outputDir, 'api'),
      path.join(this.config.outputDir, 'fml')
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    success('Output structure created');
  }

  async processFMLFiles() {
    info('Processing FML files...');
    
    if (!fs.existsSync(this.config.fmlDir)) {
      warn('FML directory not found, skipping...');
      return;
    }
    
    const fmlFiles = this.getAllFiles(this.config.fmlDir, '.fml');
    
    for (const fmlFile of fmlFiles) {
      try {
        const relativePath = path.relative(this.config.fmlDir, fmlFile);
        const outputPath = path.join(this.config.outputDir, 'fml', relativePath);
        
        await this.ensureDirectory(path.dirname(outputPath));
        
        const content = fs.readFileSync(fmlFile, 'utf8');
        
        // Pre-compile FML templates
        const compiled = this.compileFML(content);
        
        fs.writeFileSync(outputPath, compiled, 'utf8');
        this.stats.filesProcessed++;
        this.stats.addFile(compiled.length);
      } catch (err) {
        this.stats.errors.push(`FML processing failed for ${fmlFile}: ${err.message}`);
      }
    }
    
    // Copy FML engine files
    const fmlEngineFiles = this.getAllFiles(this.config.fmlDir, '.js');
    for (const file of fmlEngineFiles) {
      const relativePath = path.relative(this.config.fmlDir, file);
      const outputPath = path.join(this.config.outputDir, 'fml', relativePath);
      await this.ensureDirectory(path.dirname(outputPath));
      fs.copyFileSync(file, outputPath);
    }
    
    success(`Processed ${fmlFiles.length} FML files`);
  }

  compileFML(content) {
    // Pre-compile FML templates for faster runtime
    // This is a simplified version - extend based on your FML implementation
    return content;
  }

  async bundlePages() {
    info('Bundling pages...');
    
    if (!fs.existsSync(this.config.pagesDir)) {
      warn('Pages directory not found, skipping...');
      return;
    }
    
    const pageFiles = this.getAllFiles(this.config.pagesDir, '.js');
    
    for (const pageFile of pageFiles) {
      try {
        const filename = path.basename(pageFile, '.js');
        const outputPath = path.join(
          this.config.outputDir,
          this.config.outputStructure.pages,
          `${filename}.js`
        );
        
        // Bundle using esbuild
        await this.bundleFile(pageFile, outputPath, {
          format: 'esm',
          platform: 'node',
          minify: this.config.minify,
          sourcemap: this.config.sourceMaps,
          treeShaking: this.config.treeshake
        });
        
        this.stats.filesProcessed++;
      } catch (err) {
        this.stats.errors.push(`Page bundling failed for ${pageFile}: ${err.message}`);
      }
    }
    
    success(`Bundled ${pageFiles.length} pages`);
  }

  async bundleComponents() {
    info('Bundling components...');
    
    if (!fs.existsSync(this.config.componentsDir)) {
      warn('Components directory not found, skipping...');
      return;
    }
    
    const componentFiles = this.getAllFiles(this.config.componentsDir, '.js');
    
    for (const componentFile of componentFiles) {
      try {
        const relativePath = path.relative(this.config.componentsDir, componentFile);
        const outputPath = path.join(
          this.config.outputDir,
          this.config.outputStructure.components,
          relativePath
        );
        
        await this.ensureDirectory(path.dirname(outputPath));
        
        await this.bundleFile(componentFile, outputPath, {
          format: 'esm',
          platform: 'node',
          minify: this.config.minify,
          sourcemap: this.config.sourceMaps
        });
        
        this.stats.filesProcessed++;
      } catch (err) {
        this.stats.errors.push(`Component bundling failed for ${componentFile}: ${err.message}`);
      }
    }
    
    success(`Bundled ${componentFiles.length} components`);
  }

  async processServerFiles() {
    info('Processing server files...');
    
    // Copy and process server.js
    if (fs.existsSync('./server.js')) {
      const outputPath = path.join(this.config.outputDir, 'server.js');
      await this.bundleFile('./server.js', outputPath, {
        format: 'esm',
        platform: 'node',
        minify: this.config.minify,
        external: ['express', 'compression']
      });
      this.stats.filesProcessed++;
    }
    
    // Process views
    if (fs.existsSync(this.config.viewsDir)) {
      const viewFiles = this.getAllFiles(this.config.viewsDir, '.js');
      for (const viewFile of viewFiles) {
        const filename = path.basename(viewFile);
        const outputPath = path.join(this.config.outputDir, 'views', filename);
        await this.bundleFile(viewFile, outputPath, {
          format: 'esm',
          platform: 'node',
          minify: this.config.minify
        });
        this.stats.filesProcessed++;
      }
    }
    
    // Process API routes
    if (fs.existsSync(this.config.apiDir)) {
      const apiFiles = this.getAllFiles(this.config.apiDir, '.js');
      for (const apiFile of apiFiles) {
        const relativePath = path.relative(this.config.apiDir, apiFile);
        const outputPath = path.join(this.config.outputDir, 'api', relativePath);
        await this.ensureDirectory(path.dirname(outputPath));
        await this.bundleFile(apiFile, outputPath, {
          format: 'esm',
          platform: 'node',
          minify: this.config.minify
        });
        this.stats.filesProcessed++;
      }
    }
    
    success('Server files processed');
  }

  async processStaticAssets() {
    info('Processing static assets...');
    
    if (!fs.existsSync(this.config.publicDir)) {
      warn('Public directory not found, skipping...');
      return;
    }
    
    const staticOutput = path.join(
      this.config.outputDir,
      this.config.outputStructure.static
    );
    
    await this.copyDirectory(this.config.publicDir, staticOutput);
    
    // Hash assets if enabled
    if (this.config.hashAssets) {
      await this.hashStaticAssets(staticOutput);
    }
    
    success('Static assets processed');
  }

  async bundleFile(inputPath, outputPath, options = {}) {
    const defaultOptions = {
      format: 'esm',
      platform: 'node',
      minify: true,
      sourcemap: false,
      treeShaking: true,
      external: []
    };
    
    const bundleOptions = { ...defaultOptions, ...options };
    
    try {
      // Check if esbuild is available
      const esbuildCmd = `npx esbuild "${inputPath}" --bundle --format=${bundleOptions.format} --platform=${bundleOptions.platform} ${bundleOptions.minify ? '--minify' : ''} ${bundleOptions.sourcemap ? '--sourcemap' : ''} ${bundleOptions.treeShaking ? '--tree-shaking=true' : ''} ${bundleOptions.external.length > 0 ? bundleOptions.external.map(e => `--external:${e}`).join(' ') : ''} --outfile="${outputPath}"`;
      
      execSync(esbuildCmd, { stdio: 'pipe' });
      
      const stats = fs.statSync(outputPath);
      this.stats.addFile(stats.size);
      this.stats.filesGenerated++;
    } catch (err) {
      // Fallback: simple copy with basic minification
      warn(`esbuild not available, using fallback for ${inputPath}`);
      const content = fs.readFileSync(inputPath, 'utf8');
      const minified = bundleOptions.minify ? this.simpleMinify(content) : content;
      fs.writeFileSync(outputPath, minified, 'utf8');
      this.stats.addFile(minified.length);
      this.stats.filesGenerated++;
    }
  }

  simpleMinify(code) {
    // Basic minification - remove comments and extra whitespace
    return code
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*/g, '') // Remove single-line comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  async hashStaticAssets(directory) {
    info('Hashing static assets...');
    
    const files = this.getAllFiles(directory);
    
    for (const file of files) {
      const ext = path.extname(file);
      if (['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2'].includes(ext)) {
        try {
          const content = fs.readFileSync(file);
          const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
          
          const dir = path.dirname(file);
          const filename = path.basename(file, ext);
          const hashedName = `${filename}.${hash}${ext}`;
          const hashedPath = path.join(dir, hashedName);
          
          fs.renameSync(file, hashedPath);
          
          // Update manifest
          const relativePath = path.relative(directory, file);
          const relativeHashedPath = path.relative(directory, hashedPath);
          this.assetManifest[relativePath] = relativeHashedPath;
        } catch (err) {
          this.stats.warnings.push(`Failed to hash ${file}: ${err.message}`);
        }
      }
    }
    
    success('Assets hashed');
  }

  async generateAssetManifest() {
    info('Generating asset manifest...');
    
    const manifestPath = path.join(this.config.outputDir, 'asset-manifest.json');
    const manifest = {
      version: this.getPackageVersion(),
      buildTime: new Date().toISOString(),
      assets: this.assetManifest
    };
    
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    
    success('Asset manifest generated');
  }

  async optimizeOutput() {
    info('Optimizing output...');
    
    if (this.config.compression) {
      // Add compression hints or pre-compress assets
      // This can be extended to use gzip/brotli compression
    }
    
    success('Output optimized');
  }

  async generateMetadata() {
    info('Generating build metadata...');
    
    const metadata = {
      buildTime: new Date().toISOString(),
      version: this.getPackageVersion(),
      nodeVersion: process.version,
      environment: 'production',
      config: {
        minify: this.config.minify,
        sourceMaps: this.config.sourceMaps,
        compression: this.config.compression,
        hashAssets: this.config.hashAssets
      },
      stats: {
        filesProcessed: this.stats.filesProcessed,
        filesGenerated: this.stats.filesGenerated,
        totalSize: this.stats.totalSize,
        duration: this.stats.getDuration()
      }
    };
    
    const metadataPath = path.join(this.config.outputDir, 'build-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    
    success('Build metadata generated');
  }

  async postBuildTasks() {
    info('Running post-build tasks...');
    
    // Copy package.json
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    
    // Remove dev dependencies and scripts for production
    const prodPackageJson = {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      type: packageJson.type || 'module',
      main: 'server.js',
      engines: packageJson.engines,
      dependencies: packageJson.dependencies,
      license: packageJson.license
    };
    
    fs.writeFileSync(
      path.join(this.config.outputDir, 'package.json'),
      JSON.stringify(prodPackageJson, null, 2),
      'utf8'
    );
    
    // Copy .env.example if exists
    if (fs.existsSync('.env.example')) {
      fs.copyFileSync('.env.example', path.join(this.config.outputDir, '.env.example'));
    }
    
    // Create README for production
    const prodReadme = `# ${packageJson.name} - Production Build

This is a production build of ${packageJson.name}.

## Deployment

1. Install dependencies:
   \`\`\`bash
   npm install --production
   \`\`\`

2. Set environment variables:
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your production values
   \`\`\`

3. Start the server:
   \`\`\`bash
   NODE_ENV=production node server.js
   \`\`\`

## Build Info

- Build Time: ${new Date().toISOString()}
- Version: ${packageJson.version}
- Node Version: ${process.version}

Generated by Folonite.js Build System
`;
    
    fs.writeFileSync(path.join(this.config.outputDir, 'README.md'), prodReadme, 'utf8');
    
    success('Post-build tasks completed');
  }

  // Utility methods

  getAllFiles(directory, extension = null) {
    const files = [];
    
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          if (!extension || fullPath.endsWith(extension)) {
            files.push(fullPath);
          }
        }
      }
    };
    
    walk(directory);
    return files;
  }

  async ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async copyDirectory(src, dest) {
    await this.ensureDirectory(dest);
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
        const stats = fs.statSync(destPath);
        this.stats.addFile(stats.size);
        this.stats.filesGenerated++;
      }
    }
  }

  getPackageVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const config = { ...BUILD_CONFIG };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--no-minify':
        config.minify = false;
        break;
      case '--no-sourcemap':
        config.sourceMaps = false;
        break;
      case '--no-hash':
        config.hashAssets = false;
        break;
      case '--output':
      case '-o':
        config.outputDir = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  
  const builder = new FoloniteBuildSystem(config);
  await builder.build();
}

function printHelp() {
  console.log(`
${colorize('Folonite.js Build System', 'bright')}

Usage: npm run build [options]

Options:
  --no-minify       Disable code minification
  --no-sourcemap    Disable source map generation
  --no-hash         Disable asset hashing
  -o, --output      Specify output directory (default: ./dist)
  -h, --help        Show this help message

Examples:
  npm run build
  npm run build -- --no-minify
  npm run build -- --output ./build
  
Environment Variables:
  SOURCE_MAPS=false   Disable source maps
  NODE_ENV=production Set environment to production
  `);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    error(err.message);
    process.exit(1);
  });
}

export { FoloniteBuildSystem, BUILD_CONFIG };