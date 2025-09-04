// src/views/renderPage.js
import path from 'path';
import { Readable } from 'stream';
import { pathToFileURL } from 'url';
import fs from 'fs';
import { components } from './registerComponents.js';

// FML Integration
import { processFML } from '../fml/index.js';
import { validateFML } from '../fml/parser/validator.js';
import { FMLParser } from '../fml/parser/parser.js';
import { 
  getCachedTemplate, 
  cacheTemplate, 
  generateCacheKey, 
  fmlStats,
  clearTemplateCache 
} from '../fml/utils/helpers.js'; 

/**
 * Enhanced renderPage with automatic FML detection
 * Maintains 100% backward compatibility with existing .js pages
 */
export async function renderPage(pageName, options = {}) {
  try {
    // Check for FML file first, then fallback to JS
    const fmlPath = path.resolve(`./src/pages/${pageName}.fml`);
    const jsPath = path.resolve(`./src/pages/${pageName}.js`);
    
    if (fs.existsSync(fmlPath)) {
      // 🆕 FML Rendering Path
      return await renderFMLPage(fmlPath, pageName, options);
    } else if (fs.existsSync(jsPath)) {
      // 📄 Legacy JS Rendering Path (unchanged)
      return await renderJSPage(pageName, options);
    } else {
      throw new Error(`Page not found: ${pageName} (checked .fml and .js)`);
    }
  } catch (error) {
    console.error(`Error rendering page "${pageName}":`, error);
    return buildErrorPage(pageName, error.message);
  }
}

/**
 * 🆕 FML Page Rendering
 */
async function renderFMLPage(fmlPath, pageName, options = {}) {
  const startTime = Date.now();
  
  try {
    // Read FML content
    const fmlContent = fs.readFileSync(fmlPath, 'utf-8');
    
    // Development validation
    if (process.env.NODE_ENV === 'development') {
      await validateFMLInDevelopment(fmlContent, pageName);
    }
    
    // Check cache in production
    let renderedContent;
    if (process.env.NODE_ENV === 'production') {
      const cacheKey = generateCacheKey(fmlContent, components);
      const cached = getCachedTemplate(cacheKey);
      
      if (cached) {
        fmlStats.incrementCacheHit();
        renderedContent = cached.content;
      } else {
        fmlStats.incrementCacheMiss();
        renderedContent = await processFMLContent(fmlContent, options);
        cacheTemplate(cacheKey, { content: renderedContent, timestamp: Date.now() });
      }
    } else {
      // Development - always fresh render
      renderedContent = await processFMLContent(fmlContent, options);
    }
    
    // Track performance
    const renderTime = Date.now() - startTime;
    fmlStats.incrementRender(renderTime);
    
    // Build final HTML with CSS
    const stylesheet = resolveStylesheetPath(pageName);
    return buildHtmlPage(pageName, renderedContent, stylesheet, 'fml');
    
  } catch (error) {
    fmlStats.incrementError();
    console.error(`FML render error for "${pageName}":`, error);
    return buildErrorPage(pageName, `FML Error: ${error.message}`, 'fml');
  }
}

/**
 * Process FML content to HTML
 */
async function processFMLContent(fmlContent, options) {
  return await processFML(fmlContent, {
    mode: 'server',
    props: options,
    components: components, // Use registered Folonite components
    debug: process.env.NODE_ENV === 'development'
  });
}

/**
 * Development-time FML validation
 */
async function validateFMLInDevelopment(fmlContent, pageName) {
  try {
    const parser = new FMLParser({ debug: true });
    const ast = parser.parse(fmlContent);
    const validation = validateFML(ast, components, { strict: false, debug: true });
    
    if (validation.warnings.length > 0) {
      console.warn(`\n⚠️  FML Warnings for ${pageName}.fml:`);
      validation.warnings.forEach(warning => {
        console.warn(`   • ${warning.message}`);
      });
    }
    
    if (validation.errors.length > 0) {
      console.error(`\n❌ FML Errors for ${pageName}.fml:`);
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

/**
 * 📄 Legacy JS Page Rendering (unchanged behavior)
 */
async function renderJSPage(pageName, options = {}) {
  const pageFunction = await loadPageModule(pageName);
  const pageContent = pageFunction(options);
  const renderedContent = replaceComponentPlaceholders(pageContent, pageName);
  const stylesheet = resolveStylesheetPath(pageName);
  
  return buildHtmlPage(pageName, renderedContent, stylesheet, 'js');
}

/**
 * Enhanced streaming with FML support
 */
export function renderPageStream(pageName, options = {}) {
  return new Readable({
    async read() {
      try {
        const fmlPath = path.resolve(`./src/pages/${pageName}.fml`);
        const jsPath = path.resolve(`./src/pages/${pageName}.js`);
        
        if (fs.existsSync(fmlPath)) {
          // 🆕 FML Streaming
          await this.streamFMLPage(fmlPath, pageName, options);
        } else if (fs.existsSync(jsPath)) {
          // 📄 Legacy JS Streaming
          await this.streamJSPage(pageName, options);
        } else {
          throw new Error(`Page not found: ${pageName}`);
        }
      } catch (error) {
        console.error(`Error streaming page "${pageName}":`, error);
        this.push(buildErrorPage(pageName, error.message));
        this.push(null);
      }
    },
    
    // FML streaming method
    async streamFMLPage(fmlPath, pageName, options) {
      const fmlContent = fs.readFileSync(fmlPath, 'utf-8');
      
      // Stream HTML head
      const stylesheet = resolveStylesheetPath(pageName);
      this.push(buildHtmlPageHead(pageName, stylesheet));
      
      // Process and stream FML body
      const renderedContent = await processFMLContent(fmlContent, options);
      this.push(renderedContent);
      
      // Stream closing tags
      this.push(buildHtmlPageFooter());
      this.push(null);
    },
    
    // Legacy JS streaming method (unchanged)
    async streamJSPage(pageName, options) {
      const pageFunction = await loadPageModule(pageName);
      const pageContent = pageFunction(options);
      const renderedContent = replaceComponentPlaceholders(pageContent, pageName);
      const stylesheet = resolveStylesheetPath(pageName);
      
      this.push(buildHtmlPage(pageName, renderedContent, stylesheet, 'js'));
      this.push(null);
    }
  });
}

// ========================================
// UNCHANGED LEGACY FUNCTIONS
// ========================================

async function loadPageModule(pageName) {
  const pagePath = path.resolve(`./src/pages/${pageName}.js`);
  const pageUrl = pathToFileURL(pagePath).href;
  const pageModule = await import(pageUrl);
  if (!pageModule.default) {
    throw new Error(`Page module "${pageName}" does not export a default function.`);
  }
  return pageModule.default;
}

function replaceComponentPlaceholders(content, pageName) {
  return content.replace(/<Component\s+name="(\w+)"(?:\s+props='([^']*)')?\s*\/>/g, (_, componentName, propsJson) => {
    try {
      const props = propsJson ? JSON.parse(propsJson) : {};
      const component = components[componentName];
      if (!component) {
        throw new Error(`Component "${componentName}" not found`);
      }
      return component(props);
    } catch (error) {
      console.error(`Error rendering component "${componentName}" on page "${pageName}":`, error);
      return `<p>Error rendering component "${componentName}"</p>`;
    }
  });
}

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
      return `/styles/${path.relative(stylesDir, stylesheetPath).replace(/\\/g, '/')}`;
    }
  }

  console.warn(`Stylesheet not found for page: ${pageName}`);
  return null;
}

// ========================================
// ENHANCED HTML BUILDING FUNCTIONS
// ========================================

function buildHtmlPage(title, bodyContent, stylesheet, renderType = 'unknown') {
  const devMeta = process.env.NODE_ENV === 'development' 
    ? `\n        <!-- Rendered with: ${renderType.toUpperCase()} -->\n        <!-- FML Stats: ${JSON.stringify(fmlStats.getStats())} -->`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${stylesheet ? `<link rel="stylesheet" href="${stylesheet}">` : ''}
        <script defer src="/script.js"></script>
        <title>${title}</title>${devMeta}
      </head>
      <body>${bodyContent}</body>
    </html>
  `;
}

function buildHtmlPageHead(title, stylesheet) {
  const devMeta = process.env.NODE_ENV === 'development' 
    ? '\n        <!-- Streaming FML Content -->' : '';
    
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${stylesheet ? `<link rel="stylesheet" href="${stylesheet}">` : ''}
        <script defer src="/script.js"></script>
        <title>${title}</title>${devMeta}
      </head>
      <body>
  `;
}

function buildHtmlPageFooter() {
  return '</body></html>';
}

function buildErrorPage(pageName, errorMessage, renderType = 'unknown') {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Error - ${pageName}</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 40px; background: #f9f9f9; }
          .error-container { max-width: 600px; margin: 0 auto; }
          .error { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; }
          .error h1 { color: #c33; margin: 0 0 10px 0; }
          .error p { margin: 10px 0; }
          .error-meta { background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px; margin-top: 15px; }
          .back-link { display: inline-block; margin-top: 15px; color: #2563eb; text-decoration: none; }
          .back-link:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error">
            <h1>❌ Error loading page: ${pageName}</h1>
            <p><strong>Error:</strong> ${errorMessage}</p>
            ${isDevelopment ? `
              <div class="error-meta">
                <strong>Debug Info:</strong><br>
                Render Type: ${renderType.toUpperCase()}<br>
                Environment: ${process.env.NODE_ENV}<br>
                Time: ${new Date().toISOString()}<br>
                Available Files: Check src/pages/ directory
              </div>
            ` : ''}
            <a href="/" class="back-link">← Back to Home</a>
          </div>
        </div>
      </body>
    </html>
  `;
}

// ========================================
// DEVELOPMENT UTILITIES
// ========================================

/**
 * Get rendering statistics (development only)
 */
export function getRenderStats() {
  if (process.env.NODE_ENV !== 'development') {
    return { message: 'Stats only available in development' };
  }
  
  return {
    fml: fmlStats.getStats(),
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
}

export async function clearRenderCache() {
  await clearTemplateCache(); 
  console.log('🧹 FML template cache cleared');
}