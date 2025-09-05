// src/views/registerComponents.js
// Enhanced Component Registration System with FML Support
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

export const components = {};

// FML Integration - Lazy load FML modules to avoid circular dependencies
let processFML, validateFML, FMLParser, fmlStats;

async function loadFMLModules() {
  if (!processFML) {
    try {
      const fmlIndex = await import('../fml/index.js');
      const fmlValidator = await import('../fml/parser/validator.js');
      const fmlHelpers = await import('../fml/utils/helpers.js');
      
      processFML = fmlIndex.processFML;
      validateFML = fmlValidator.validateFML;
      FMLParser = fmlIndex.FMLParser;
      fmlStats = fmlHelpers.fmlStats;
      
      console.log('✅ FML modules loaded for component registration');
    } catch (error) {
      console.warn('⚠️ FML modules not available:', error.message);
      return false;
    }
  }
  return true;
}

/**
 * Enhanced component registration with FML support
 * @param {boolean} debug - Enable debug logging
 * @param {Object} options - Registration options
 */
export async function registerComponents(debug = false, options = {}) {
  const {
    watchMode = false,
    validateComponents = process.env.NODE_ENV === 'development',
    allowFML = true,
    componentDirs = ['./src/components'],
    exclude = []
  } = options;

  const componentsDir = path.resolve(componentDirs[0]); // Primary directory
  
  if (!fs.existsSync(componentsDir)) {
    throw new Error(`Components directory not found: ${componentsDir}`);
  }

  // Load FML support if enabled
  let fmlSupported = false;
  if (allowFML) {
    fmlSupported = await loadFMLModules();
  }

  const logDebug = (message, type = 'info') => {
    if (debug) {
      const prefix = {
        info: '📝',
        success: '✅',
        warn: '⚠️',
        error: '❌'
      };
      console.debug(`${prefix[type]} [Components] ${message}`);
    }
  };

  const stats = {
    total: 0,
    js: 0,
    fml: 0,
    errors: 0,
    skipped: 0,
    startTime: Date.now()
  };

  /**
   * Load components from directory recursively
   */
  const loadComponentsFromDir = async (dir, relativePath = '') => {
    logDebug(`Scanning directory: ${dir}`);
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const relativeEntryPath = path.join(relativePath, entry.name);
        
        // Skip excluded paths
        if (exclude.some(pattern => relativeEntryPath.includes(pattern))) {
          logDebug(`Skipped (excluded): ${relativeEntryPath}`, 'warn');
          stats.skipped++;
          continue;
        }

        if (entry.isDirectory()) {
          logDebug(`Entering subdirectory: ${entryPath}`);
          await loadComponentsFromDir(entryPath, relativeEntryPath);
        } else if (entry.isFile()) {
          await processComponentFile(entryPath, relativeEntryPath);
        }
      }
    } catch (error) {
      logDebug(`Error reading directory ${dir}: ${error.message}`, 'error');
      stats.errors++;
    }
  };

  /**
   * Process individual component file
   */
  const processComponentFile = async (filePath, relativePath) => {
    const ext = path.extname(filePath);
    const componentName = getComponentName(relativePath);
    
    try {
      if (ext === '.js') {
        await registerJSComponent(filePath, componentName);
        stats.js++;
      } else if (ext === '.fml' && fmlSupported) {
        await registerFMLComponent(filePath, componentName);
        stats.fml++;
      } else if (ext === '.fml' && !fmlSupported) {
        logDebug(`Skipped FML component (FML not available): ${componentName}`, 'warn');
        stats.skipped++;
        return;
      } else {
        logDebug(`Skipped non-component file: ${relativePath}`, 'warn');
        stats.skipped++;
        return;
      }
      
      stats.total++;
      logDebug(`Component registered: ${componentName} (${ext})`, 'success');
      
    } catch (error) {
      logDebug(`Failed to register component "${componentName}": ${error.message}`, 'error');
      stats.errors++;
      
      if (debug) {
        console.error(`Component registration error details:`, {
          file: filePath,
          component: componentName,
          error: error.stack
        });
      }
    }
  };

  /**
   * Register JavaScript component
   */
  const registerJSComponent = async (filePath, componentName) => {
    logDebug(`Importing JS component: ${filePath}`);
    
    const componentModule = await import(pathToFileURL(filePath).href + `?t=${Date.now()}`);
    
    if (componentModule.default) {
      if (typeof componentModule.default !== 'function') {
        throw new Error('JS component must export a function as default');
      }
      
      components[componentName] = componentModule.default;
      
      // Validate component in development
      if (validateComponents) {
        await validateJSComponent(componentName, componentModule.default);
      }
    } else {
      throw new Error('No default export found');
    }
  };

  /**
   * Register FML component
   */
  const registerFMLComponent = async (filePath, componentName) => {
    logDebug(`Processing FML component: ${filePath}`);
    
    const fmlContent = fs.readFileSync(filePath, 'utf-8');
    
    // Validate FML in development
    if (validateComponents) {
      await validateFMLComponent(componentName, fmlContent);
    }
    
    // Create a wrapper function that renders the FML
    const fmlComponent = async (props = {}) => {
      try {
        return await processFML(fmlContent, {
          mode: 'server',
          props,
          components: components, // Allow FML components to use other components
          debug: debug && process.env.NODE_ENV === 'development'
        });
      } catch (error) {
        console.error(`Error rendering FML component "${componentName}":`, error);
        return `<div class="component-error">❌ Error rendering ${componentName}</div>`;
      }
    };
    
    // Add metadata for debugging
    fmlComponent._isFMLComponent = true;
    fmlComponent._filePath = filePath;
    fmlComponent._componentName = componentName;
    
    components[componentName] = fmlComponent;
  };

  /**
   * Validate JavaScript component
   */
  const validateJSComponent = async (name, component) => {
    if (typeof component !== 'function') {
      throw new Error(`Component "${name}" must be a function`);
    }
    
    // Check function signature
    if (component.length > 1) {
      logDebug(`Component "${name}" accepts ${component.length} parameters. Consider using a single props object.`, 'warn');
    }
    
    // Test render with empty props
    try {
      const result = component({});
      if (typeof result !== 'string') {
        logDebug(`Component "${name}" should return a string (HTML)`, 'warn');
      }
    } catch (error) {
      logDebug(`Component "${name}" failed test render: ${error.message}`, 'warn');
    }
  };

  /**
   * Validate FML component
   */
  const validateFMLComponent = async (name, fmlContent) => {
    try {
      const parser = new FMLParser({ debug: false });
      const ast = parser.parse(fmlContent);
      const validation = validateFML(ast, components);
      
      if (validation.errors.length > 0) {
        logDebug(`FML component "${name}" has validation errors:`, 'warn');
        validation.errors.forEach(error => {
          logDebug(`  • ${error.message}`, 'warn');
        });
      }
      
      if (validation.warnings.length > 0 && debug) {
        logDebug(`FML component "${name}" has warnings:`, 'warn');
        validation.warnings.forEach(warning => {
          logDebug(`  • ${warning.message}`, 'warn');
        });
      }
      
    } catch (error) {
      logDebug(`FML validation failed for "${name}": ${error.message}`, 'error');
    }
  };

  /**
   * Generate component name from file path
   */
  const getComponentName = (relativePath) => {
    return relativePath
      .replace(/\.(js|fml)$/, '') // Remove extension
      .replace(/\\/g, '/') // Normalize path separators
      .split('/')
      .map(part => {
        // Convert kebab-case or snake_case to PascalCase
        return part.split(/[-_]/).map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join('');
      })
      .join('/'); // Keep directory structure with /
  };

  /**
   * Set up file watching for hot reload
   */
  const setupWatcher = () => {
    if (!watchMode) return;
    
    try {
      const chokidar = require('chokidar');
      const watcher = chokidar.watch(componentsDir, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true
      });

      watcher.on('change', async (filePath) => {
        const relativePath = path.relative(componentsDir, filePath);
        const componentName = getComponentName(relativePath);
        
        logDebug(`File changed: ${relativePath}, reloading component: ${componentName}`, 'info');
        
        // Remove from require cache if it's a JS file
        if (filePath.endsWith('.js')) {
          delete require.cache[require.resolve(filePath)];
        }
        
        // Re-register the component
        await processComponentFile(filePath, relativePath);
        logDebug(`Component reloaded: ${componentName}`, 'success');
      });

      logDebug('File watcher enabled for hot component reloading', 'success');
    } catch (error) {
      logDebug(`Could not enable file watching: ${error.message}`, 'warn');
    }
  };

  // Main registration process
  try {
    console.log(`🚀 Starting component registration from: ${componentsDir}`);
    
    // Load from all configured directories
    for (const dir of componentDirs) {
      const resolvedDir = path.resolve(dir);
      if (fs.existsSync(resolvedDir)) {
        await loadComponentsFromDir(resolvedDir);
      } else {
        logDebug(`Component directory not found: ${resolvedDir}`, 'warn');
      }
    }
    
    // Setup file watching if enabled
    setupWatcher();
    
    // Generate registration report
    const duration = Date.now() - stats.startTime;
    const report = generateRegistrationReport(stats, duration, fmlSupported);
    
    console.log('✅ Component registration complete');
    console.log(report);
    
    if (debug) {
      console.log('📋 Registered components:', Object.keys(components));
      console.log('🔧 Component details:', getComponentDetails());
    }
    
  } catch (error) {
    console.error('❌ Error during component registration:', error);
    logDebug(`Registration error details: ${error.stack}`, 'error');
    throw error;
  }
}

/**
 * Generate registration report
 */
function generateRegistrationReport(stats, duration, fmlSupported) {
  const lines = [
    `📊 Registration Summary (${duration}ms):`,
    `   Total Components: ${stats.total}`,
    `   JavaScript (.js): ${stats.js}`,
  ];
  
  if (fmlSupported) {
    lines.push(`   FML (.fml): ${stats.fml}`);
  } else {
    lines.push(`   FML Support: Disabled`);
  }
  
  lines.push(
    `   Errors: ${stats.errors}`,
    `   Skipped: ${stats.skipped}`
  );
  
  if (stats.errors > 0) {
    lines.push(`⚠️  Some components failed to register. Check logs above.`);
  }
  
  return lines.join('\n');
}

/**
 * Get detailed component information
 */
function getComponentDetails() {
  const details = {};
  
  for (const [name, component] of Object.entries(components)) {
    details[name] = {
      type: component._isFMLComponent ? 'FML' : 'JavaScript',
      filePath: component._filePath || 'unknown',
      paramCount: component.length || 0
    };
  }
  
  return details;
}

/**
 * Utility functions for external use
 */

/**
 * Get component by name with error handling
 */
export function getComponent(name) {
  if (!components[name]) {
    throw new Error(`Component "${name}" not found. Available: ${Object.keys(components).join(', ')}`);
  }
  return components[name];
}

/**
 * Check if component exists
 */
export function hasComponent(name) {
  return name in components;
}

/**
 * Get all component names
 */
export function getComponentNames() {
  return Object.keys(components);
}

/**
 * Get components by type
 */
export function getComponentsByType(type) {
  const filtered = {};
  for (const [name, component] of Object.entries(components)) {
    const isMatch = type === 'fml' ? component._isFMLComponent : !component._isFMLComponent;
    if (isMatch) {
      filtered[name] = component;
    }
  }
  return filtered;
}

/**
 * Clear all registered components
 */
export function clearComponents() {
  for (const key in components) {
    delete components[key];
  }
  console.log('🧹 All components cleared');
}

/**
 * Hot reload specific component
 */
export async function reloadComponent(componentName) {
  if (!components[componentName]) {
    throw new Error(`Component "${componentName}" not found for reload`);
  }
  
  const component = components[componentName];
  if (component._filePath) {
    // Clear from cache and re-register
    if (component._filePath.endsWith('.js')) {
      delete require.cache[require.resolve(component._filePath)];
    }
    
    const relativePath = path.relative('./src/components', component._filePath);
    await processComponentFile(component._filePath, relativePath);
    console.log(`🔄 Component reloaded: ${componentName}`);
  } else {
    throw new Error(`Cannot reload component "${componentName}": file path unknown`);
  }
}