import express from 'express';
import compression from 'compression';
import { setupDynamicRouting } from './src/router.js';
import { registerComponents } from './src/views/registerComponents.js';
import { renderPage, renderPageStream } from './src/views/renderPage.js';
import { getProducts, createProduct } from './src/api/products.js';

const app = express();
const port = process.env.PORT || 3000;

// Middleware for compression
app.use(compression());

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Register all components before starting the server
(async () => {
  try {
    await registerComponents();
    console.log('Components registered successfully');
  } catch (error) {
    console.error('Error registering components:', error);
  }
})();

app.use(express.json()); // Middleware for parsing JSON request bodies

// API routes for handling product operations
app.get('/api/products', getProducts); // Fetch products
app.post('/api/products', createProduct); // Create a new product

// Unified route for handling both SSR and Streaming
app.get('*', async (req, res) => {
  const page = req.path === '/' ? 'home' : req.path.substring(1);
  const useStreaming = req.query.stream === 'true';
  const filter = req.query.filter || 'all'; // Retrieve the filter parameter from the query

  res.setHeader('Content-Type', 'text/html');

  try {
    if (useStreaming) {
      console.log('Streaming mode active');
      const stream = renderPageStream(page, { filter }); // Pass the filter parameter

      // Write initial HTML before streaming begins
      res.write('<html><head><title>Streaming...</title></head><body>');

      // Pipe the stream to the response
      stream.pipe(res, { end: false });

      stream.on('end', () => {
        res.write(`
          <script>
            document.title = "Page Loaded";
          </script>
          </body></html>
        `);
        res.end();
      });

      stream.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
          res.status(500).send('Something went wrong with streaming.');
        }
      });
    } else {
      console.log('SSR mode active');
      const html = await renderPage(page, { filter }); // Pass the filter parameter to renderPage
      res.send(html);
    }
  } catch (err) {
    console.error('Error rendering page:', err);
    if (!res.headersSent) {
      res.status(404).send('Page not found');
    }
  }
});

// Setup dynamic routing for all page components
setupDynamicRouting(app);

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  if (!res.headersSent) {
    res.status(500).send('Something went wrong!');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Folonite.js is running at http://localhost:${port}`);
});
