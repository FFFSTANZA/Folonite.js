import express from 'express';
import compression from 'compression';
import { setupDynamicRouting } from './src/router.js';
import { registerComponents } from './src/views/registerComponents.js';
import { renderPage, renderPageStream } from './src/views/renderPage.js';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import os from 'os';
import { createServer } from 'http';

// Environment and configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

// Security and rate limiting
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = isDevelopment ? 1000 : 100; // requests per window
const requestCounts = new Map();

// Performance monitoring
let serverStats = {
  startTime: Date.now(),
  requests: 0,
  errors: 0,
  slowRequests: 0,
  averageResponseTime: 0,
  totalResponseTime: 0
};

// Create Express app with enhanced configuration
const app = express();

// Security headers middleware
function securityHeaders(req, res, next) {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (relaxed for development)
  const csp = isDevelopment 
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss:;"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;";
  res.setHeader('Content-Security-Policy', csp);
  
  // HSTS in production
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
}

// Rate limiting middleware
function rateLimiter(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Clean old entries
  for (const [ip, data] of requestCounts.entries()) {
    data.requests = data.requests.filter(time => time > windowStart);
    if (data.requests.length === 0) {
      requestCounts.delete(ip);
    }
  }
  
  // Check current IP
  if (!requestCounts.has(clientIP)) {
    requestCounts.set(clientIP, { requests: [] });
  }
  
  const clientData = requestCounts.get(clientIP);
  clientData.requests = clientData.requests.filter(time => time > windowStart);
  
  if (clientData.requests.length >= RATE_LIMIT_MAX) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Max ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW / 60000} minutes.`,
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
    return;
  }
  
  clientData.requests.push(now);
  next();
}

// Enhanced request logging with performance tracking
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const startTime = Date.now();
  
  // Sanitize URL for logging
  const sanitizedUrl = req.url.replace(/[<>]/g, '');
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const responseTime = Number(end - start) / 1000000; // Convert to milliseconds
    
    // Update server statistics
    serverStats.requests++;
    serverStats.totalResponseTime += responseTime;
    serverStats.averageResponseTime = serverStats.totalResponseTime / serverStats.requests;
    
    if (responseTime > 1000) {
      serverStats.slowRequests++;
    }
    
    if (res.statusCode >= 400) {
      serverStats.errors++;
    }
    
    // Enhanced logging with color coding
    const timestamp = new Date().toISOString();
    const method = req.method.padEnd(6);
    const status = res.statusCode;
    const time = responseTime.toFixed(2);
    
    let logLevel = 'INFO';
    if (status >= 500) logLevel = 'ERROR';
    else if (status >= 400) logLevel = 'WARN';
    else if (responseTime > 1000) logLevel = 'SLOW';
    
    console.log(`[${timestamp}] ${logLevel} ${method} ${sanitizedUrl} - ${status} - ${time}ms`);
    
    // Alert on suspicious activity
    if (responseTime > 5000) {
      console.warn(`ALERT: Very slow response detected: ${method} ${sanitizedUrl} - ${time}ms`);
    }
  });
  
  next();
}

// Input validation middleware
function validateInput(req, res, next) {
  // Validate and sanitize common inputs
  if (req.body) {
    try {
      // Prevent prototype pollution
      if (req.body.constructor !== Object) {
        return res.status(400).json({ error: 'Invalid request body structure' });
      }
      
      // Check for suspicious patterns
      const bodyStr = JSON.stringify(req.body);
      const suspiciousPatterns = [
        /<script[\s\S]*?>/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /__proto__/i,
        /prototype/i
      ];
      
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(bodyStr)) {
          console.warn(`Suspicious input detected from ${req.ip}: ${pattern}`);
          return res.status(400).json({ error: 'Invalid input detected' });
        }
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
  }
  
  next();
}

// Health check endpoint
function setupHealthCheck(app) {
  app.get('/health', (req, res) => {
    const uptime = Date.now() - serverStats.startTime;
    const memoryUsage = process.memoryUsage();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime / 1000),
      version: process.env.npm_package_version || '2.1.0',
      environment: process.env.NODE_ENV || 'development',
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      },
      performance: {
        totalRequests: serverStats.requests,
        errors: serverStats.errors,
        slowRequests: serverStats.slowRequests,
        averageResponseTime: Math.round(serverStats.averageResponseTime * 100) / 100,
        errorRate: serverStats.requests > 0 ? (serverStats.errors / serverStats.requests * 100).toFixed(2) + '%' : '0%'
      },
      features: {
        fmlSupport: true,
        compression: true,
        streaming: true,
        apiRoutes: true,
        componentSystem: true
      }
    };
    
    res.json(health);
  });
  
  // Metrics endpoint for monitoring
  app.get('/metrics', (req, res) => {
    if (!isDevelopment && req.get('Authorization') !== `Bearer ${process.env.METRICS_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({
      ...serverStats,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      systemInfo: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: os.uptime()
      }
    });
  });
}

// Enhanced error handling
function errorHandler(err, req, res, next) {
  serverStats.errors++;
  
  // Log error details
  const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  console.error(`[ERROR ${errorId}] ${err.stack}`);
  
  // Don't expose internal errors in production
  if (isProduction) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Something went wrong. Please try again later.',
      errorId: errorId,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      stack: err.stack,
      errorId: errorId,
      timestamp: new Date().toISOString()
    });
  }
}

// Enhanced 404 handler
function notFoundHandler(req, res) {
  const sanitizedUrl = req.url.replace(/[<>]/g, '');
  console.warn(`404 - Route not found: ${req.method} ${sanitizedUrl} from ${req.ip}`);
  
  const isApiRequest = req.url.startsWith('/api/');
  
  if (isApiRequest) {
    res.status(404).json({
      error: 'Not Found',
      message: `API endpoint ${req.method} ${req.url} not found`,
      availableEndpoints: ['/health', '/metrics', '/api/*']
    });
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>404 - Page Not Found</title>
          <style>
            body { font-family: system-ui, sans-serif; margin: 0; padding: 40px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #e74c3c; margin: 0 0 20px 0; }
            .error-code { font-size: 4rem; font-weight: bold; color: #95a5a6; margin: 0; }
            .back-link { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-code">404</div>
            <h1>Page Not Found</h1>
            <p>The page <code>${sanitizedUrl}</code> could not be found.</p>
            <p>This might be because:</p>
            <ul>
              <li>The page doesn't exist in <code>src/pages/</code></li>
              <li>The file extension is missing (.js or .fml)</li>
              <li>There's a typo in the URL</li>
            </ul>
            <a href="/" class="back-link">Go Home</a>
          </div>
        </body>
      </html>
    `);
  }
}

// Enhanced middleware and API loading with better error handling
async function loadMiddleware(app) {
  const middlewareDir = path.resolve('./backend/middleware');
  if (!fs.existsSync(middlewareDir)) {
    console.log('Middleware directory not found. Skipping middleware integration.');
    return;
  }

  try {
    const files = fs.readdirSync(middlewareDir);
    let loadedCount = 0;
    
    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const middlewarePath = path.join(middlewareDir, file);
          const module = await import(pathToFileURL(middlewarePath).href);
          const middleware = module.default;
          
          if (typeof middleware !== 'function') {
            console.warn(`Middleware ${file} does not export a function. Skipping.`);
            continue;
          }
          
          app.use(middleware);
          console.log(`Loaded middleware: ${file}`);
          loadedCount++;
        } catch (err) {
          console.error(`Failed to load middleware ${file}:`, err.message);
        }
      }
    }
    
    console.log(`Middleware loading complete: ${loadedCount} middleware(s) loaded`);
  } catch (err) {
    console.error('Error reading middleware directory:', err.message);
  }
}

async function loadAPIs(app) {
  const apiDir = path.resolve('./src/api');
  if (!fs.existsSync(apiDir)) {
    console.log('API directory not found. Skipping API integration.');
    return;
  }

  try {
    const files = fs.readdirSync(apiDir);
    let loadedCount = 0;
    
    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const apiPath = path.join(apiDir, file);
          const module = await import(pathToFileURL(apiPath).href);
          const apiModule = module.default;
          
          if (!apiModule || !apiModule.route || !apiModule.handler) {
            console.warn(`API ${file} invalid format. Expected { route, handler }. Skipping.`);
            continue;
          }
          
          if (typeof apiModule.handler !== 'function') {
            console.warn(`API ${file} handler is not a function. Skipping.`);
            continue;
          }
          
          // Validate route format
          if (!apiModule.route.startsWith('/')) {
            console.warn(`API ${file} route must start with '/'. Skipping.`);
            continue;
          }
          
          app.use(apiModule.route, apiModule.handler);
          console.log(`Loaded API route: ${apiModule.route} from ${file}`);
          loadedCount++;
        } catch (err) {
          console.error(`Failed to load API ${file}:`, err.message);
        }
      }
    }
    
    console.log(`API loading complete: ${loadedCount} API route(s) loaded`);
  } catch (err) {
    console.error('Error reading API directory:', err.message);
  }
}

// Enhanced system monitoring
function setupSystemMonitoring() {
  const MONITOR_INTERVAL = isDevelopment ? 30000 : 300000; // 30s dev, 5m prod
  
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const usedMemory = memoryUsage.heapUsed / 1024 / 1024;
    const totalMemory = os.totalmem() / 1024 / 1024;
    const freeMemory = os.freemem() / 1024 / 1024;
    const cpuLoad = os.loadavg();
    const uptime = Math.floor((Date.now() - serverStats.startTime) / 1000);
    
    // Memory warning thresholds
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    if (memoryUsagePercent > 80) {
      console.warn(`HIGH MEMORY USAGE: ${memoryUsagePercent.toFixed(1)}% (${usedMemory.toFixed(2)} MB)`);
    }
    
    // CPU warning thresholds
    if (cpuLoad[0] > os.cpus().length * 0.8) {
      console.warn(`HIGH CPU LOAD: ${cpuLoad[0].toFixed(2)} (cores: ${os.cpus().length})`);
    }
    
    console.log(`SYSTEM: Memory ${usedMemory.toFixed(2)}MB/${totalMemory.toFixed(2)}MB, ` +
                `Free ${freeMemory.toFixed(2)}MB, CPU ${cpuLoad[0].toFixed(2)}, ` +
                `Uptime ${uptime}s, Requests ${serverStats.requests}`);
  }, MONITOR_INTERVAL);
}

// Graceful shutdown handler
function setupGracefulShutdown(server) {
  const signals = ['SIGTERM', 'SIGINT'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      console.log(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(() => {
        console.log('HTTP server closed.');
        
        // Close any database connections, etc.
        console.log('Graceful shutdown complete.');
        process.exit(0);
      });
      
      // Force close after 30 seconds
      setTimeout(() => {
        console.log('Forcing shutdown after timeout.');
        process.exit(1);
      }, 30000);
    });
  });
  
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    console.log('Shutting down due to uncaught exception.');
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.log('Shutting down due to unhandled promise rejection.');
    process.exit(1);
  });
}

// Apply middleware in correct order
app.set('trust proxy', 1); // Trust first proxy for rate limiting
app.use(securityHeaders);
app.use(rateLimiter);
app.use(compression());
app.use(express.static('public', {
  maxAge: isProduction ? '1d' : '0',
  etag: true,
  lastModified: true
}));
app.use(requestLogger);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(validateInput);

// Setup health check and metrics
setupHealthCheck(app);

// Enhanced page rendering with better FML support
app.get('*', async (req, res, next) => {
  try {
    const page = req.path === '/' ? 'home' : req.path.substring(1);
    const useStreaming = req.query.stream === 'true';
    
    // Validate page name
    if (!/^[a-zA-Z0-9/_-]*$/.test(page)) {
      return res.status(400).json({
        error: 'Invalid page name',
        message: 'Page names can only contain letters, numbers, slashes, hyphens, and underscores'
      });
    }
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    
    if (useStreaming) {
      console.log(`Streaming page: ${page}`);
      const stream = renderPageStream(page, { ...req.query, development: isDevelopment });
      
      res.write('<!DOCTYPE html>');
      stream.pipe(res, { end: false });
      
      stream.on('end', () => {
        res.end();
      });
      
      stream.on('error', (err) => {
        console.error(`Streaming error for page ${page}:`, err);
        if (!res.headersSent) {
          res.status(500).send(`
            <!DOCTYPE html>
            <html><head><title>Streaming Error</title></head>
            <body><h1>Streaming Error</h1><p>Failed to stream page content.</p></body></html>
          `);
        }
      });
    } else {
      console.log(`Rendering page: ${page}`);
      const html = await renderPage(page, { ...req.query, development: isDevelopment });
      res.send(html);
    }
  } catch (err) {
    next(err);
  }
});

// Apply error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize server
async function startServer() {
  try {
    console.log('Initializing Folonite.js server...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Node.js version: ${process.version}`);
    
    // Register components with enhanced options
    await registerComponents(isDevelopment, {
      watchMode: isDevelopment,
      validateComponents: isDevelopment,
      allowFML: true
    });
    console.log('Components registered successfully with FML support');
    
    // Load middleware and APIs
    await loadMiddleware(app);
    await loadAPIs(app);
    
    // Start system monitoring
    setupSystemMonitoring();
    
    // Create and start server
    const server = createServer(app);
    setupGracefulShutdown(server);
    
    server.listen(port, host, () => {
      console.log('='.repeat(50));
      console.log(`Folonite.js Server Started Successfully`);
      console.log(`URL: http://${host}:${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`FML Support: Enabled`);
      console.log(`Health Check: http://${host}:${port}/health`);
      if (isDevelopment) {
        console.log(`Metrics: http://${host}:${port}/metrics`);
        console.log(`Hot Reload: Enabled for FML and components`);
      }
      console.log('='.repeat(50));
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();