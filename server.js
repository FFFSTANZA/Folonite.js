import express from 'express';
import compression from 'compression';
import { registerComponents } from './src/views/registerComponents.js';
import { renderPage, renderPageStream } from './src/views/renderPage.js';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

const app = express();
const isDev = process.env.NODE_ENV === 'development';
const port = process.env.PORT || 3000;

// Server instance for proper cleanup
let server = null;

// Performance tracking
const stats = { requests: 0, errors: 0, fmlRequests: 0 };

// ASCII Art Banner
function displayBanner() {
  const c = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
  };

  const banner = `
${c.cyan}${c.bright}
    ███████╗ ██████╗ ██╗      ██████╗ ███╗   ██╗██╗████████╗███████╗
    ██╔════╝██╔═══██╗██║     ██╔═══██╗████╗  ██║██║╚══██╔══╝██╔════╝
    █████╗  ██║   ██║██║     ██║   ██║██╔██╗ ██║██║   ██║   █████╗  
    ██╔══╝  ██║   ██║██║     ██║   ██║██║╚██╗██║██║   ██║   ██╔══╝  
    ██║     ╚██████╔╝███████╗╚██████╔╝██║ ╚████║██║   ██║   ███████╗
    ╚═╝      ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝   ╚══════╝${c.reset}
${c.gray}    ┌─────────────────────────────────────────────────────────────┐${c.reset}
${c.gray}    │${c.reset}  ${c.magenta}${c.bright}Modern JavaScript Framework${c.reset}                   ${c.dim}v3.0${c.reset}      ${c.gray}│${c.reset}
${c.gray}    └─────────────────────────────────────────────────────────────┘${c.reset}
`;

  console.log(banner);
}

function displayServerInfo(port, isDev) {
  const c = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    blue: '\x1b[34m'
  };

  console.log(`${c.gray}    ╔═════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.gray}    ║${c.reset}  ${c.bright}SERVER INFORMATION${c.reset}                                          ${c.gray}║${c.reset}`);
  console.log(`${c.gray}    ╠═════════════════════════════════════════════════════════════╣${c.reset}`);
  console.log(`${c.gray}    ║${c.reset}                                                             ${c.gray}║${c.reset}`);
  console.log(`${c.gray}    ║${c.reset}  ${c.dim}Local:${c.reset}        ${c.cyan}${c.bright}http://localhost:${port}${c.reset}                     ${c.gray}║${c.reset}`);
  console.log(`${c.gray}    ║${c.reset}  ${c.dim}Network:${c.reset}      ${c.gray}http://0.0.0.0:${port}${c.reset}                        ${c.gray}║${c.reset}`);
  console.log(`${c.gray}    ║${c.reset}                                                             ${c.gray}║${c.reset}`);
  console.log(`${c.gray}    ╠═════════════════════════════════════════════════════════════╣${c.reset}`);
  console.log(`${c.gray}    ║${c.reset}  ${c.dim}Environment:${c.reset}  ${c.yellow}${process.env.NODE_ENV || 'development'}${c.reset}${' '.repeat(33 - (process.env.NODE_ENV || 'development').length)}${c.gray}║${c.reset}`);
  console.log(`${c.gray}    ║${c.reset}  ${c.dim}FML Support:${c.reset}  ${c.green}Enabled${c.reset}                                     ${c.gray}║${c.reset}`);
  console.log(`${c.gray}    ║${c.reset}  ${c.dim}Health:${c.reset}       ${c.blue}/health${c.reset}                                     ${c.gray}║${c.reset}`);
  if (isDev) {
    console.log(`${c.gray}    ║${c.reset}  ${c.dim}Debug:${c.reset}        ${c.blue}/debug/fml${c.reset}                                 ${c.gray}║${c.reset}`);
  }
  console.log(`${c.gray}    ║${c.reset}                                                             ${c.gray}║${c.reset}`);
  console.log(`${c.gray}    ╚═════════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(`${c.dim}
    Ready to serve requests. Press Ctrl+C to stop.${c.reset}
`);
}

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (!isDev) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// Request logging and stats
app.use((req, res, next) => {
  const start = Date.now();
  stats.requests++;
  
  res.on('finish', () => {
    const time = Date.now() - start;
    if (res.statusCode >= 400) stats.errors++;
    if (req.path.includes('fml') || res.getHeader('X-Rendered-By') === 'FML') {
      stats.fmlRequests++;
    }
    
    if (isDev || time > 500 || res.statusCode >= 400) {
      console.log(`${req.method} ${req.path} - ${res.statusCode} - ${time}ms`);
    }
  });
  next();
});

// Core middleware
app.use(compression());
app.use(express.static('public', { maxAge: isDev ? 0 : '1d' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    requests: stats.requests,
    errors: stats.errors,
    fmlRequests: stats.fmlRequests,
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    fmlSupport: true
  });
});

// Debug endpoints (dev only)
if (isDev) {
  app.get('/debug/fml', async (req, res) => {
    try {
      const { getRenderStats } = await import('./src/views/renderPage.js');
      const { getRegistrationStats } = await import('./src/views/registerComponents.js');
      
      res.json({
        render: getRenderStats(),
        components: getRegistrationStats(),
        server: stats
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// Auto-load API routes
async function loadAPIs() {
  const apiDir = './src/api';
  if (!fs.existsSync(apiDir)) return;

  const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
  
  for (const file of files) {
    try {
      const apiPath = path.join(apiDir, file);
      const { default: api } = await import(pathToFileURL(path.resolve(apiPath)).href);
      
      if (api?.route && api?.handler) {
        app.use(api.route, api.handler);
        console.log(`API loaded: ${api.route}`);
      }
    } catch (err) {
      console.warn(`Failed to load API ${file}:`, err.message);
    }
  }
}

// Register wildcard route AFTER APIs are loaded
function registerPageRenderer() {
  // Main page renderer
  app.get('*', async (req, res, next) => {
    try {
      const page = req.path === '/' ? 'home' : req.path.substring(1);
      
      if (!/^[a-zA-Z0-9/_-]*$/.test(page)) {
        return res.status(400).json({ error: 'Invalid page name' });
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      if (req.query.stream === 'true') {
        const stream = renderPageStream(page, { ...req.query, development: isDev });
        res.write('<!DOCTYPE html>');
        stream.pipe(res, { end: false });
        stream.on('end', () => res.end());
        stream.on('error', next);
      } else {
        const html = await renderPage(page, { ...req.query, development: isDev });
        res.send(html);
      }
    } catch (err) {
      next(err);
    }
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).send(`
      <!DOCTYPE html>
      <html><head><title>404 - Page Not Found</title></head>
      <body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h1>404 - Page Not Found</h1>
        <p>The page <code>${req.path}</code> could not be found.</p>
        <p><strong>FML Support:</strong> Create <code>.fml</code> or <code>.js</code> files in <code>src/pages/</code></p>
        <a href="/">Back to Home</a>
        ${isDev ? '<a href="/debug/fml" style="margin-left: 20px;">FML Debug</a>' : ''}
      </body></html>
    `);
  });

  // Error handler
  app.use((err, req, res, next) => {
    stats.errors++;
    console.error('Error:', err.message);
    
    const isFMLError = err.message?.includes('FML');
    
    res.status(500).json({
      error: isDev ? err.message : 'Internal Server Error',
      fmlError: isFMLError,
      stack: isDev ? err.stack : undefined
    });
  });
}

// Graceful shutdown handler
async function shutdown(signal) {
  console.log(`\nReceived ${signal}, starting graceful shutdown...`);
  
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');
      
      // Cleanup operations
      try {
        // Import and call cleanup functions
        const { shutdown: shutdownRegistry } = await import('./src/views/registerComponents.js');
        const { shutdown: shutdownRender } = await import('./src/views/renderPage.js');
        
        if (typeof shutdownRegistry === 'function') {
          await shutdownRegistry();
        }
        if (typeof shutdownRender === 'function') {
          await shutdownRender();
        }
        
        console.log('Cleanup completed successfully');
        process.exit(0);
      } catch (err) {
        console.error('Error during cleanup:', err.message);
        process.exit(1);
      }
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// Start server
async function start() {
  try {
    // Display banner
    displayBanner();
    
    console.log('    Starting Folonite.js server...\n');
    
    // Register components with FML support
    await registerComponents(isDev, {
      allowFML: true,
      watchMode: isDev,
      validateComponents: isDev
    });
    
    // Load API routes FIRST
    await loadAPIs();
    
    // Register wildcard page renderer AFTER APIs
    registerPageRenderer();
    
    // Start listening
    server = app.listen(port, () => {
      console.log('');
      displayServerInfo(port, isDev);
    });
    
    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
        console.error('Try one of these solutions:');
        console.error(`  1. Kill the process using port ${port}: lsof -ti:${port} | xargs kill -9`);
        console.error(`  2. Use a different port: PORT=3001 npm start`);
        console.error(`  3. Wait a moment and try again`);
      } else {
        console.error('Server error:', err);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();