import express from 'express';
import { renderPage, renderPageStream } from './views/renderPage.js';
import compression from 'compression';

const app = express();
app.use(compression()); // Enable compression middleware

// Unified route handler for both SSR and Streaming
app.get('*', async (req, res) => {
  const page = req.path === '/' ? 'home' : req.path.substring(1);

  // Check if streaming is enabled or fallback to basic SSR
  const useStreaming = req.query.stream === 'true'; // You can enable streaming via query param

  res.setHeader('Content-Type', 'text/html');
  res.write('<html><head><title>Loading...</title></head><body>');

  try {
    if (useStreaming) {
      const stream = renderPageStream(page);
      stream.pipe(res); 
    } else {
      const html = await renderPage(page);
      res.write(html); 
    }
  } catch (err) {
    res.status(404).send('Page not found');
  }

  res.write('</body></html>');
  res.end();
});

app.listen(3000, () => console.log('Folonite.js running on http://localhost:3000'));
