// src/views/renderPage.js
// Enhanced Page Renderer with FML Support, Caching, Streaming & Hot Reload

import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { pathToFileURL } from 'url';
import crypto from 'crypto';
import { components } from './registerComponents.js';

// Direct FML imports (no lazy loading)
import { processFML, validateFML, FMLParser } from '../fml/index.js';
import { fmlStats, createTimer, debounce } from '../fml/utils/helpers.js';

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development';
const enableCaching = !isDevelopment;
const enableWatching = isDevelopment;

// === CACHING SYSTEM — High-Performance LRU + TTL ===

class RenderCache {
  constructor(maxSize = 100, ttl = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.stats = { hits: 0, misses: 0, invalidations: 0 };
    this.accessOrder = []; // For true LRU behavior
  }

  generateKey(pageName, options = {}, fileStats = {}) {
    const optionsHash = crypto
      .createHash('md5')
      .update(JSON.stringify(options, Object.keys(options).sort()))
      .digest('hex')
      .slice(0, 8);

    const fileHash = crypto
      .createHash('md5')
      .update(
        JSON.stringify({
          mtime: fileStats.mtime,
          size: fileStats.size,
          exists: fileStats.exists
        })
      )
      .digest('hex')
      .slice(0, 8);

    return `${pageName}-${optionsHash}-${fileHash}`;
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.stats.misses++;
      return null;
    }

    const entry = this.cache.get(key);
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.stats.misses++;
      return null;
    }

    // Move to end (LRU)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
    this.stats.hits++;
    return entry.data;
  }

  set(key, data, metadata = {}) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.invalidations++;
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      metadata
    });
    this.accessOrder.push(key);
  }

  invalidate(pattern) {
    let removed = 0;
    const keysToRemove = [];

    for (const [key] of this.cache.entries()) {
      if (
        typeof pattern === 'string'
          ? key.includes(pattern)
          : pattern.test(key)
      ) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      removed++;
    }

    this.stats.invalidations += removed;
    return removed;
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];
    this.stats.invalidations += size;
    return size;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%',
      memory: this.getMemoryUsage()
    };
  }

  getMemoryUsage() {
    let size = 0;
    for (const [key, value] of this.cache.entries()) {
      size += Buffer.byteLength(key, 'utf8');
      size += Buffer.byteLength(JSON.stringify(value), 'utf8');
    }
    return `${(size / 1024).toFixed(1)} KB`;
  }
}

const renderCache = new RenderCache();

// === FILE WATCHING SYSTEM — Optimized Debounced File System Watcher ===

class FileWatcher {
  constructor() {
    this.watchers = new Map(); // filePath → fs.WatchFileHandle
    this.callbacks = new Map(); // filePath → Array<Function>
    this.debounceTime = 100;
    this.lastWatched = new Set(); // Avoid duplicate watches
  }

  watch(filePath, callback) {
    if (!filePath || typeof callback !== 'function') return;

    const normalizedPath = path.resolve(filePath);

    // Skip if already watching
    if (this.lastWatched.has(normalizedPath)) return;
    this.lastWatched.add(normalizedPath);

    try {
      // Ensure file exists before watching
      if (!fs.existsSync(normalizedPath)) {
        console.warn(`⚠️ File does not exist, cannot watch: ${normalizedPath}`);
        return;
      }

      const debouncedCallback = debounce(() => {
        const callbacks = this.callbacks.get(normalizedPath) || [];
        callbacks.forEach(cb => {
          try {
            cb(normalizedPath);
          } catch (error) {
            console.error(`File watcher callback error for ${normalizedPath}:`, error.message);
          }
        });
      }, this.debounceTime);

      const watcher = fs.watchFile(normalizedPath, { interval: 100 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) {
          debouncedCallback();
        }
      });

      this.watchers.set(normalizedPath, watcher);
      const callbacks = this.callbacks.get(normalizedPath) || [];
      callbacks.push(callback);
      this.callbacks.set(normalizedPath, callbacks);

      if (isDevelopment) {
        console.log(`📁 Watching: ${path.relative(process.cwd(), normalizedPath)}`);
      }
    } catch (error) {
      console.warn(`Failed to watch file ${filePath}:`, error.message);
    }
  }

  unwatch(filePath) {
    const normalizedPath = path.resolve(filePath);
    if (!this.watchers.has(normalizedPath)) return;

    fs.unwatchFile(normalizedPath);
    this.watchers.delete(normalizedPath);
    this.callbacks.delete(normalizedPath);
    this.lastWatched.delete(normalizedPath);

    if (isDevelopment) {
      console.log(`📁 Stopped watching: ${path.relative(process.cwd(), normalizedPath)}`);
    }
  }

  unwatchAll() {
    for (const filePath of this.watchers.keys()) {
      this.unwatch(filePath);
    }
  }

  getStats() {
    return {
      watchedFiles: this.watchers.size,
      totalCallbacks: Array.from(this.callbacks.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }
}

const fileWatcher = new FileWatcher();

// === ERROR BOUNDARY COMPONENT — Secure, Accessible, Dev/Prod Aware ===

class ErrorBoundary {
  static create(error, context = {}) {
    const errorId = crypto.randomBytes(8).toString('hex');
    const timestamp = new Date().toISOString();

    // Log error details once
    console.error(`[ErrorBoundary ${errorId}] ${error.message}`, {
      error: error.stack,
      context,
      timestamp
    });

    return {
      errorId,
      timestamp,
      error,
      context,

      render() {
        return isDevelopment
          ? this.renderDevelopment()
          : this.renderProduction();
      },

      renderDevelopment() {
        const escapedMessage = escapeHtml(error.message);
        const escapedStack = escapeHtml(error.stack || '');
        const escapedContext = escapeHtml(JSON.stringify(context, null, 2));

        return `
          <div class="fml-error-boundary" data-error-id="${errorId}" style="
            border: 2px solid #ef4444;
            border-radius: 8px;
            padding: 20px;
            margin: 16px 0;
            background: #fef2f2;
            color: #dc2626;
            font-family: system-ui, sans-serif;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          ">
            <h3 style="margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">⚠️</span>
              Render Error
            </h3>
            <p style="margin: 0 0 8px 0;"><strong>Message:</strong> ${escapedMessage}</p>
            <p style="margin: 0 0 8px 0;"><strong>Error ID:</strong> <code>${errorId}</code></p>
            <details style="margin-top: 12px;">
              <summary style="cursor: pointer; font-weight: 500;">Stack Trace</summary>
              <pre style="
                background: #1f2937;
                color: #f9fafb;
                padding: 12px;
                border-radius: 4px;
                overflow-x: auto;
                font-size: 12px;
                margin: 8px 0 0 0;
                white-space: pre-wrap;
              ">${escapedStack}</pre>
            </details>
            ${Object.keys(context).length > 0 ? `
              <details style="margin-top: 12px;">
                <summary style="cursor: pointer; font-weight: 500;">Context</summary>
                <pre style="
                  background: #f3f4f6;
                  color: #374151;
                  padding: 12px;
                  border-radius: 4px;
                  overflow-x: auto;
                  font-size: 12px;
                  margin: 8px 0 0 0;
                  white-space: pre-wrap;
                ">${escapedContext}</pre>
              </details>
            ` : ''}
            <p style="margin: 12px 0 0 0; font-size: 14px; color: #6b7280;">
              This error occurred at ${timestamp}
            </p>
          </div>
        `;
      },

      renderProduction() {
        return `
          <div class="fml-error-fallback" style="
            padding: 20px;
            text-align: center;
            color: #6b7280;
            background: #f9fafb;
            border-radius: 8px;
            margin: 16px 0;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          ">
            <p>⚠️ Something went wrong while rendering this page.</p>
            <p style="font-size: 14px;">Error ID: <code>${errorId}</code></p>
          </div>
        `;
      }
    };
  }
}

// Helper: Escape HTML for XSS safety in dev errors
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// === FILE UTILITIES ===

function getFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return {
      exists: true,
      mtime: stats.mtime.getTime(),
      size: stats.size
    };
  } catch {
    return { exists: false };
  }
}

function findPageFile(pageName) {
  const basePath = path.resolve('./src/pages');
  const fmlPath = path.join(basePath, `${pageName}.fml`);
  const jsPath = path.join(basePath, `${pageName}.js`);

  const fmlStats = getFileStats(fmlPath);
  const jsStats = getFileStats(jsPath);

  // FML takes precedence if it exists
  if (fmlStats.exists) {
    return { path: fmlPath, type: 'fml', stats: fmlStats };
  } else if (jsStats.exists) {
    return { path: jsPath, type: 'js', stats: jsStats };
  }

  return null;
}

// === MAIN RENDER FUNCTION ===

/**
 * Enhanced renderPage with FML support, caching, hot reload, and streaming
 */
export async function renderPage(pageName, options = {}) {
  const timer = createTimer('RenderPage');

  try {
    // Validate input
    if (!pageName || typeof pageName !== 'string') {
      throw new Error('Page name must be a non-empty string');
    }

    // Find the page file
    const fileInfo = findPageFile(pageName);
    if (!fileInfo) {
      throw new Error(`Page not found: ${pageName} (checked .fml and .js files)`);
    }

    // Generate cache key
    const cacheKey = enableCaching
      ? renderCache.generateKey(pageName, options, fileInfo.stats)
      : null;

    // Try cache first
    if (enableCaching && cacheKey) {
      const cached = renderCache.get(cacheKey);
      if (cached) {
        timer.mark('Cache Hit');
        return cached;
      }
    }

    // Setup file watching for hot reload
    if (enableWatching) {
      fileWatcher.watch(fileInfo.path, (changedPath) => {
        const relativePath = path.relative(process.cwd(), changedPath);
        console.log(`🔄 File changed: ${relativePath}, invalidating cache`);
        renderCache.invalidate(pageName);
      });
    }

    // Render based on file type
    let html;
    if (fileInfo.type === 'fml') {
      html = await renderFMLPage(fileInfo.path, pageName, options, timer);
    } else {
      html = await renderJSPage(fileInfo.path, pageName, options, timer);
    }

    // Cache the result
    if (enableCaching && cacheKey && html) {
      renderCache.set(cacheKey, html, {
        pageName,
        type: fileInfo.type,
        renderTime: timer.mark('Render Complete')
      });
    }

    return html;

  } catch (error) {
    timer.mark('Error');

    // Track error stats
    if (fmlStats) {
      fmlStats.incrementError();
    }

    const errorBoundary = ErrorBoundary.create(error, {
      pageName,
      options,
      renderTime: timer.end()
    });

    return buildHtmlPage(pageName, errorBoundary.render(), null, 'error');
  }
}

// === FML RENDERING ===

async function renderFMLPage(fmlPath, pageName, options = {}, timer) {
  timer.mark('FML Start');

  try {
    // Read FML content
    const fmlContent = fs.readFileSync(fmlPath, 'utf-8');
    timer.mark('File Read');

    // Development validation
    if (isDevelopment) {
      await validateFMLInDevelopment(fmlContent, pageName, timer);
    }

    // Process FML content
    const renderedContent = await processFML(fmlContent, {
      mode: 'server',
      props: options,
      components: components,
      debug: isDevelopment,
      phase2: true
    });
    timer.mark('FML Processed');

    // Track performance
    const renderTime = timer.mark('Content Ready');
    if (fmlStats) {
      fmlStats.incrementRender(renderTime);
    }

    // Build final HTML
    const stylesheet = resolveStylesheetPath(pageName);
    const html = buildHtmlPage(pageName, renderedContent, stylesheet, 'fml');
    timer.mark('HTML Built');

    return html;

  } catch (error) {
    console.error(`FML render error for "${pageName}":`, error.message);

    const errorBoundary = ErrorBoundary.create(error, {
      pageName,
      type: 'fml',
      filePath: fmlPath
    });

    return buildHtmlPage(pageName, errorBoundary.render(), null, 'fml-error');
  }
}

async function validateFMLInDevelopment(fmlContent, pageName, timer) {
  try {
    const parser = new FMLParser({ debug: true, phase2: true });
    const ast = parser.parse(fmlContent);
    const validation = validateFML(ast, components, { strict: false, debug: true });

    timer.mark('FML Validated');

    if (validation.warnings.length > 0) {
      console.warn(`\nFML Warnings for ${pageName}.fml:`);
      validation.warnings.forEach(warning => {
        console.warn(`   • ${warning.message}`);
      });
    }

    if (validation.errors.length > 0) {
      console.error(`\nFML Errors for ${pageName}.fml:`);
      validation.errors.forEach(error => {
        console.error(`   • ${error.message}`);
      });
    }

    if (validation.isValid && validation.warnings.length === 0) {
      console.log(`✅ FML validation passed for ${pageName}.fml`);
    }

  } catch (error) {
    console.error(`FML validation failed for ${pageName}:`, error.message);
  }
}

// === JS RENDERING (LEGACY) ===

async function renderJSPage(jsPath, pageName, options = {}, timer) {
  timer.mark('JS Start');

  try {
    const pageFunction = await loadPageModule(jsPath);
    timer.mark('Module Loaded');

    const pageContent = pageFunction(options);
    timer.mark('Function Called');

    const renderedContent = replaceComponentPlaceholders(pageContent, pageName);
    timer.mark('Components Replaced');

    const stylesheet = resolveStylesheetPath(pageName);
    const html = buildHtmlPage(pageName, renderedContent, stylesheet, 'js');
    timer.mark('HTML Built');

    return html;

  } catch (error) {
    const errorBoundary = ErrorBoundary.create(error, {
      pageName,
      type: 'js',
      filePath: jsPath
    });

    return buildHtmlPage(pageName, errorBoundary.render(), null, 'js-error');
  }
}

async function loadPageModule(jsPath) {
  const pageUrl = pathToFileURL(jsPath).href + `?t=${Date.now()}`;
  const pageModule = await import(pageUrl);

  if (!pageModule.default || typeof pageModule.default !== 'function') {
    throw new Error(`Page module does not export a default function`);
  }

  return pageModule.default;
}

function replaceComponentPlaceholders(content, pageName) {
  if (typeof content !== 'string') return content;

  return content.replace(
    /<Component\s+name="(\w+)"(?:\s+props='([^']*)')?\s*\/>/g,
    (_, componentName, propsJson) => {
      try {
        const props = propsJson ? JSON.parse(propsJson) : {};
        const component = components[componentName];

        if (!component) {
          throw new Error(`Component "${componentName}" not found`);
        }

        const result = component(props);
        if (typeof result !== 'string') {
          throw new Error(`Component "${componentName}" did not return a string`);
        }
        return result;
      } catch (error) {
        console.error(`Error rendering component "${componentName}":`, error.message);

        const errorBoundary = ErrorBoundary.create(error, {
          componentName,
          pageName,
          props: propsJson
        });

        return errorBoundary.render();
      }
    }
  );
}

// === STREAMING SUPPORT — Memory-Efficient, Non-Blocking ===

export function renderPageStream(pageName, options = {}) {
  let fileInfo;
  let timer;

  return new Readable({
    async read(size) {
      try {
        if (!fileInfo) {
          timer = createTimer('StreamPage');
          fileInfo = findPageFile(pageName);

          if (!fileInfo) {
            throw new Error(`Page not found: ${pageName}`);
          }
        }

        if (fileInfo.type === 'fml') {
          await this.streamFMLPage(fileInfo.path, pageName, options, timer);
        } else {
          await this.streamJSPage(fileInfo.path, pageName, options, timer);
        }
      } catch (error) {
        console.error(`Error streaming page "${pageName}":`, error.message);

        const errorBoundary = ErrorBoundary.create(error, {
          pageName,
          streaming: true
        });

        this.push(buildHtmlPage(pageName, errorBoundary.render(), null, 'stream-error'));
        this.push(null);
      }
    },

    async streamFMLPage(fmlPath, pageName, options, timer) {
      const fmlContent = fs.readFileSync(fmlPath, 'utf-8');
      timer.mark('FML File Read');

      // Stream HTML head
      const stylesheet = resolveStylesheetPath(pageName);
      this.push(buildHtmlPageHead(pageName, stylesheet, 'fml-stream'));

      // Process and stream FML body
      const renderedContent = await processFML(fmlContent, {
        mode: 'server',
        props: options,
        components: components,
        debug: isDevelopment,
        phase2: true
      });

      timer.mark('FML Streamed');
      this.push(renderedContent);
      this.push(buildHtmlPageFooter());
      this.push(null);
    },

    async streamJSPage(jsPath, pageName, options, timer) {
      const pageFunction = await loadPageModule(jsPath);
      const pageContent = pageFunction(options);
      const renderedContent = replaceComponentPlaceholders(pageContent, pageName);
      timer.mark('JS Streamed');

      const stylesheet = resolveStylesheetPath(pageName);
      this.push(buildHtmlPage(pageName, renderedContent, stylesheet, 'js-stream'));
      this.push(null);
    }
  });
}

// === HTML BUILDING — Optimized Template Strings ===

function buildHtmlPage(title, bodyContent, stylesheet, renderType = 'unknown') {
  const devMeta = isDevelopment
    ? `\n        <!-- Rendered: ${renderType} | Time: ${new Date().toISOString()} -->`
    : '';

  const debugScript = isDevelopment
    ? `
    <script>
      if (window.location.hostname === 'localhost') {
        window.FML_DEBUG = {
          renderType: '${renderType}',
          cache: ${JSON.stringify(renderCache.getStats())},
          watcher: ${JSON.stringify(fileWatcher.getStats())},
          timestamp: '${new Date().toISOString()}'
        };
        console.log('🔧 FML Debug Info:', window.FML_DEBUG);
      }
    </script>
  `
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${stylesheet ? `<link rel="stylesheet" href="${stylesheet}">` : ''}
    <script defer src="/script.js"></script>
    <title>${escapeHtml(title)}</title>${devMeta}
  </head>
  <body>
    ${bodyContent}
    ${debugScript}
  </body>
</html>`;
}

function buildHtmlPageHead(title, stylesheet, renderType = 'stream') {
  const devMeta = isDevelopment
    ? `\n        <!-- Streaming: ${renderType} -->`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${stylesheet ? `<link rel="stylesheet" href="${stylesheet}">` : ''}
    <script defer src="/script.js"></script>
    <title>${escapeHtml(title)}</title>${devMeta}
  </head>
  <body>`;
}

function buildHtmlPageFooter() {
  return '</body></html>';
}

// === STYLESHEET RESOLUTION ===

function resolveStylesheetPath(pageName) {
  const stylesDir = path.resolve('./public/styles');
  const normalizedPageName = path.normalize(pageName).replace(/\\/g, '/');

  const possiblePaths = [
    path.join(stylesDir, `${normalizedPageName}.css`),
    path.join(stylesDir, `${path.basename(normalizedPageName)}.css`),
    path.join(stylesDir, 'global.css'),
  ];

  for (const stylesheetPath of possiblePaths) {
    if (fs.existsSync(stylesheetPath)) {
      const relativePath = path.relative(stylesDir, stylesheetPath).replace(/\\/g, '/');
      return `/styles/${relativePath}`;
    }
  }

  if (isDevelopment) {
    console.warn(`⚠️  No stylesheet found for page: ${pageName}`);
  }

  return null;
}

// === DEVELOPMENT UTILITIES ===

/**
 * Get comprehensive rendering statistics
 */
export function getRenderStats() {
  return {
    cache: renderCache.getStats(),
    watcher: fileWatcher.getStats(),
    fml: fmlStats ? fmlStats.getStats() : null,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    features: {
      caching: enableCaching,
      watching: enableWatching,
      fml: true,
      streaming: true
    }
  };
}

/**
 * Clear all caches and reset watchers
 */
export async function clearRenderCache() {
  const cleared = renderCache.clear();
  console.log(`Cleared ${cleared} cached entries`);

  if (fmlStats) {
    fmlStats.reset();
  }

  return cleared;
}

/**
 * Development debugging endpoints
 */
export function enableDebugMode() {
  if (!isDevelopment) {
    console.warn('Debug mode only available in development');
    return;
  }

  // Add global error handler
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection in FML:', reason);
    const boundary = ErrorBoundary.create(reason, {
      type: 'unhandled',
      promise: promise.toString()
    });
    console.error(boundary.render());
  });

  // Add uncaught exception handler
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception in FML:', error);
    const boundary = ErrorBoundary.create(error, { type: 'uncaught' });
    console.error(boundary.render());
  });

  console.log('🔧 FML Debug mode enabled');
}

/**
 * Graceful shutdown
 */
export function shutdown() {
  console.log('Shutting down renderPage system...');

  fileWatcher.unwatchAll();
  renderCache.clear();

  console.log('RenderPage system shutdown complete');
}

// Auto-enable debug mode in development
if (isDevelopment) {
  enableDebugMode();
}

// Cleanup on process exit
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);