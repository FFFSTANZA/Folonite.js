// src/fml/utils/helpers.js
// FML Utility Helper Functions - Phase 1

/**
 * Performance and utility helpers for FML
 */

// Cache for compiled FML templates
const templateCache = new Map();

/**
 * Simple LRU cache implementation
 */
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Global template cache
const globalCache = new LRUCache(50);

/**
 * Cache compiled FML templates for performance
 */
export function cacheTemplate(key, compiled) {
  if (process.env.NODE_ENV === 'development') {
    return; // Don't cache in development for hot reload
  }
  globalCache.set(key, compiled);
}

/**
 * Get cached template
 */
export function getCachedTemplate(key) {
  if (process.env.NODE_ENV === 'development') {
    return undefined; // Don't use cache in development
  }
  return globalCache.get(key);
}

/**
 * Clear template cache
 */
export function clearTemplateCache() {
  globalCache.clear();
}

/**
 * Generate cache key for FML content
 */
export function generateCacheKey(fmlContent, components = {}) {
  const componentKeys = Object.keys(components).sort().join(',');
  const contentHash = simpleHash(fmlContent);
  return `${contentHash}-${simpleHash(componentKeys)}`;
}

/**
 * Simple hash function for cache keys
 */
function simpleHash(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Deep clone object (for props isolation)
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  
  return obj;
}

/**
 * Merge multiple objects (for props merging)
 */
export function mergeObjects(...objects) {
  const result = {};
  
  for (const obj of objects) {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === 'object' && 
              obj[key] !== null && 
              !Array.isArray(obj[key]) &&
              typeof result[key] === 'object' && 
              result[key] !== null && 
              !Array.isArray(result[key])) {
            result[key] = mergeObjects(result[key], obj[key]);
          } else {
            result[key] = obj[key];
          }
        }
      }
    }
  }
  
  return result;
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value) {
  if (value === null || value === undefined) {
    return true;
  }
  
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  
  return false;
}

/**
 * Convert camelCase to kebab-case
 */
export function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Convert kebab-case to camelCase
 */
export function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * Debounce function execution
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function execution
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Performance timer utility
 */
export class PerfTimer {
  constructor(name = 'Timer') {
    this.name = name;
    this.start = performance.now();
  }

  mark(label) {
    const now = performance.now();
    const elapsed = now - this.start;
    console.log(`${this.name} - ${label}: ${elapsed.toFixed(2)}ms`);
    return elapsed;
  }

  end() {
    return this.mark('Total');
  }
}

/**
 * Create a performance timer
 */
export function createTimer(name) {
  return new PerfTimer(name);
}

/**
 * Measure function execution time
 */
export function measureTime(fn, name = 'Function') {
  return function(...args) {
    const timer = createTimer(name);
    const result = fn.apply(this, args);
    timer.end();
    return result;
  };
}

/**
 * Async version of measureTime
 */
export function measureTimeAsync(fn, name = 'AsyncFunction') {
  return async function(...args) {
    const timer = createTimer(name);
    const result = await fn.apply(this, args);
    timer.end();
    return result;
  };
}

/**
 * Safe property access (prevents errors on null/undefined)
 */
export function safeGet(obj, path, defaultValue = undefined) {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  const keys = typeof path === 'string' ? path.split('.') : path;
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current;
}

/**
 * Safe property setting
 */
export function safeSet(obj, path, value) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const keys = typeof path === 'string' ? path.split('.') : path;
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return true;
}

/**
 * Create a unique ID
 */
export function createUniqueId(prefix = 'fml') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if code is running in browser
 */
export function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Check if code is running in Node.js
 */
export function isNode() {
  return typeof process !== 'undefined' && process.versions && process.versions.node;
}

/**
 * Environment detection
 */
export function getEnvironment() {
  if (isBrowser()) return 'browser';
  if (isNode()) return 'node';
  return 'unknown';
}

/**
 * Development mode detection
 */
export function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

/**
 * Production mode detection
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Create error with context information
 */
export function createFMLError(message, context = {}) {
  const error = new Error(message);
  error.name = 'FMLError';
  error.context = context;
  return error;
}

/**
 * Validate component function
 */
export function validateComponent(component, name) {
  if (typeof component !== 'function') {
    throw createFMLError(`Component "${name}" must be a function`, { name, type: typeof component });
  }
  
  if (component.length > 1) {
    console.warn(`Component "${name}" accepts ${component.length} parameters. FML components should accept only props object.`);
  }
  
  return true;
}

/**
 * Normalize component registry
 */
export function normalizeComponents(components) {
  const normalized = {};
  
  for (const [name, component] of Object.entries(components)) {
    try {
      validateComponent(component, name);
      normalized[name] = component;
    } catch (error) {
      console.error(`Failed to register component "${name}":`, error.message);
    }
  }
  
  return normalized;
}

/**
 * Memory usage utilities
 */
export function getMemoryUsage() {
  if (isNode()) {
    const usage = process.memoryUsage();
    return {
      rss: formatBytes(usage.rss),
      heapTotal: formatBytes(usage.heapTotal),
      heapUsed: formatBytes(usage.heapUsed),
      external: formatBytes(usage.external),
      raw: usage
    };
  }
  
  if (isBrowser() && performance.memory) {
    return {
      usedJSHeapSize: formatBytes(performance.memory.usedJSHeapSize),
      totalJSHeapSize: formatBytes(performance.memory.totalJSHeapSize),
      jsHeapSizeLimit: formatBytes(performance.memory.jsHeapSizeLimit),
      raw: performance.memory
    };
  }
  
  return { message: 'Memory usage not available' };
}

/**
 * FML Statistics collector
 */
export class FMLStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.stats = {
      parses: 0,
      compilations: 0,
      renders: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      totalParseTime: 0,
      totalCompileTime: 0,
      totalRenderTime: 0
    };
  }

  incrementParse(time = 0) {
    this.stats.parses++;
    this.stats.totalParseTime += time;
  }

  incrementCompile(time = 0) {
    this.stats.compilations++;
    this.stats.totalCompileTime += time;
  }

  incrementRender(time = 0) {
    this.stats.renders++;
    this.stats.totalRenderTime += time;
  }

  incrementCacheHit() {
    this.stats.cacheHits++;
  }

  incrementCacheMiss() {
    this.stats.cacheMisses++;
  }

  incrementError() {
    this.stats.errors++;
  }

  getStats() {
    const cacheTotal = this.stats.cacheHits + this.stats.cacheMisses;
    return {
      ...this.stats,
      averageParseTime: this.stats.parses > 0 ? (this.stats.totalParseTime / this.stats.parses).toFixed(2) : 0,
      averageCompileTime: this.stats.compilations > 0 ? (this.stats.totalCompileTime / this.stats.compilations).toFixed(2) : 0,
      averageRenderTime: this.stats.renders > 0 ? (this.stats.totalRenderTime / this.stats.renders).toFixed(2) : 0,
      cacheHitRate: cacheTotal > 0 ? ((this.stats.cacheHits / cacheTotal) * 100).toFixed(1) + '%' : '0%'
    };
  }

  report() {
    console.table(this.getStats());
  }
}

// Global stats instance
export const fmlStats = new FMLStats();