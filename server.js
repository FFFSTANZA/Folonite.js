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

// Performance tracking
const stats = { requests: 0, errors: 0, fmlRequests: 0 };

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (!isDev) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// Request logging & stats
app.use((req, res, next) => {
  const start = Date.now();
  stats.requests++;
  
  res.on('finish', () => {
    const time = Date.now() - start;
    if (res.statusCode >= 400) stats.errors++;
    if (req.path.includes('fml') || res.getHeader('X-Rendered-By') === 'FML') stats.fmlRequests++;
    
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

// FML debug endpoints (dev only)
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

// Main page renderer - handles both .js and .fml files
app.get('*', async (req, res, next) => {
  try {
    const page = req.path === '/' ? 'home' : req.path.substring(1);
    
    // Basic validation
    if (!/^[a-zA-Z0-9/_-]*$/.test(page)) {
      return res.status(400).json({ error: 'Invalid page name' });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (req.query.stream === 'true') {
      // Streaming mode
      const stream = renderPageStream(page, { ...req.query, development: isDev });
      res.write('<!DOCTYPE html>');
      stream.pipe(res, { end: false });
      stream.on('end', () => res.end());
      stream.on('error', next);
    } else {
      // Regular rendering - auto-detects .fml or .js
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
      <a href="/">← Home</a>
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

// Start server
async function start() {
  try {
    console.log('Starting Folonite.js server...');
    
    // Register components with FML support
    await registerComponents(isDev, {
      allowFML: true,
      watchMode: isDev,
      validateComponents: isDev
    });
    
    // Load API routes
    await loadAPIs();
    
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`FML Support: Enabled`);
      console.log(`Health Check: /health`);
      if (isDev) console.log(`FML Debug: /debug/fml`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();