#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import https from 'https';
import { promisify } from 'util';

const args = process.argv.slice(2);
const marketplaceURL = 'https://raw.githubusercontent.com/FFFSTANZA/Folonite-Lib/main/marketplace.json';

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

class FoloniteMarketplace {
  constructor() {
    this.cache = null;
    this.cacheTime = null;
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  async fetchMarketplace(useCache = true) {
    // Check cache first
    if (useCache && this.cache && this.cacheTime && 
        (Date.now() - this.cacheTime) < this.cacheExpiry) {
      return this.cache;
    }

    return new Promise((resolve, reject) => {
      const request = https.get(marketplaceURL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Folonite-CLI/2.1.0'
        }
      }, (response) => {
        let data = '';
        
        response.on('data', (chunk) => { 
          data += chunk; 
        });
        
        response.on('end', () => {
          try {
            const marketplace = JSON.parse(data);
            
            // Validate marketplace structure
            if (!Array.isArray(marketplace)) {
              reject(new Error('Invalid marketplace format: expected array'));
              return;
            }

            // Cache the result
            this.cache = marketplace;
            this.cacheTime = Date.now();
            
            resolve(marketplace);
          } catch (parseError) {
            reject(new Error(`Invalid marketplace JSON: ${parseError.message}`));
          }
        });
      });

      request.on('error', (err) => {
        reject(new Error(`Network error: ${err.message}`));
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout - check your internet connection'));
      });
    });
  }

  async searchMarketplace(keyword, options = {}) {
    try {
      info(`Searching marketplace for "${keyword}"...`);
      
      const marketplace = await this.fetchMarketplace();
      
      if (!marketplace || marketplace.length === 0) {
        warn("The marketplace is currently empty.");
        log("Visit https://github.com/FFFSTANZA/Folonite-Lib to contribute components!", 'cyan');
        return;
      }

      const searchTerm = keyword.toLowerCase();
      const results = marketplace.filter(item => {
        const nameMatch = item.name.toLowerCase().includes(searchTerm);
        const descMatch = item.description?.toLowerCase().includes(searchTerm);
        const tagMatch = item.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
        const authorMatch = item.author?.toLowerCase().includes(searchTerm);
        
        return nameMatch || descMatch || tagMatch || authorMatch;
      });

      if (results.length === 0) {
        warn(`No results found for "${keyword}"`);
        this.suggestAlternatives(marketplace, keyword);
        return;
      }

      this.displaySearchResults(results, keyword, options);
      
    } catch (err) {
      error(`Search failed: ${err.message}`);
    }
  }

  displaySearchResults(results, keyword, options = {}) {
    const { detailed = false, limit = 10 } = options;
    
    success(`Found ${results.length} result(s) for "${keyword}"`);
    log(''.padEnd(60, '='), 'gray');
    
    const displayResults = results.slice(0, limit);
    
    displayResults.forEach((item, index) => {
      const number = colorize(`${index + 1}.`, 'cyan');
      const name = colorize(item.name, 'bright');
      const version = colorize(`v${item.version}`, 'green');
      const author = colorize(`by ${item.author}`, 'gray');
      const type = this.getTypeIcon(item.type);
      
      log(`${number} ${type} ${name} ${version} ${author}`);
      
      if (item.description) {
        log(`   ${item.description}`, 'gray');
      }
      
      if (item.tags && item.tags.length > 0) {
        const tags = item.tags.map(tag => colorize(`#${tag}`, 'blue')).join(' ');
        log(`   Tags: ${tags}`, 'gray');
      }
      
      if (detailed) {
        log(`   Created: ${item.createdAt || 'Unknown'}`, 'gray');
        log(`   Updated: ${item.updatedAt || 'Unknown'}`, 'gray');
      }
      
      log(''); // Empty line for spacing
    });
    
    if (results.length > limit) {
      log(`... and ${results.length - limit} more results`, 'gray');
      log(`Use --limit=${results.length} to see all results`, 'cyan');
    }
    
    log('Commands:', 'bright');
    log(`  npm run marketplace info <name>     - View detailed information`, 'cyan');
    log(`  npm run marketplace download <name> - Download component`, 'cyan');
  }

  getTypeIcon(type) {
    const icons = {
      'component': '[C]',
      'template': '[T]',
      'plugin': '[P]',
      'theme': '[H]',
      'utility': '[U]'
    };
    return colorize(icons[type] || '[?]', 'yellow');
  }

  suggestAlternatives(marketplace, keyword) {
    const allTags = [...new Set(marketplace.flatMap(item => item.tags || []))];
    const suggestions = allTags.filter(tag => 
      tag.toLowerCase().includes(keyword.toLowerCase()) ||
      this.levenshteinDistance(tag.toLowerCase(), keyword.toLowerCase()) <= 2
    ).slice(0, 5);
    
    if (suggestions.length > 0) {
      log('\nDid you mean:', 'yellow');
      suggestions.forEach(suggestion => {
        log(`  ${suggestion}`, 'cyan');
      });
    }
    
    log('\nPopular categories:', 'yellow');
    const popularTags = this.getPopularTags(marketplace).slice(0, 8);
    popularTags.forEach(tag => {
      log(`  ${tag}`, 'cyan');
    });
  }

  getPopularTags(marketplace) {
    const tagCounts = {};
    marketplace.forEach(item => {
      if (item.tags) {
        item.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });
    
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  async viewInfo(name) {
    try {
      info(`Fetching information for "${name}"...`);
      
      const marketplace = await this.fetchMarketplace();
      
      if (!marketplace || marketplace.length === 0) {
        warn("The marketplace is currently empty.");
        return;
      }

      const item = marketplace.find(i => 
        i.name.toLowerCase() === name.toLowerCase()
      );

      if (!item) {
        error(`Component "${name}" not found.`);
        this.suggestSimilarItems(marketplace, name);
        return;
      }

      this.displayItemDetails(item);
      
    } catch (err) {
      error(`Failed to fetch information: ${err.message}`);
    }
  }

  displayItemDetails(item) {
    log('\n' + '='.repeat(50), 'bright');
    log(`${this.getTypeIcon(item.type)} ${item.name}`, 'bright');
    log('='.repeat(50), 'bright');
    
    const details = [
      ['Version', item.version, 'green'],
      ['Author', item.author, 'cyan'],
      ['Type', item.type, 'yellow'],
      ['Description', item.description, 'white'],
      ['Download URL', item.downloadLink, 'blue'],
      ['Created', item.createdAt || 'Unknown', 'gray'],
      ['Updated', item.updatedAt || 'Unknown', 'gray']
    ];
    
    details.forEach(([label, value, color]) => {
      if (value) {
        log(`${colorize(label + ':', 'bright')} ${colorize(value, color)}`);
      }
    });
    
    if (item.tags && item.tags.length > 0) {
      const tags = item.tags.map(tag => colorize(`#${tag}`, 'blue')).join(' ');
      log(`${colorize('Tags:', 'bright')} ${tags}`);
    }
    
    if (item.dependencies && item.dependencies.length > 0) {
      log(`${colorize('Dependencies:', 'bright')} ${item.dependencies.join(', ')}`, 'gray');
    }
    
    if (item.license) {
      log(`${colorize('License:', 'bright')} ${colorize(item.license, 'green')}`);
    }
    
    log('\n' + '='.repeat(50), 'bright');
    log('Commands:', 'bright');
    log(`  npm run marketplace download ${item.name}`, 'cyan');
    log(`  npm run marketplace search ${item.tags?.[0] || item.type}`, 'cyan');
  }

  suggestSimilarItems(marketplace, name) {
    const similar = marketplace
      .map(item => ({
        item,
        distance: this.levenshteinDistance(item.name.toLowerCase(), name.toLowerCase())
      }))
      .filter(({ distance }) => distance <= 3)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
    
    if (similar.length > 0) {
      log('\nDid you mean:', 'yellow');
      similar.forEach(({ item }) => {
        log(`  ${item.name} - ${item.description || 'No description'}`, 'cyan');
      });
    }
  }

  async downloadItem(name, options = {}) {
    try {
      info(`Searching for "${name}"...`);
      
      const marketplace = await this.fetchMarketplace();
      
      if (!marketplace || marketplace.length === 0) {
        warn("The marketplace is currently empty.");
        return;
      }

      const item = marketplace.find(i => 
        i.name.toLowerCase() === name.toLowerCase()
      );

      if (!item) {
        error(`Component "${name}" not found.`);
        this.suggestSimilarItems(marketplace, name);
        return;
      }

      await this.performDownload(item, options);
      
    } catch (err) {
      error(`Download failed: ${err.message}`);
    }
  }

  async performDownload(item, options = {}) {
    const { 
      outputDir = './downloads',
      install = false,
      integrate = false 
    } = options;

    info(`Downloading ${item.name} v${item.version}...`);
    
    // Ensure output directory exists
    const fullOutputDir = path.resolve(outputDir);
    if (!fs.existsSync(fullOutputDir)) {
      fs.mkdirSync(fullOutputDir, { recursive: true });
    }

    // Determine file extension and path
    const fileExt = this.getFileExtension(item);
    const fileName = `${item.name}${fileExt}`;
    const filePath = path.join(fullOutputDir, fileName);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      
      const request = https.get(item.downloadLink, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Folonite-CLI/2.1.0'
        }
      }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }
        
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        
        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize) {
            const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
            process.stdout.write(`\r  Progress: ${progress}% (${this.formatBytes(downloadedSize)}/${this.formatBytes(totalSize)})`);
          }
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          success(`Downloaded "${item.name}" to ${filePath}`);
          
          this.postDownloadActions(item, filePath, options);
          resolve();
        });
      });

      request.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Clean up on error
        reject(new Error(`Download error: ${err.message}`));
      });

      request.on('timeout', () => {
        request.destroy();
        fs.unlink(filePath, () => {});
        reject(new Error('Download timeout'));
      });
    });
  }

  getFileExtension(item) {
    const urlPath = new URL(item.downloadLink).pathname;
    const ext = path.extname(urlPath);
    
    if (ext) return ext;
    
    // Default extensions based on type
    const defaults = {
      'component': '.js',
      'template': '.fml',
      'plugin': '.js',
      'theme': '.css',
      'utility': '.js'
    };
    
    return defaults[item.type] || '.js';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  postDownloadActions(item, filePath, options) {
    log('\nPost-download actions:', 'bright');
    
    // Show integration suggestions
    if (item.type === 'component') {
      log(`  Move to: src/components/${item.name}.js`, 'cyan');
      log(`  Usage: <Component name="${item.name}" />`, 'cyan');
    } else if (item.type === 'template') {
      log(`  Move to: src/pages/${item.name}.fml`, 'cyan');
      log(`  Access at: /${item.name}`, 'cyan');
    }
    
    // Show documentation if available
    if (item.documentation) {
      log(`  Documentation: ${item.documentation}`, 'blue');
    }
    
    log(`  File size: ${this.formatBytes(fs.statSync(filePath).size)}`, 'gray');
  }

  async listAll(options = {}) {
    try {
      info('Fetching marketplace catalog...');
      
      const marketplace = await this.fetchMarketplace();
      
      if (!marketplace || marketplace.length === 0) {
        warn("The marketplace is currently empty.");
        return;
      }

      const { category, author, sort = 'name' } = options;
      
      let filtered = marketplace;
      
      // Filter by category
      if (category) {
        filtered = filtered.filter(item => 
          item.type === category || 
          (item.tags && item.tags.includes(category))
        );
      }
      
      // Filter by author
      if (author) {
        filtered = filtered.filter(item => 
          item.author.toLowerCase().includes(author.toLowerCase())
        );
      }
      
      // Sort results
      filtered.sort((a, b) => {
        switch (sort) {
          case 'date':
            return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
          case 'author':
            return a.author.localeCompare(b.author);
          default:
            return a.name.localeCompare(b.name);
        }
      });
      
      this.displayCatalog(filtered, options);
      
    } catch (err) {
      error(`Failed to list marketplace: ${err.message}`);
    }
  }

  displayCatalog(items, options) {
    success(`Marketplace Catalog (${items.length} items)`);
    log(''.padEnd(60, '='), 'gray');
    
    // Group by type for better organization
    const grouped = items.reduce((acc, item) => {
      const type = item.type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(item);
      return acc;
    }, {});
    
    Object.entries(grouped).forEach(([type, typeItems]) => {
      log(`\n${colorize(type.toUpperCase(), 'bright')} (${typeItems.length})`);
      log(''.padEnd(30, '-'), 'gray');
      
      typeItems.forEach(item => {
        const name = colorize(item.name, 'cyan');
        const version = colorize(`v${item.version}`, 'green');
        const author = colorize(item.author, 'gray');
        
        log(`  ${name} ${version} by ${author}`);
        if (item.description) {
          log(`    ${item.description}`, 'gray');
        }
      });
    });
    
    log('\nStatistics:', 'bright');
    log(`  Total items: ${items.length}`, 'cyan');
    log(`  Categories: ${Object.keys(grouped).length}`, 'cyan');
    log(`  Authors: ${[...new Set(items.map(i => i.author))].length}`, 'cyan');
  }

  showHelp() {
    log('\nFolonite.js Marketplace CLI', 'bright');
    log('===========================', 'bright');
    
    const commands = [
      ['search <keyword>', 'Search for components by keyword, tag, or author'],
      ['info <name>', 'View detailed information about a component'],
      ['download <name>', 'Download a component to ./downloads/'],
      ['list', 'Show all available components'],
      ['help', 'Show this help message']
    ];
    
    log('\nCommands:', 'bright');
    commands.forEach(([cmd, desc]) => {
      log(`  ${colorize(cmd.padEnd(20), 'cyan')} ${desc}`, 'white');
    });
    
    log('\nOptions:', 'bright');
    log(`  --detailed              Show detailed search results`, 'cyan');
    log(`  --limit=<number>        Limit search results (default: 10)`, 'cyan');
    log(`  --output=<dir>          Download directory (default: ./downloads)`, 'cyan');
    log(`  --category=<type>       Filter by category (component, template, etc.)`, 'cyan');
    log(`  --author=<name>         Filter by author`, 'cyan');
    log(`  --sort=<field>          Sort by: name, date, author (default: name)`, 'cyan');
    
    log('\nExamples:', 'bright');
    log(`  npm run marketplace search navbar`, 'yellow');
    log(`  npm run marketplace info "UserCard"`, 'yellow');
    log(`  npm run marketplace download navbar --output=src/components`, 'yellow');
    log(`  npm run marketplace list --category=component --sort=date`, 'yellow');
  }
}

// Parse command line arguments
function parseArgs(args) {
  const parsed = { command: args[0], params: [], options: {} };
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      parsed.options[key] = value || true;
    } else {
      parsed.params.push(arg);
    }
  }
  
  return parsed;
}

// Main execution
async function main() {
  const marketplace = new FoloniteMarketplace();
  const { command, params, options } = parseArgs(args);
  
  try {
    switch (command) {
      case 'search':
        if (!params[0]) {
          error('Usage: search <keyword>');
          return;
        }
        await marketplace.searchMarketplace(params[0], options);
        break;

      case 'info':
        if (!params[0]) {
          error('Usage: info <name>');
          return;
        }
        await marketplace.viewInfo(params[0]);
        break;

      case 'download':
        if (!params[0]) {
          error('Usage: download <name>');
          return;
        }
        await marketplace.downloadItem(params[0], options);
        break;

      case 'list':
        await marketplace.listAll(options);
        break;

      case 'help':
      case undefined:
        marketplace.showHelp();
        break;

      default:
        error(`Unknown command: ${command}`);
        marketplace.showHelp();
    }
  } catch (err) {
    error(`Command failed: ${err.message}`);
    process.exit(1);
  }
}

// Run the CLI
main();