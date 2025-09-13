// src/fml/utils/helpers.js
// Enhanced FML Utility Helper Functions - Performance & Memory Optimized

/**
 * Simple, safe cloning for logging/debugging purposes
 * Does not handle Date, RegExp, circular refs — but safe for plain objects
 */
function tryClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => tryClone(item));
  }
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = tryClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
}

// ==============================
// Environment Detection
// ==============================

export function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function isNode() {
  return typeof process !== 'undefined' &&
         process.versions &&
         process.versions.node;
}

export function getEnvironment() {
  if (isBrowser()) return 'browser';
  if (isNode()) return 'node';
  return 'unknown';
}

export function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// ==============================
// Debug Utilities
// ==============================

export class FMLDebugger {
  constructor() {
    this.enabled = isDevelopment();
    this.logs = [];
    this.maxLogs = 1000;
    this.startTime = Date.now();
  }

  log(level, message, context = {}) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
      context: tryClone(context), // ✅ Fixed: no longer uses deepClone from escape.js
      stack: new Error().stack
    };

    this.logs.push(logEntry);

    // Keep logs bounded
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output with styling
    const styles = {
      error: 'color: #ff6b6b; font-weight: bold;',
      warn: 'color: #ffa726; font-weight: bold;',
      info: 'color: #42a5f5;',
      debug: 'color: #66bb6a;',
      trace: 'color: #ab47bc;'
    };

    console.log(
      `%c[FML ${level.toUpperCase()}]%c ${message}`,
      styles[level] || styles.info,
      'color: inherit;',
      context
    );
  }

  error(message, context) { this.log('error', message, context); }
  warn(message, context) { this.log('warn', message, context); }
  info(message, context) { this.log('info', message, context); }
  debug(message, context) { this.log('debug', message, context); }
  trace(message, context) { this.log('trace', message, context); }

  getLogs(level = null, limit = 100) {
    let filtered = level ? this.logs.filter(log => log.level === level) : this.logs;
    return filtered.slice(-limit);
  }

  clearLogs() {
    this.logs = [];
  }

  exportLogs() {
    return {
      timestamp: new Date().toISOString(),
      session: Date.now() - this.startTime,
      logs: this.logs,
      summary: {
        total: this.logs.length,
        byLevel: this.logs.reduce((acc, log) => {
          acc[log.level] = (acc[log.level] || 0) + 1;
          return acc;
        }, {})
      }
    };
  }

  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
}

export const fmlDebugger = new FMLDebugger();

// ==============================
// Performance Profiler
// ==============================

export class FMLProfiler {
  constructor() {
    this.profiles = new Map();
    this.activeProfiles = new Set();
  }

  start(profileId) {
    if (this.activeProfiles.has(profileId)) {
      console.warn(`Profile ${profileId} is already active`);
      return;
    }

    const profile = {
      id: profileId,
      startTime: performance.now(),
      startMemory: this.getCurrentMemory(),
      marks: [],
      operations: []
    };

    this.profiles.set(profileId, profile);
    this.activeProfiles.add(profileId);
    
    fmlDebugger.debug(`Started profile: ${profileId}`);
    return profile;
  }

  mark(profileId, label, data = {}) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      console.warn(`Profile ${profileId} not found`);
      return;
    }

    const now = performance.now();
    const mark = {
      label,
      timestamp: now,
      elapsed: now - profile.startTime,
      memory: this.getCurrentMemory(),
      data: tryClone(data) // ✅ Fixed: no longer uses deepClone from escape.js
    };

    profile.marks.push(mark);
    fmlDebugger.debug(`Profile mark: ${profileId}.${label}`, { elapsed: mark.elapsed });
  }

  operation(profileId, operationType, fn, context = {}) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      console.warn(`Profile ${profileId} not found`);
      return fn();
    }

    const startTime = performance.now();
    const startMemory = this.getCurrentMemory();
    
    let result, error;
    try {
      result = fn();
    } catch (err) {
      error = err;
    }
    
    const endTime = performance.now();
    const endMemory = this.getCurrentMemory();
    
    const operation = {
      type: operationType,
      startTime,
      endTime,
      duration: endTime - startTime,
      startMemory,
      endMemory,
      memoryDelta: endMemory - startMemory,
      context: tryClone(context), // ✅ Fixed: no longer uses deepClone from escape.js
      success: !error,
      error: error ? error.message : null
    };

    profile.operations.push(operation);
    
    if (error) throw error;
    return result;
  }

  async operationAsync(profileId, operationType, fn, context = {}) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      console.warn(`Profile ${profileId} not found`);
      return fn();
    }

    const startTime = performance.now();
    const startMemory = this.getCurrentMemory();
    
    let result, error;
    try {
      result = await fn();
    } catch (err) {
      error = err;
    }
    
    const endTime = performance.now();
    const endMemory = this.getCurrentMemory();
    
    const operation = {
      type: operationType,
      startTime,
      endTime,
      duration: endTime - startTime,
      startMemory,
      endMemory,
      memoryDelta: endMemory - startMemory,
      context: tryClone(context), // ✅ Fixed: no longer uses deepClone from escape.js
      success: !error,
      error: error ? error.message : null,
      async: true
    };

    profile.operations.push(operation);
    
    if (error) throw error;
    return result;
  }

  end(profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      console.warn(`Profile ${profileId} not found`);
      return null;
    }

    if (!this.activeProfiles.has(profileId)) {
      console.warn(`Profile ${profileId} is not active`);
      return profile;
    }

    const endTime = performance.now();
    const endMemory = this.getCurrentMemory();
    
    profile.endTime = endTime;
    profile.endMemory = endMemory;
    profile.duration = endTime - profile.startTime;
    profile.memoryDelta = endMemory - profile.startMemory;
    
    this.activeProfiles.delete(profileId);
    
    fmlDebugger.info(`Ended profile: ${profileId}`, {
      duration: profile.duration,
      memoryDelta: profile.memoryDelta,
      operations: profile.operations.length
    });

    return profile;
  }

  getProfile(profileId) {
    return this.profiles.get(profileId);
  }

  getReport(profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) return null;

    const operations = profile.operations;
    const operationStats = operations.reduce((acc, op) => {
      if (!acc[op.type]) {
        acc[op.type] = {
          count: 0,
          totalDuration: 0,
          totalMemoryDelta: 0,
          errors: 0
        };
      }
      
      const stats = acc[op.type];
      stats.count++;
      stats.totalDuration += op.duration;
      stats.totalMemoryDelta += op.memoryDelta;
      if (!op.success) stats.errors++;
      
      return acc;
    }, {});

    Object.values(operationStats).forEach(stats => {
      stats.averageDuration = stats.totalDuration / stats.count;
      stats.averageMemoryDelta = stats.totalMemoryDelta / stats.count;
    });

    return {
      profile: {
        id: profile.id,
        duration: profile.duration || (performance.now() - profile.startTime),
        memoryDelta: profile.memoryDelta || (this.getCurrentMemory() - profile.startMemory),
        marksCount: profile.marks.length,
        operationsCount: operations.length
      },
      operations: operationStats,
      marks: profile.marks,
      timeline: operations.map(op => ({
        type: op.type,
        start: op.startTime - profile.startTime,
        duration: op.duration,
        success: op.success
      }))
    };
  }

  getCurrentMemory() {
    const usage = getMemoryUsage();
    if (usage.node) return usage.node.raw.heapUsed;
    if (usage.browser) return usage.browser.raw.usedJSHeapSize;
    return 0;
  }

  clear(profileId) {
    if (profileId) {
      this.profiles.delete(profileId);
      this.activeProfiles.delete(profileId);
    } else {
      this.profiles.clear();
      this.activeProfiles.clear();
    }
  }
}

export const fmlProfiler = new FMLProfiler();

// ==============================
// System Health Monitor
// ==============================

export class SystemHealthMonitor {
  constructor(options = {}) {
    this.thresholds = {
      memoryWarning: options.memoryWarning || 100 * 1024 * 1024, // 100MB
      memoryCritical: options.memoryCritical || 500 * 1024 * 1024, // 500MB
      renderTimeWarning: options.renderTimeWarning || 100, // 100ms
      renderTimeCritical: options.renderTimeCritical || 500, // 500ms
      errorRate: options.errorRate || 0.05, // 5%
      ...options.thresholds
    };
    
    this.alerts = [];
    this.maxAlerts = 100;
    this.lastCheck = Date.now();
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
  }

  checkHealth() {
    const now = Date.now();
    const alerts = [];
    
    // Memory check
    const memory = getMemoryUsage();
    let currentMemory = 0;
    if (memory.node) currentMemory = memory.node.raw.heapUsed;
    if (memory.browser) currentMemory = memory.browser.raw.usedJSHeapSize;
    
    if (currentMemory > this.thresholds.memoryCritical) {
      alerts.push({
        level: 'critical',
        type: 'memory',
        message: `Critical memory usage: ${formatBytes(currentMemory)}`,
        value: currentMemory,
        threshold: this.thresholds.memoryCritical
      });
    } else if (currentMemory > this.thresholds.memoryWarning) {
      alerts.push({
        level: 'warning',
        type: 'memory',
        message: `High memory usage: ${formatBytes(currentMemory)}`,
        value: currentMemory,
        threshold: this.thresholds.memoryWarning
      });
    }

    // Performance check
    const stats = fmlStats.getStats();
    const avgRenderTime = parseFloat(stats.averageRenderTime);
    
    if (avgRenderTime > this.thresholds.renderTimeCritical) {
      alerts.push({
        level: 'critical',
        type: 'performance',
        message: `Critical render time: ${avgRenderTime}ms`,
        value: avgRenderTime,
        threshold: this.thresholds.renderTimeCritical
      });
    } else if (avgRenderTime > this.thresholds.renderTimeWarning) {
      alerts.push({
        level: 'warning',
        type: 'performance',
        message: `Slow render time: ${avgRenderTime}ms`,
        value: avgRenderTime,
        threshold: this.thresholds.renderTimeWarning
      });
    }

    // Error rate check
    const totalOperations = stats.parses + stats.compilations + stats.renders;
    const errorRate = totalOperations > 0 ? stats.errors / totalOperations : 0;
    
    if (errorRate > this.thresholds.errorRate) {
      alerts.push({
        level: 'warning',
        type: 'errors',
        message: `High error rate: ${(errorRate * 100).toFixed(2)}%`,
        value: errorRate,
        threshold: this.thresholds.errorRate
      });
    }

    // Cache efficiency check
    const cacheStats = getCacheStats();
    const hitRate = parseFloat(cacheStats.hitRate);
    
    if (hitRate < 50) {
      alerts.push({
        level: 'warning',
        type: 'cache',
        message: `Low cache hit rate: ${hitRate}%`,
        value: hitRate,
        threshold: 50
      });
    }

    // Store alerts with timestamps
    alerts.forEach(alert => {
      alert.timestamp = now;
      this.alerts.push(alert);
    });

    // Keep alerts bounded
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    this.lastCheck = now;
    return alerts;
  }

  getHealthStatus() {
    const recentAlerts = this.alerts.filter(
      alert => Date.now() - alert.timestamp < 300000 // Last 5 minutes
    );

    const criticalAlerts = recentAlerts.filter(alert => alert.level === 'critical');
    const warningAlerts = recentAlerts.filter(alert => alert.level === 'warning');

    let status = 'healthy';
    if (criticalAlerts.length > 0) {
      status = 'critical';
    } else if (warningAlerts.length > 0) {
      status = 'warning';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      alerts: recentAlerts,
      summary: {
        critical: criticalAlerts.length,
        warning: warningAlerts.length,
        total: recentAlerts.length
      },
      lastCheck: new Date(this.lastCheck).toISOString()
    };
  }

  startMonitoring() {
    if (this.monitoringInterval) return;
    
    this.monitoringInterval = setInterval(() => {
      const alerts = this.checkHealth();
      
      // Log critical alerts immediately
      alerts.forEach(alert => {
        if (alert.level === 'critical') {
          fmlDebugger.error(`Health Alert: ${alert.message}`, alert);
        } else if (alert.level === 'warning') {
          fmlDebugger.warn(`Health Alert: ${alert.message}`, alert);
        }
      });
    }, this.checkInterval);
    
    fmlDebugger.info('System health monitoring started');
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      fmlDebugger.info('System health monitoring stopped');
    }
  }
}

export const healthMonitor = new SystemHealthMonitor();

// ==============================
// Enhanced LRU Cache (with memory tracking)
// ==============================

class LRUCache {
  constructor(maxSize = 100, options = {}) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.maxMemoryUsage = options.maxMemoryUsage || 50 * 1024 * 1024; // 50MB
    this.currentMemoryUsage = 0;
    this.createdAt = Date.now();
    this.accessTimes = new Map();
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes
    this.setupCleanup();
  }

  get(key) {
    const now = Date.now();
    this.accessTimes.set(key, now);
    
    if (this.cache.has(key)) {
      this.hits++;
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    
    this.misses++;
    return undefined;
  }

  set(key, value) {
    const valueSize = this.estimateSize(value);
    
    if (this.currentMemoryUsage + valueSize > this.maxMemoryUsage) {
      this.evictOldest(valueSize);
    }
    
    if (this.cache.has(key)) {
      const oldValue = this.cache.get(key);
      this.currentMemoryUsage -= this.estimateSize(oldValue);
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, value);
    this.currentMemoryUsage += valueSize;
    this.accessTimes.set(key, Date.now());
  }

  evictOldest(requiredSpace = 0) {
    let freedSpace = 0;
    const entries = Array.from(this.cache.entries());
    
    const sortedByAccess = entries.sort((a, b) => {
      const timeA = this.accessTimes.get(a[0]) || 0;
      const timeB = this.accessTimes.get(b[0]) || 0;
      return timeA - timeB;
    });
    
    for (const [key, value] of sortedByAccess) {
      const size = this.estimateSize(value);
      this.cache.delete(key);
      this.accessTimes.delete(key);
      this.currentMemoryUsage -= size;
      freedSpace += size;
      this.evictions++;
      
      if (freedSpace >= requiredSpace && this.cache.size < this.maxSize) {
        break;
      }
    }
  }

  estimateSize(obj) {
    if (typeof obj === 'string') return obj.length * 2;
    if (typeof obj === 'number') return 8;
    if (typeof obj === 'boolean') return 4;
    if (obj === null || obj === undefined) return 0;
    
    if (typeof obj === 'object') {
      try {
        return JSON.stringify(obj).length * 2;
      } catch {
        return 1000;
      }
    }
    
    return 100;
  }

  setupCleanup() {
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        this.cleanupStaleEntries();
      }, this.cleanupInterval);
    }
  }

  cleanupStaleEntries() {
    const now = Date.now();
    const staleThreshold = 3600000; // 1 hour
    
    for (const [key, lastAccess] of this.accessTimes.entries()) {
      if (now - lastAccess > staleThreshold && this.cache.has(key)) {
        const value = this.cache.get(key);
        this.currentMemoryUsage -= this.estimateSize(value);
        this.cache.delete(key);
        this.accessTimes.delete(key);
        this.evictions++;
      }
    }
  }

  clear() {
    this.cache.clear();
    this.accessTimes.clear();
    this.currentMemoryUsage = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  size() { return this.cache.size; }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%',
      memoryUsage: formatBytes(this.currentMemoryUsage),
      maxMemoryUsage: formatBytes(this.maxMemoryUsage),
      memoryUtilization: ((this.currentMemoryUsage / this.maxMemoryUsage) * 100).toFixed(2) + '%',
      uptime: Date.now() - this.createdAt
    };
  }
}

const globalCache = new LRUCache(50, {
  maxMemoryUsage: 25 * 1024 * 1024, // 25MB
  cleanupInterval: 300000 // 5 minutes
});

export function cacheTemplate(key, compiled) {
  if (process.env.NODE_ENV === 'development') return;
  globalCache.set(key, compiled);
}

export function getCachedTemplate(key) {
  if (process.env.NODE_ENV === 'development') return undefined;
  return globalCache.get(key);
}

export function clearTemplateCache() {
  globalCache.clear();
}

export function getCacheStats() {
  return globalCache.getStats();
}

export function generateCacheKey(fmlContent, components = {}) {
  const componentKeys = Object.keys(components).sort().join(',');
  const contentHash = simpleHash(fmlContent);
  return `${contentHash}-${simpleHash(componentKeys)}`;
}

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}

// ==============================
// Deep Clone & Object Utilities
// ==============================

export function deepClone(obj, visited = new WeakMap()) {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (visited.has(obj)) return visited.get(obj);
  
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) {
    const cloned = [];
    visited.set(obj, cloned);
    for (let i = 0; i < obj.length; i++) {
      cloned[i] = deepClone(obj[i], visited);
    }
    return cloned;
  }
  
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
  
  if (obj.constructor === Object || obj.constructor === undefined) {
    const cloned = {};
    visited.set(obj, cloned);
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key], visited);
      }
    }
    return cloned;
  }
  
  return obj;
}

export function mergeObjects(...objects) {
  const result = {};
  for (const obj of objects) {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
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

export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

export function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}

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

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function safeGet(obj, path, defaultValue = undefined) {
  if (!obj || typeof obj !== 'object') return defaultValue;
  const keys = typeof path === 'string' ? path.split('.') : path;
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) return defaultValue;
    current = current[key];
  }
  return current;
}

export function safeSet(obj, path, value) {
  if (!obj || typeof obj !== 'object') return false;
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

export function createUniqueId(prefix = 'fml') {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 9);
  const entropy = (Math.random() * 1000000).toString(36);
  return `${prefix}-${timestamp}-${randomPart}-${entropy}`;
}

// ==============================
// Performance Timer & Measurement
// ==============================

export class PerfTimer {
  constructor(name = 'Timer') {
    this.name = name;
    this.start = performance.now();
    this.marks = [];
    this.memory = this.getInitialMemory();
  }

  getInitialMemory() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize
      };
    }
    return null;
  }

  mark(label) {
    const now = performance.now();
    const elapsed = now - this.start;
    const currentMemory = this.getInitialMemory();
    
    const markData = {
      label,
      time: elapsed,
      timestamp: now,
      memory: currentMemory
    };
    
    this.marks.push(markData);
    
    if (this.name !== 'Silent') {
      console.log(`${this.name} - ${label}: ${elapsed.toFixed(2)}ms`);
    }
    
    return elapsed;
  }

  end() {
    const totalTime = this.mark('Total');
    const finalMemory = this.getInitialMemory();
    
    const report = {
      name: this.name,
      totalTime: totalTime.toFixed(2) + 'ms',
      marks: this.marks,
      memoryDelta: finalMemory && this.memory ? {
        used: formatBytes(finalMemory.used - this.memory.used),
        total: formatBytes(finalMemory.total - this.memory.total)
      } : null
    };
    
    return report;
  }

  getReport() {
    return {
      name: this.name,
      totalTime: (performance.now() - this.start).toFixed(2) + 'ms',
      marks: this.marks,
      avgMarkTime: this.marks.length > 0 
        ? (this.marks.reduce((sum, mark) => sum + mark.time, 0) / this.marks.length).toFixed(2) + 'ms'
        : '0ms'
    };
  }
}

export function createTimer(name) {
  return new PerfTimer(name);
}

export function measureTime(fn, name = 'Function') {
  return function(...args) {
    const timer = createTimer(name);
    const result = fn.apply(this, args);
    timer.end();
    return result;
  };
}

export function measureTimeAsync(fn, name = 'AsyncFunction') {
  return async function(...args) {
    const timer = createTimer(name);
    const result = await fn.apply(this, args);
    timer.end();
    return result;
  };
}

// ==============================
// Memory Utilities
// ==============================

export function getMemoryUsage() {
  const result = {
    timestamp: new Date().toISOString(),
    environment: getEnvironment()
  };
  
  if (isNode()) {
    const usage = process.memoryUsage();
    result.node = {
      rss: formatBytes(usage.rss),
      heapTotal: formatBytes(usage.heapTotal),
      heapUsed: formatBytes(usage.heapUsed),
      external: formatBytes(usage.external),
      raw: usage,
      heapUtilization: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2) + '%'
    };
  }
  
  if (isBrowser() && performance.memory) {
    result.browser = {
      usedJSHeapSize: formatBytes(performance.memory.usedJSHeapSize),
      totalJSHeapSize: formatBytes(performance.memory.totalJSHeapSize),
      jsHeapSizeLimit: formatBytes(performance.memory.jsHeapSizeLimit),
      raw: performance.memory,
      heapUtilization: ((performance.memory.usedJSHeapSize / performance.memory.totalJSHeapSize) * 100).toFixed(2) + '%'
    };
  }
  
  if (!result.node && !result.browser) {
    result.message = 'Memory usage not available in this environment';
  }
  
  return result;
}

// ==============================
// Memory Leak Detector
// ==============================

export class MemoryLeakDetector {
  constructor(options = {}) {
    this.samples = [];
    this.threshold = options.threshold || 50 * 1024 * 1024;
    this.sampleInterval = options.sampleInterval || 30000;
    this.maxSamples = options.maxSamples || 100;
    this.alertCallback = options.alertCallback || console.warn;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.takeSample(), this.sampleInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  takeSample() {
    const memory = getMemoryUsage();
    const timestamp = Date.now();
    
    let heapUsed = 0;
    if (memory.node) heapUsed = memory.node.raw.heapUsed;
    else if (memory.browser) heapUsed = memory.browser.raw.usedJSHeapSize;
    
    const sample = { timestamp, heapUsed, memory };
    this.samples.push(sample);
    
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    
    this.checkForLeaks();
  }

  checkForLeaks() {
    if (this.samples.length < 10) return;
    
    const recent = this.samples.slice(-10);
    const trend = this.calculateTrend(recent);
    const currentHeap = recent[recent.length - 1].heapUsed;
    
    if (trend > 0 && currentHeap > this.threshold) {
      this.alertCallback(`Potential memory leak detected: ${formatBytes(currentHeap)} used, growing trend: ${formatBytes(trend)}/sample`);
    }
  }

  calculateTrend(samples) {
    if (samples.length < 2) return 0;
    const first = samples[0].heapUsed;
    const last = samples[samples.length - 1].heapUsed;
    return (last - first) / samples.length;
  }

  getReport() {
    if (this.samples.length === 0) {
      return { message: 'No samples collected yet' };
    }
    
    const heapValues = this.samples.map(s => s.heapUsed);
    const min = Math.min(...heapValues);
    const max = Math.max(...heapValues);
    const avg = heapValues.reduce((sum, val) => sum + val, 0) / heapValues.length;
    const current = heapValues[heapValues.length - 1];
    const trend = this.calculateTrend(this.samples);
    
    return {
      sampleCount: this.samples.length,
      timespan: this.samples.length > 1 
        ? (this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp) + 'ms'
        : '0ms',
      heapUsage: {
        current: formatBytes(current),
        min: formatBytes(min),
        max: formatBytes(max),
        average: formatBytes(avg)
      },
      trend: {
        direction: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
        rate: formatBytes(Math.abs(trend)) + '/sample'
      },
      isLeaking: trend > 0 && current > this.threshold
    };
  }
}

// ==============================
// FML Stats Collector
// ==============================

export class FMLStats {
  constructor() {
    this.reset();
    this.startTime = Date.now();
    this.memoryDetector = new MemoryLeakDetector({
      threshold: 100 * 1024 * 1024,
      sampleInterval: 60000,
      alertCallback: (message) => console.warn(`[FML] ${message}`)
    });
  }

  reset() {
    this.stats = {
      parses: 0,
      compilations: 0,
      renders: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      warnings: 0,
      totalParseTime: 0,
      totalCompileTime: 0,
      totalRenderTime: 0,
      peakMemoryUsage: 0,
      componentsRegistered: 0,
      templatesProcessed: new Set(),
      errorTypes: new Map(),
      performanceMarks: []
    };
  }

  incrementParse(time = 0) {
    this.stats.parses++;
    this.stats.totalParseTime += time;
    this.updatePeakMemory();
  }

  incrementCompile(time = 0) {
    this.stats.compilations++;
    this.stats.totalCompileTime += time;
    this.updatePeakMemory();
  }

  incrementRender(time = 0) {
    this.stats.renders++;
    this.stats.totalRenderTime += time;
    this.updatePeakMemory();
  }

  incrementCacheHit() { this.stats.cacheHits++; }
  incrementCacheMiss() { this.stats.cacheMisses++; }
  incrementError(errorType = 'unknown') {
    this.stats.errors++;
    const count = this.stats.errorTypes.get(errorType) || 0;
    this.stats.errorTypes.set(errorType, count + 1);
  }
  incrementWarning() { this.stats.warnings++; }
  trackTemplate(templateId) { this.stats.templatesProcessed.add(templateId); }
  trackComponent() { this.stats.componentsRegistered++; }
  addPerformanceMark(label, time) {
    this.stats.performanceMarks.push({ label, time, timestamp: Date.now() });
  }

  updatePeakMemory() {
    const memory = getMemoryUsage();
    let currentUsage = 0;
    if (memory.node) currentUsage = memory.node.raw.heapUsed;
    if (memory.browser) currentUsage = memory.browser.raw.usedJSHeapSize;
    if (currentUsage > this.stats.peakMemoryUsage) {
      this.stats.peakMemoryUsage = currentUsage;
    }
  }

  getStats() {
    const cacheTotal = this.stats.cacheHits + this.stats.cacheMisses;
    const uptime = Date.now() - this.startTime;
    
    return {
      ...this.stats,
      templatesProcessed: this.stats.templatesProcessed.size,
      averageParseTime: this.stats.parses > 0 
        ? (this.stats.totalParseTime / this.stats.parses).toFixed(2) 
        : 0,
      averageCompileTime: this.stats.compilations > 0 
        ? (this.stats.totalCompileTime / this.stats.compilations).toFixed(2) 
        : 0,
      averageRenderTime: this.stats.renders > 0 
        ? (this.stats.totalRenderTime / this.stats.renders).toFixed(2) 
        : 0,
      cacheHitRate: cacheTotal > 0 
        ? ((this.stats.cacheHits / cacheTotal) * 100).toFixed(1) + '%' 
        : '0%',
      peakMemoryUsage: formatBytes(this.stats.peakMemoryUsage),
      uptime: formatTime(uptime),
      throughput: {
        parsesPerSecond: uptime > 0 ? (this.stats.parses / (uptime / 1000)).toFixed(2) : 0,
        rendersPerSecond: uptime > 0 ? (this.stats.renders / (uptime / 1000)).toFixed(2) : 0
      },
      errorBreakdown: Object.fromEntries(this.stats.errorTypes),
      recentMarks: this.stats.performanceMarks.slice(-10)
    };
  }

  getDetailedReport() {
    const stats = this.getStats();
    const memory = getMemoryUsage();
    const cache = getCacheStats();
    const leak = this.memoryDetector.getReport();
    
    return {
      timestamp: new Date().toISOString(),
      fmlStats: stats,
      memoryUsage: memory,
      cacheStats: cache,
      leakDetection: leak,
      systemInfo: {
        environment: getEnvironment(),
        isDevelopment: isDevelopment(),
        nodeVersion: isNode() ? process.version : 'N/A',
        userAgent: isBrowser() ? navigator.userAgent : 'N/A'
      }
    };
  }

  startMonitoring() {
    this.memoryDetector.start();
  }

  stopMonitoring() {
    this.memoryDetector.stop();
  }

  report() {
    const report = this.getDetailedReport();
    console.group('🔍 FML Performance Report');
    console.table(report.fmlStats);
    console.log('💾 Memory:', report.memoryUsage);
    console.log('📦 Cache:', report.cacheStats);
    console.log('🔍 Leak Detection:', report.leakDetection);
    console.groupEnd();
  }
}

function formatTime(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  if (ms < 3600000) return (ms / 60000).toFixed(1) + 'm';
  return (ms / 3600000).toFixed(1) + 'h';
}

export const fmlStats = new FMLStats();

// ==============================
// Component Utilities
// ==============================

export function createFMLError(message, context = {}) {
  const error = new Error(message);
  error.name = 'FMLError';
  error.context = context;
  error.timestamp = new Date().toISOString();
  return error;
}

export function validateComponent(component, name) {
  if (typeof component !== 'function') {
    throw createFMLError(`Component "${name}" must be a function`, { 
      name, 
      type: typeof component,
      received: component 
    });
  }
  
  if (component.length > 1) {
    console.warn(`Component "${name}" accepts ${component.length} parameters. FML components should accept only props object.`);
  }
  
  return true;
}

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

// ==============================
// Dev Tools Integration
// ==============================

export function initializeDevTools() {
  if (!isDevelopment() || !isBrowser()) return;

  if (typeof window !== 'undefined') {
    window.FML_DEBUG = {
      stats: fmlStats,
      debugger: fmlDebugger,
      profiler: fmlProfiler,
      healthMonitor: healthMonitor,
      cache: {
        stats: getCacheStats,
        clear: clearTemplateCache
      },
      memory: {
        usage: getMemoryUsage,
        gc: () => {
          if (window.gc) {
            window.gc();
            return 'Garbage collection triggered';
          }
          return 'Garbage collection not available (start Chrome with --expose-gc)';
        }
      },
      utils: {
        formatBytes,
        // ❌ Removed: deepClone — to avoid dependency on escape.js
        createTimer,
        measureTime,
        measureTimeAsync,
        debounce,
        throttle,
        safeGet,
        safeSet,
        createUniqueId,
        isBrowser,
        isNode,
        getEnvironment,
        isDevelopment,
        isProduction
      }
    };

    console.log('%c🚀 FML Development Tools Loaded', 'color: #42a5f5; font-weight: bold;');
    console.log('Access debugging tools via window.FML_DEBUG');
    console.log('Available commands:');
    console.log('  - FML_DEBUG.stats.report() - Show performance stats');
    console.log('  - FML_DEBUG.cache.stats() - Show cache statistics');
    console.log('  - FML_DEBUG.memory.usage() - Show memory usage');
    console.log('  - FML_DEBUG.healthMonitor.getHealthStatus() - System health');
  }
}

// ==============================
// Export All Utilities as a Single Namespace
// ==============================

export const utils = {
  // Cache utilities
  cacheTemplate,
  getCachedTemplate,
  clearTemplateCache,
  getCacheStats,
  generateCacheKey,

  // Object utilities
  // ❌ Removed: deepClone — to avoid dependency on escape.js
  mergeObjects,
  isEmpty,
  safeGet,
  safeSet,

  // String utilities
  camelToKebab,
  kebabToCamel,

  // Performance utilities
  debounce,
  throttle,
  createTimer,
  measureTime,
  measureTimeAsync,
  formatBytes,

  // Environment utilities
  isBrowser,
  isNode,
  getEnvironment,
  isDevelopment,
  isProduction,

  // Component utilities
  validateComponent,
  normalizeComponents,
  createFMLError,
  createUniqueId,

  // Memory utilities
  getMemoryUsage,
  MemoryLeakDetector,

  // Debugging
  fmlDebugger,
  fmlProfiler,
  healthMonitor,
  fmlStats,
  initializeDevTools
};

// ==============================
// Auto-initialize in Development
// ==============================

if (isDevelopment()) {
  healthMonitor.startMonitoring();
  fmlStats.startMonitoring();
  
  if (isBrowser()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeDevTools);
    } else {
      initializeDevTools();
    }
  }
}