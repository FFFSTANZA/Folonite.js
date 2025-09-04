import express from 'express';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { renderPage } from './views/renderPage';

export function setupDynamicRouting(app) {
  const pagesDir = path.resolve('./src/pages');

  const walkDirectory = (dir, routePrefix = '') => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDirectory(filePath, `${routePrefix}/${entry.name}`);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        let route = `${routePrefix}/${entry.name.replace('.js', '')}`;
        route = route.replace(/\[(.+?)\]/g, ':$1');
        if (entry.name === 'index.js') {
          route = routePrefix || '/';
        }

        console.log(`Registering route: ${route} -> ${filePath}`);

        app.get(route, async (req, res, next) => {
          try {
            const pageUrl = pathToFileURL(filePath).href;
            const PageComponent = await import(pageUrl);
            if (PageComponent && PageComponent.default) {
              const content = PageComponent.default(req.params);
              res.send(renderPageWrapper(route, content));
            } else {
              console.error(`No default export found in: ${filePath}`);
              res.status(500).send('Server error: Page component missing default export');
            }
          } catch (err) {
            console.error(`Error loading route ${route}:`, err);
            next(err);
          }
        });
      } else {
        console.warn(`Skipping non-JS file in pages directory: ${filePath}`);
      }
    });
  };

  walkDirectory(pagesDir);

  app.use((req, res) => {
    res.status(404).send(`
      <html>
        <head><title>404 Not Found</title></head>
        <body><h1>404 - Page Not Found</h1></body>
      </html>
    `);
  });
}

function renderPageWrapper(route, content) {
  return `
    <html>
      <head>
        <title>${route}</title>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `;
}
