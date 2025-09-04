import express from 'express';
import { renderPage, renderPageStream } from './views/renderPage.js';
import compression from 'compression';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('*', async (req, res) => {
  const page = req.path === '/' ? 'home' : req.path.substring(1);
  const useStreaming = req.query.stream === 'true';

  res.setHeader('Content-Type', 'text/html');

  if (useStreaming) {
    const stream = renderPageStream(page);

    res.write(`<html><head><title>Streaming ${page}</title><link rel="stylesheet" href="/styles.css"><script defer src="/script.js"></script></head><body>`);
    stream.pipe(res, { end: false });

    stream.on('end', () => {
      res.write('</body></html>');
      res.end();
    });

    stream.on('error', (err) => {
      console.error(`Streaming error for page "${page}":`, err);
      if (!res.headersSent) {
        res.status(500).send('Something went wrong while streaming.');
      }
    });
  } else {
    try {
      const html = await renderPage(page);
      res.send(`<html><head><title>${page}</title><link rel="stylesheet" href="/styles.css"><script defer src="/script.js"></script></head><body>${html}</body></html>`);
    } catch (err) {
      console.error(`Error rendering page "${page}":`, err);
      res.status(404).send(`<html><head><title>404 - Page Not Found</title></head><body><h1>404 - Page Not Found</h1><p>The requested page "${page}" could not be found.</p></body></html>`);
    }
  }
});

app.use((req, res) => {
  res.status(404).send(`<html><head><title>404 - Not Found</title></head><body><h1>404 - Not Found</h1><p>The page you requested does not exist.</p></body></html>`);
});

app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).send(`<html><head><title>500 - Internal Server Error</title></head><body><h1>500 - Internal Server Error</h1><p>Something went wrong. Please try again later.</p></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
