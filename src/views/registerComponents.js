// src/views/registerComponents.js
// Enhanced Component Registration System — Optimized for Performance, Reliability & Scalability

import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import crypto from 'crypto';

// Direct FML imports (no lazy loading)
import { processFML, validateFML, FMLParser } from '../fml/index.js';
import { fmlStats, createTimer, debounce } from '../fml/utils/helpers.js';

// === CORE REGISTRY ===
export const components = {};
const componentMetadata = new Map(); // name → { type, filePath, version, registrationTime }
const dependencyGraph = new Map();   // name → Set<depName>
const performanceMetrics = new Map(); // componentName → Map<operation, Metric>

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development';
const enableHotReload = isDevelopment;

// === COMPONENT VALIDATOR — Zero-overhead, Precomputed Patterns ===

class ComponentValidator {
  constructor(options = {}) {
    this.strict = options.strict || false;
    this.warnOnBadPatterns = options.warnOnBadPatterns !== false;
    this.validatePerformance = options.validatePerformance !== false;

    // Precompile regex patterns for speed
    this.dangerousHtmlPatterns = [
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /style\s*=\s*["'][^"']*expression\(/gi
    ];

    this.accessibilityPatterns = [
      /<img\b(?![^>]*alt=)/gi,
      /<input\b(?![^>]*aria-label|[^>]*id=)/gi,
      /<button\b[^>]*>\s*<\/button>/gi
    ];

    this.antiPatterns = [
      { pattern: /console\.log/g, message: 'Contains console.log statements' },
      { pattern: /eval\(/g, message: 'Uses eval() - security risk' },
      { pattern: /innerHTML\s*=/g, message: 'Uses innerHTML - potential XSS risk' },
      { pattern: /document\.(getElementById|querySelector)/g, message: 'Direct DOM manipulation - not SSR friendly' },
      { pattern: /Math\.random\(\)/g, message: 'Uses Math.random() - may cause hydration mismatches' }
    ];

    this.performancePatterns = [
      { pattern: /for\s*\(\s*[^;]+;\s*[^;]+\.length\s*;\s*[^)]+\)/g, message: 'Inefficient loop pattern detected' },
      { pattern: /JSON\.(parse|stringify)\(/g, message: 'JSON operations in render - consider caching' }
    ];
  }

  validateJSComponent(name, component, filePath) {
    const issues = { errors: [], warnings: [], performance: [] };

    if (typeof component !== 'function') {
      issues.errors.push(`Component "${name}" must be a function, got ${typeof component}`);
      return issues;
    }

    if (component.length > 1) {
      issues.warnings.push(
        `Component "${name}" accepts ${component.length} parameters. Use single props object for flexibility.`
      );
    }

    try {
      const start = performance.now();
      const result = component({});
      const duration = performance.now() - start;

      if (this.validatePerformance && duration > 50) {
        issues.performance.push(
          `Component "${name}" took ${duration.toFixed(2)}ms for empty render. Optimize for performance.`
        );
      }

      if (typeof result !== 'string') {
        if (this.strict) {
          issues.errors.push(`Component "${name}" must return a string, got ${typeof result}`);
        } else {
          issues.warnings.push(`Component "${name}" should return HTML string for SSR compatibility`);
        }
      }

      if (typeof result === 'string') {
        this.validateHtmlOutput(result, issues);
      }

    } catch (error) {
      if (this.strict) {
        issues.errors.push(`Component "${name}" failed test render: ${error.message}`);
      } else {
        issues.warnings.push(`Component "${name}" may have runtime issues: ${error.message}`);
      }
    }

    if (this.warnOnBadPatterns) {
      this.analyzeSourceCode(component.toString(), name, issues);
    }

    return issues;
  }

  validateFMLComponent(name, fmlContent, filePath) {
    const issues = { errors: [], warnings: [], performance: [] };

    try {
      const parseStart = performance.now();
      const parser = new FMLParser({ debug: false, phase2: true });
      const ast = parser.parse(fmlContent);
      const parseTime = performance.now() - parseStart;

      if (parseTime > 100) {
        issues.performance.push(
          `FML component "${name}" parsing took ${parseTime.toFixed(2)}ms. Simplify template.`
        );
      }

      const validation = validateFML(ast, components, { strict: this.strict });
      issues.errors.push(...validation.errors.map(e => e.message));
      issues.warnings.push(...validation.warnings.map(w => w.message));

      this.analyzeFMLComplexity(ast, name, issues);
      this.extractFMLDependencies(name, ast);

    } catch (error) {
      issues.errors.push(`FML parsing failed for "${name}": ${error.message}`);
    }

    return issues;
  }

  validateHtmlOutput(html, issues) {
    this.dangerousHtmlPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(html)) issues.warnings.push(`Component contains ${message.toLowerCase()}`);
    });

    this.accessibilityPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(html)) issues.warnings.push(`Component accessibility: ${message.toLowerCase()}`);
    });
  }

  analyzeSourceCode(source, name, issues) {
    this.antiPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(source)) issues.warnings.push(`Component "${name}" ${message.toLowerCase()}`);
    });

    this.performancePatterns.forEach(({ pattern, message }) => {
      if (pattern.test(source)) issues.performance.push(`Component "${name}" ${message.toLowerCase()}`);
    });
  }

  analyzeFMLComplexity(ast, name, issues) {
    const complexity = this.calculateASTComplexity(ast);
    if (complexity.depth > 10) {
      issues.warnings.push(`FML component "${name}" has deep nesting (${complexity.depth} levels). Break into smaller components.`);
    }
    if (complexity.nodeCount > 100) {
      issues.performance.push(`FML component "${name}" has ${complexity.nodeCount} nodes. Large templates impact performance.`);
    }
    if (complexity.dynamicExpressions > 20) {
      issues.performance.push(`FML component "${name}" has ${complexity.dynamicExpressions} dynamic expressions. Cache computed values.`);
    }
  }

  calculateASTComplexity(node, depth = 0) {
    if (!node) return { depth: 0, nodeCount: 0, dynamicExpressions: 0 };

    let result = {
      depth,
      nodeCount: 1,
      dynamicExpressions: node.type === 'interpolation' ? 1 : 0
    };

    if (node.children) {
      for (const child of node.children) {
        const childResult = this.calculateASTComplexity(child, depth + 1);
        result.depth = Math.max(result.depth, childResult.depth);
        result.nodeCount += childResult.nodeCount;
        result.dynamicExpressions += childResult.dynamicExpressions;
      }
    }

    return result;
  }

  extractFMLDependencies(componentName, ast) {
    const deps = new Set();
    const traverse = (node) => {
      if (node.type === 'component') deps.add(node.name);
      if (node.children) node.children.forEach(traverse);
    };
    traverse(ast);
    dependencyGraph.set(componentName, Array.from(deps));
  }
}

const validator = new ComponentValidator({
  strict: isDevelopment,
  warnOnBadPatterns: isDevelopment,
  validatePerformance: isDevelopment
});

// === VERSION MANAGER — Immutable, Fast Hashing ===

class ComponentVersionManager {
  constructor() {
    this.versions = new Map(); // name → { version, timestamp }
  }

  generateVersion(content, filePath) {
    const stats = fs.statSync(filePath);
    const contentHash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    return `${contentHash}-${stats.mtime.getTime()}`;
  }

  setVersion(name, version) {
    this.versions.set(name, { version, timestamp: Date.now() });
  }

  hasChanged(name, newVersion) {
    const current = this.versions.get(name);
    return !current || current.version !== newVersion;
  }

  getVersion(name) {
    return this.versions.get(name)?.version || null;
  }

  getAllVersions() {
    const obj = {};
    for (const [name, { version }] of this.versions.entries()) {
      obj[name] = version;
    }
    return obj;
  }
}

const versionManager = new ComponentVersionManager();

// === HOT RELOAD MANAGER — Thread-Safe, Batched, Non-Blocking ===

class HotReloadManager {
  constructor() {
    this.watchers = new Map(); // filePath → debouncedCallback
    this.reloadQueue = new Set(); // Set<{filePath, callback}>
    this.isProcessing = false;
    this.debounceTime = 200;
  }

  watch(filePath, callback) {
    if (this.watchers.has(filePath)) return;

    const debounced = debounce(async () => {
      await this.queueReload(filePath, callback);
    }, this.debounceTime);

    try {
      fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) debounced();
      });
      this.watchers.set(filePath, debounced);
    } catch (err) {
      console.warn(`Failed to watch ${filePath}:`, err.message);
    }
  }

  async queueReload(filePath, callback) {
    this.reloadQueue.add({ filePath, callback });
    if (!this.isProcessing) {
      this.isProcessing = true;
      await this.processReloadQueue();
      this.isProcessing = false;
    }
  }

  async processReloadQueue() {
    const batch = Array.from(this.reloadQueue);
    this.reloadQueue.clear();

    for (const { filePath, callback } of batch) {
      try {
        await callback(filePath);
      } catch (err) {
        console.error(`Hot reload failed for ${filePath}:`, err.message);
      }
    }
  }

  unwatch(filePath) {
    if (this.watchers.has(filePath)) {
      fs.unwatchFile(filePath);
      this.watchers.delete(filePath);
    }
  }

  unwatchAll() {
    for (const filePath of this.watchers.keys()) {
      this.unwatch(filePath);
    }
  }
}

const hotReloadManager = new HotReloadManager();

// === PERFORMANCE MONITOR — Minimal Overhead, Real-Time Metrics ===

class ComponentPerformanceMonitor {
  constructor() {
    this.metrics = new Map(); // componentName → Map<operation, Metric>
  }

  startTiming(componentName, operation) {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.recordMetric(componentName, operation, duration);
      return duration;
    };
  }

  recordMetric(componentName, operation, duration) {
    if (!this.metrics.has(componentName)) {
      this.metrics.set(componentName, new Map());
    }
    const opMap = this.metrics.get(componentName);
    if (!opMap.has(operation)) {
      opMap.set(operation, {
        count: 0,
        totalTime: 0,
        maxTime: 0,
        minTime: Infinity
      });
    }
    const metric = opMap.get(operation);
    metric.count++;
    metric.totalTime += duration;
    metric.maxTime = Math.max(metric.maxTime, duration);
    metric.minTime = Math.min(metric.minTime, duration);
  }

  getMetrics(componentName) {
    const map = this.metrics.get(componentName);
    if (!map) return null;
    const result = {};
    for (const [op, m] of map.entries()) {
      result[op] = {
        ...m,
        averageTime: m.totalTime / m.count
      };
    }
    return result;
  }

  getSlowComponents(threshold = 10) {
    const slow = [];
    for (const [comp, ops] of this.metrics.entries()) {
      for (const [op, m] of ops.entries()) {
        if (m.averageTime > threshold) {
          slow.push({ component: comp, operation: op, averageTime: m.averageTime, count: m.count });
        }
      }
    }
    return slow.sort((a, b) => b.averageTime - a.averageTime);
  }

  getAllMetrics() {
    const result = {};
    for (const [comp, ops] of this.metrics.entries()) {
      result[comp] = this.getMetrics(comp);
    }
    return result;
  }
}

const performanceMonitor = new ComponentPerformanceMonitor();

// === MAIN REGISTRATION SYSTEM — Optimized for Speed and Memory ===

/**
 * Register components from directories with enhanced validation and hot reload
 */
export async function registerComponents(debug = false, options = {}) {
  const timer = createTimer('ComponentRegistration');
  const {
    watchMode = isDevelopment,
    validateComponents = isDevelopment,
    allowFML = true,
    componentDirs = ['./src/components'],
    exclude = [],
    strict = false,
    maxConcurrency = 10
  } = options;

  const stats = {
    total: 0,
    js: 0,
    fml: 0,
    errors: 0,
    warnings: 0,
    skipped: 0,
    reloaded: 0,
    startTime: Date.now()
  };

  const logDebug = (msg, type = 'info') => {
    if (debug) {
      const prefix = { info: '📝', success: '✅', warn: '⚠️', error: '❌' };
      console.debug(`${prefix[type]} [Components] ${msg}`);
    }
  };

  // === Process a single component file ===
  const processComponentFile = async (filePath, relativePath) => {
    const endTiming = performanceMonitor.startTiming('registration', 'processFile');

    try {
      const ext = path.extname(filePath);
      const componentName = getComponentName(relativePath);

      const content = fs.readFileSync(filePath, 'utf-8');
      const version = versionManager.generateVersion(content, filePath);

      if (!versionManager.hasChanged(componentName, version)) {
        stats.skipped++;
        return;
      }

      if (ext === '.js') {
        await registerJSComponent(filePath, componentName, content, version);
        stats.js++;
      } else if (ext === '.fml' && allowFML) {
        await registerFMLComponent(filePath, componentName, content, version);
        stats.fml++;
      } else if (ext === '.fml') {
        stats.skipped++;
        return;
      } else {
        stats.skipped++;
        return;
      }

      if (watchMode) {
        hotReloadManager.watch(filePath, async () => {
          logDebug(`Hot reloading: ${componentName}`, 'info');
          await processComponentFile(filePath, relativePath);
          stats.reloaded++;
        });
      }

      stats.total++;
      versionManager.setVersion(componentName, version);
      logDebug(`Registered: ${componentName} (${ext}) v${version.slice(0, 8)}`, 'success');

    } catch (error) {
      logDebug(`Failed to register: ${error.message}`, 'error');
      stats.errors++;
      if (debug) console.error('Registration error:', { file: filePath, error: error.stack });
    } finally {
      endTiming();
    }
  };

  // === Register JS Component ===
  const registerJSComponent = async (filePath, componentName, content, version) => {
    const endTiming = performanceMonitor.startTiming(componentName, 'jsRegistration');

    try {
      const moduleUrl = pathToFileURL(filePath).href + `?v=${version}`;
      const mod = await import(moduleUrl);
      if (!mod.default) throw new Error('No default export found');

      const component = mod.default;

      if (validateComponents) {
        const issues = validator.validateJSComponent(componentName, component, filePath);
        stats.warnings += issues.warnings.length + issues.performance.length;

        if (issues.errors.length > 0 && strict) {
          throw new Error(`Validation failed: ${issues.errors.join(', ')}`);
        }

        if (issues.warnings.length > 0 && debug) {
          issues.warnings.forEach(w => console.warn(`  • ${w}`));
        }
        if (issues.performance.length > 0 && debug) {
          issues.performance.forEach(p => console.warn(`  • ${p}`));
        }
      }

      components[componentName] = component;
      componentMetadata.set(componentName, {
        type: 'js',
        filePath,
        version,
        registrationTime: Date.now()
      });

    } finally {
      endTiming();
    }
  };

  // === Register FML Component ===
  const registerFMLComponent = async (filePath, componentName, content, version) => {
    const endTiming = performanceMonitor.startTiming(componentName, 'fmlRegistration');

    try {
      if (validateComponents) {
        const issues = validator.validateFMLComponent(componentName, content, filePath);
        stats.warnings += issues.warnings.length + issues.performance.length;

        if (issues.errors.length > 0 && strict) {
          throw new Error(`FML validation failed: ${issues.errors.join(', ')}`);
        }

        if (issues.warnings.length > 0 && debug) {
          issues.warnings.forEach(w => console.warn(`  • ${w}`));
        }
      }

      const fmlComponent = async (props = {}) => {
        const renderTiming = performanceMonitor.startTiming(componentName, 'render');
        try {
          return await processFML(content, {
            mode: 'server',
            props,
            components,
            debug: debug && isDevelopment,
            phase2: true
          });
        } catch (error) {
          console.error(`Error rendering FML component "${componentName}":`, error);
          return isDevelopment
            ? `<div class="component-error" data-component="${componentName}">
                 ❌ Error rendering ${componentName}: ${error.message}
               </div>`
            : `<!-- Error in ${componentName} -->`;
        } finally {
          renderTiming();
        }
      };

      fmlComponent._isFMLComponent = true;
      fmlComponent._filePath = filePath;
      fmlComponent._componentName = componentName;
      fmlComponent._version = version;

      components[componentName] = fmlComponent;
      componentMetadata.set(componentName, {
        type: 'fml',
        filePath,
        version,
        registrationTime: Date.now()
      });

    } finally {
      endTiming();
    }
  };

  // === Load components recursively from directories ===
  const loadFromDir = async (dirPath, relativeBase = '') => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const tasks = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.join(relativeBase, entry.name);

        if (exclude.some(pattern => relativePath.includes(pattern))) {
          stats.skipped++;
          continue;
        }

        if (entry.isDirectory()) {
          tasks.push(loadFromDir(fullPath, relativePath));
        } else if (entry.isFile() && /\.(js|fml)$/.test(entry.name)) {
          tasks.push(processComponentFile(fullPath, relativePath));
        }
      }

      // Process in batches to avoid overwhelming system
      for (let i = 0; i < tasks.length; i += maxConcurrency) {
        await Promise.all(tasks.slice(i, i + maxConcurrency));
      }

    } catch (error) {
      stats.errors++;
      logDebug(`Error reading directory ${dirPath}: ${error.message}`, 'error');
    }
  };

  // === MAIN EXECUTION ===
  try {
    console.log(' Starting enhanced component registration...');
    timer.mark('Setup Complete');

    // Load from all configured directories
    for (const dir of componentDirs) {
      const resolved = path.resolve(dir);
      if (fs.existsSync(resolved)) {
        logDebug(`Loading from: ${resolved}`);
        await loadFromDir(resolved);
      } else {
        logDebug(`Directory not found: ${resolved}`, 'warn');
      }
    }

    timer.mark('Components Loaded');

    // Validate dependencies (only in dev)
    if (isDevelopment) validateComponentDependencies();

    const duration = timer.end();
    const report = generateEnhancedReport(stats, duration);

    console.log(' Enhanced component registration complete');
    console.log(report);

    if (debug) {
      console.log(' Registered components:', Object.keys(components));
      console.log(' Performance metrics:', performanceMonitor.getAllMetrics());
      const slow = performanceMonitor.getSlowComponents(5);
      if (slow.length > 0) console.warn(' Slow components:', slow);
    }

  } catch (error) {
    console.error(' Component registration failed:', error.message);
    stats.errors++;
    throw error;
  }
}

// === DEPENDENCY VALIDATION — Cycle Detection ===
function validateComponentDependencies() {
  const visited = new Set();
  const visiting = new Set();
  const issues = [];

  const detectCycle = (name, path = []) => {
    if (visiting.has(name)) {
      const cycle = path.slice(path.indexOf(name)).concat(name);
      issues.push(`Circular dependency: ${cycle.join(' → ')}`);
      return;
    }
    if (visited.has(name)) return;

    visiting.add(name);
    const deps = dependencyGraph.get(name) || [];

    for (const dep of deps) {
      if (!components[dep]) {
        issues.push(`Missing dependency: "${name}" depends on "${dep}"`);
      } else {
        detectCycle(dep, [...path, name]);
      }
    }

    visiting.delete(name);
    visited.add(name);
  };

  for (const name of Object.keys(components)) {
    detectCycle(name);
  }

  if (issues.length > 0) {
    console.warn('⚠️ Dependency issues:');
    issues.forEach(issue => console.warn(`  • ${issue}`));
  }
}

// === UTILITY FUNCTIONS ===

function getComponentName(relativePath) {
  return relativePath
    .replace(/\.(js|fml)$/, '')
    .split(/[\\/]/)
    .map(part => part.split(/[-_]/).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(''))
    .join('/');
}

function generateEnhancedReport(stats, duration) {
  const lines = [
    ` Enhanced Registration Summary (${typeof duration === 'number' ? duration.toFixed(2) : duration}ms):`,
    `   Total Components: ${stats.total}`,
    `   JavaScript (.js): ${stats.js}`,
    `   FML Components: ${stats.fml}`,
    `   Errors: ${stats.errors}`,
    `   Warnings: ${stats.warnings}`,
    `   Skipped: ${stats.skipped}`,
    `   Hot Reloaded: ${stats.reloaded}`
  ];
  if (stats.errors > 0) lines.push(`  Registration completed with ${stats.errors} errors`);
  if (stats.warnings > 0) lines.push(`ℹ️  ${stats.warnings} validation warnings`);
  return lines.join('\n');
}

// === PUBLIC API ===

export function getComponentDetails() {
  const details = {};
  for (const [name, component] of Object.entries(components)) {
    const meta = componentMetadata.get(name);
    const deps = dependencyGraph.get(name) || [];
    const version = versionManager.getVersion(name);
    details[name] = {
      type: meta?.type || (component._isFMLComponent ? 'fml' : 'js'),
      filePath: meta?.filePath || component._filePath || 'unknown',
      version: version || 'unknown',
      registrationTime: meta?.registrationTime,
      dependencies: deps,
      paramCount: typeof component === 'function' ? component.length : 0
    };
  }
  return details;
}

export function getComponent(name) {
  if (!(name in components)) {
    const available = Object.keys(components).slice(0, 5);
    const suggestion = available.length > 0
      ? ` Available: ${available.join(', ')}${available.length < Object.keys(components).length ? '...' : ''}`
      : '';
    throw new Error(`Component "${name}" not found.${suggestion}`);
  }
  return components[name];
}

export function hasComponent(name) {
  return name in components;
}

export function getComponentNames() {
  return Object.keys(components);
}

export function getComponentsByType(type) {
  const filtered = {};
  for (const [name, component] of Object.entries(components)) {
    const compType = component._isFMLComponent ? 'fml' : 'js';
    if (compType === type) filtered[name] = component;
  }
  return filtered;
}

export function clearComponents() {
  const count = Object.keys(components).length;
  for (const key in components) delete components[key];
  componentMetadata.clear();
  dependencyGraph.clear();
  performanceMetrics.clear();
  hotReloadManager.unwatchAll();
  versionManager.versions.clear();
  console.log(` Cleared ${count} components and metadata`);
  return count;
}

export async function reloadComponent(componentName) {
  const meta = componentMetadata.get(componentName);
  if (!meta) throw new Error(`Component "${componentName}" not found`);

  if (!fs.existsSync(meta.filePath)) throw new Error(`File not found: ${meta.filePath}`);

  console.log(` Manually reloading: ${componentName}`);

  try {
    const content = fs.readFileSync(meta.filePath, 'utf-8');
    const version = versionManager.generateVersion(content, meta.filePath);

    // Clear require cache for JS
    if (meta.type === 'js') {
      delete require.cache[require.resolve(meta.filePath)];
    }

    // Re-register
    if (meta.type === 'js') {
      await registerJSComponent(meta.filePath, componentName, content, version);
    } else {
      await registerFMLComponent(meta.filePath, componentName, content, version);
    }

    versionManager.setVersion(componentName, version);
    console.log(` Component "${componentName}" reloaded successfully`);
    return true;
  } catch (error) {
    console.error(` Failed to reload "${componentName}":`, error.message);
    throw error;
  }
}

export function getRegistrationStats() {
  const componentCount = Object.keys(components).length;
  const jsCount = Object.values(components).filter(c => !c._isFMLComponent).length;
  const fmlCount = componentCount - jsCount;

  return {
    components: { total: componentCount, js: jsCount, fml: fmlCount },
    dependencies: {
      totalGraph: dependencyGraph.size,
      averageDependencies: dependencyGraph.size > 0
        ? Array.from(dependencyGraph.values()).reduce((sum, deps) => sum + deps.length, 0) / dependencyGraph.size
        : 0,
      maxDependencies: dependencyGraph.size > 0
        ? Math.max(...Array.from(dependencyGraph.values()).map(deps => deps.length))
        : 0
    },
    performance: {
      slowComponents: performanceMonitor.getSlowComponents(5).length,
      totalMetrics: performanceMonitor.getAllMetrics(),
      watchedFiles: hotReloadManager.watchers.size
    },
    versions: versionManager.getAllVersions(),
    metadata: {
      totalEntries: componentMetadata.size,
      memoryUsage: process.memoryUsage()
    }
  };
}

export function analyzeDependencies(componentName = null) {
  if (componentName) {
    const deps = dependencyGraph.get(componentName) || [];
    const dependents = Array.from(dependencyGraph.entries())
      .filter(([_, list]) => list.includes(componentName))
      .map(([name]) => name);

    return {
      component: componentName,
      dependencies: deps,
      dependents,
      exists: hasComponent(componentName),
      metadata: componentMetadata.get(componentName)
    };
  }

  const analysis = {
    totalComponents: dependencyGraph.size,
    orphanComponents: [],
    cyclicDependencies: [],
    deeplyNestedComponents: [],
    missingDependencies: []
  };

  const visited = new Set();
  const visiting = new Set();

  const detectCycles = (name, path = []) => {
    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name);
      analysis.cyclicDependencies.push(path.slice(cycleStart).concat(name));
      return;
    }
    if (visited.has(name)) return;

    visiting.add(name);
    const deps = dependencyGraph.get(name) || [];

    for (const dep of deps) {
      if (!hasComponent(dep)) analysis.missingDependencies.push({ component: name, missing: dep });
      else detectCycles(dep, [...path, name]);
    }

    visiting.delete(name);
    visited.add(name);
  };

  for (const name of Object.keys(components)) {
    const deps = dependencyGraph.get(name) || [];
    const hasDependents = Array.from(dependencyGraph.values()).some(list => list.includes(name));

    if (deps.length === 0 && !hasDependents) analysis.orphanComponents.push(name);
    if (deps.length > 5) analysis.deeplyNestedComponents.push({ component: name, dependencyCount: deps.length, dependencies: deps });

    detectCycles(name);
  }

  return analysis;
}

export async function validateAllComponents(options = {}) {
  const { strict = false, includePerformance = true } = options;
  const validator = new ComponentValidator({ strict, validatePerformance: includePerformance });
  const results = {
    total: 0,
    passed: 0,
    warnings: 0,
    errors: 0,
    components: {}
  };

  console.log(' Starting comprehensive component validation...');

  for (const [name, component] of Object.entries(components)) {
    const meta = componentMetadata.get(name);
    const timer = createTimer(`Validate-${name}`);

    try {
      let issues;
      if (component._isFMLComponent) {
        const content = fs.readFileSync(meta.filePath, 'utf-8');
        issues = validator.validateFMLComponent(name, content, meta.filePath);
      } else {
        issues = validator.validateJSComponent(name, component, meta.filePath);
      }

      const totalIssues = issues.errors.length + issues.warnings.length + issues.performance.length;
      const validationTime = timer.end();

      results.components[name] = {
        type: meta?.type || 'unknown',
        issues,
        validationTime,
        status: issues.errors.length > 0 ? 'error' :
                totalIssues > 0 ? 'warning' : 'passed'
      };

      results.total++;
      results.errors += issues.errors.length;
      results.warnings += issues.warnings.length + issues.performance.length;

      if (issues.errors.length === 0 && totalIssues === 0) results.passed++;

    } catch (error) {
      results.components[name] = {
        type: meta?.type || 'unknown',
        issues: { errors: [error.message], warnings: [], performance: [] },
        validationTime: timer.end(),
        status: 'error'
      };
      results.total++;
      results.errors++;
    }
  }

  console.log(`\n Validation Complete:`);
  console.log(`   Total: ${results.total} components`);
  console.log(`   Passed: ${results.passed} (${((results.passed / results.total) * 100).toFixed(1)}%)`);
  console.log(`   Warnings: ${results.warnings}`);
  console.log(`   Errors: ${results.errors}`);

  const issues = Object.entries(results.components)
    .filter(([_, r]) => r.status !== 'passed')
    .sort((a, b) => {
      const aScore = a[1].issues.errors.length * 2 + a[1].issues.warnings.length;
      const bScore = b[1].issues.errors.length * 2 + b[1].issues.warnings.length;
      return bScore - aScore;
    });

  if (issues.length > 0) {
    console.log(`\n⚠️  Components requiring attention:`);
    issues.slice(0, 10).forEach(([name, result]) => {
      const e = result.issues.errors.length;
      const w = result.issues.warnings.length + result.issues.performance.length;
      console.log(`   • ${name}: ${e} errors, ${w} warnings`);
    });
    if (issues.length > 10) console.log(`   ... and ${issues.length - 10} more`);
  }

  return results;
}

export function getPerformanceInsights() {
  const allMetrics = performanceMonitor.getAllMetrics();
  const insights = {
    summary: {
      totalComponents: Object.keys(allMetrics).length,
      slowComponents: performanceMonitor.getSlowComponents(10).length,
      totalOperations: 0,
      averageRenderTime: 0
    },
    slowestComponents: performanceMonitor.getSlowComponents(5),
    operationBreakdown: {},
    recommendations: []
  };

  let totalRenderTime = 0;
  let totalRenderCount = 0;

  for (const [comp, ops] of Object.entries(allMetrics)) {
    for (const [op, m] of Object.entries(ops)) {
      insights.summary.totalOperations += m.count;
      if (!insights.operationBreakdown[op]) {
        insights.operationBreakdown[op] = { count: 0, totalTime: 0, components: 0 };
      }
      insights.operationBreakdown[op].count += m.count;
      insights.operationBreakdown[op].totalTime += m.totalTime;
      insights.operationBreakdown[op].components++;
      if (op === 'render') {
        totalRenderTime += m.totalTime;
        totalRenderCount += m.count;
      }
    }
  }

  insights.summary.averageRenderTime = totalRenderCount > 0 ? totalRenderTime / totalRenderCount : 0;

  const fmlCount = Object.values(components).filter(c => c._isFMLComponent).length;
  const jsCount = Object.values(components).filter(c => !c._isFMLComponent).length;

  if (fmlCount > jsCount * 2) {
    insights.recommendations.push({
      type: 'architecture',
      priority: 'medium',
      message: 'Consider converting frequently used FML components to JS for better performance'
    });
  }

  return insights;
}

export function exportComponentRegistry(format = 'json') {
  const registry = {
    metadata: {
      exportTime: new Date().toISOString(),
      totalComponents: Object.keys(components).length,
      environment: process.env.NODE_ENV,
      version: '1.0.0'
    },
    components: getComponentDetails(),
    dependencies: Object.fromEntries(dependencyGraph),
    performance: performanceMonitor.getAllMetrics(),
    versions: versionManager.getAllVersions(),
    statistics: getRegistrationStats()
  };

  switch (format.toLowerCase()) {
    case 'json': return JSON.stringify(registry, null, 2);
    case 'yaml':
      return Object.entries(registry)
        .map(([key, value]) => `${key}:\n${JSON.stringify(value, null, 2).split('\n').map(line => `  ${line}`).join('\n')}`)
        .join('\n\n');
    default: return registry;
  }
}

// === CLEANUP AND SHUTDOWN ===
export function shutdown() {
  console.log(' Shutting down component registry...');
  hotReloadManager.unwatchAll();
  clearComponents();
  console.log(' Component registry shutdown complete');
}

// Auto-cleanup on exit
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Development debugging hook
if (isDevelopment) {
  globalThis.__FOLONITE_COMPONENTS__ = {
    components,
    metadata: componentMetadata,
    dependencies: dependencyGraph,
    performance: performanceMonitor,
    versions: versionManager,
    hotReload: hotReloadManager
  };
}