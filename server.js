import express from 'express';
import compression from 'compression';
import { setupDynamicRouting } from './src/router.js';
import { registerComponents } from './src/views/registerComponents.js';
import { renderPage, renderPageStream } from './src/views/renderPage.js';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import os from 'os';

const app = express();
const port = process.env.PORT || 3000;

app.use(compression());
app.use(express.static('public'));


app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const end = process.hrtime.bigint();
        const diff = (end - start) / 1000000n; 
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} - Response time: ${diff} ms`);
        // Log if response time is greater than a threshold (e.g., 1000 ms)
        if (diff > 1000) {
            console.warn(`Slow response detected: ${req.method} ${req.url} - ${diff} ms`);
        }
    });
    next();
});


setInterval(() => {
    const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024; 
    const totalMemory = os.totalmem() / 1024 / 1024; 
    const freeMemory = os.freemem() / 1024 / 1024; 
    const cpuLoad = os.loadavg(); 
    console.log(`Health Check -> Memory Used: ${usedMemory.toFixed(2)} MB, Total Memory: ${totalMemory.toFixed(2)} MB, Free Memory: ${freeMemory.toFixed(2)} MB, CPU Load: ${cpuLoad[0].toFixed(2)}, ${cpuLoad[1].toFixed(2)}, ${cpuLoad[2].toFixed(2)}`);
}, 150000); // Log every 5 seconds

app.use(express.json());

async function loadMiddleware(app) {
    const middlewareDir = path.resolve('./backend/middleware');
    if (fs.existsSync(middlewareDir)) {
        const files = fs.readdirSync(middlewareDir);
        for (const file of files) {
            if (file.endsWith('.js')) {
                try {
                    const middlewarePath = path.join(middlewareDir, file);
                    const middleware = await import(pathToFileURL(middlewarePath).href).then(module => module.default);
                    console.log(`Registering middleware: ${file}`);
                    app.use(middleware);
                } catch (err) {
                    console.error(`Error loading middleware from ${file}:`, err);
                }
            }
        }
    } else {
        console.warn('Middleware directory not found. Skipping middleware integration.');
    }
}

async function loadAPIs(app) {
    const apiDir = path.resolve('./src/api');
    if (fs.existsSync(apiDir)) {
        const files = fs.readdirSync(apiDir);
        for (const file of files) {
            if (file.endsWith('.js')) {
                try {
                    const apiPath = path.join(apiDir, file);
                    const apiModule = await import(pathToFileURL(apiPath).href).then(module => module.default);
                    if (apiModule && apiModule.route && apiModule.handler) {
                        console.log(`Registering API route: ${apiModule.route}`);
                        app.use(apiModule.route, apiModule.handler);
                    } else {
                        console.warn(`Invalid API definition in ${file}. Expected { route, handler } structure.`);
                    }
                } catch (err) {
                    console.error(`Error loading API from ${file}:`, err);
                }
            }
        }
    } else {
        console.warn('API directory not found. Skipping API integration.');
    }
}

(async () => {
    try {
        await registerComponents();
        console.log('Components registered successfully');
        await loadMiddleware(app);
        await loadAPIs(app);
    } catch (error) {
        console.error('Error during setup:', error);
    }
})();

app.get('*', async (req, res) => {
    const page = req.path === '/' ? 'home' : req.path.substring(1);
    const useStreaming = req.query.stream === 'true';
    res.setHeader('Content-Type', 'text/html');
    try {
        if (useStreaming) {
            const stream = renderPageStream(page);
            res.write('<html><head><title>Streaming...</title></head><body>');
            stream.pipe(res, { end: false });
            stream.on('end', () => {
                res.write(`<script>document.title = "Page Loaded";</script></body></html>`);
                res.end();
            });
            stream.on('error', (err) => {
                console.error('Streaming error:', err);
                if (!res.headersSent) {
                    res.status(500).send('Error during streaming.');
                }
            });
        } else {
            const html = await renderPage(page);
            res.send(html);
        }
    } catch (err) {
        console.error('Error rendering page:', err);
        if (!res.headersSent) {
            res.status(404).send('<html><head><title>404 Not Found</title></head><body><h1>404 - Page Not Found</h1></body></html>');
        }
    }
});

app.use((req, res) => {
    console.warn(`Undefined route accessed: ${req.url}`);
    res.status(404).send('<html><head><title>404 Not Found</title></head><body><h1>404 - Page Not Found</h1></body></html>');
});

app.use((err, req, res, next) => {
    console.error('Global error handler:', err.stack);
    res.status(500).send('Something went wrong!');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


