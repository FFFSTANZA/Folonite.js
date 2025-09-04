import { components } from './registerComponents.js';
import path from 'path';
import { Readable } from 'stream';
import fs from 'fs';

function renderComponent(componentName, props) {
  if (!components[componentName]) {
    console.warn(`Component "${componentName}" not found in the registry.`);
    return `<p>Component "${componentName}" not found</p>`;
  }

  try {
    return components[componentName](JSON.parse(props));
  } catch (err) {
    console.error(`Error rendering component "${componentName}":`, err);
    return `<p>Error rendering component "${componentName}"</p>`;
  }
}

export function renderPageStream(pageName, options = {}) {
  if (!/^[a-zA-Z0-9/_-]+$/.test(pageName)) {
    throw new Error(`Invalid page name: "${pageName}".`);
  }

  const pagePath = path.resolve(`./src/pages/${pageName}.js`);

  if (!fs.existsSync(pagePath)) {
    console.error(`Page file not found: ${pagePath}`);
    throw new Error(`Page not found: "${pageName}".`);
  }

  const pageModule = require(pagePath);

  if (!pageModule || typeof pageModule.default !== 'function') {
    throw new Error(`Page module "${pageName}" does not have a valid default export.`);
  }

  const pageContent = pageModule.default(options);

  const readableStream = new Readable({
    read() {
      try {
        const renderedContent = pageContent.replace(
          /<Component name="(\w+)" props='(.+?)' \/>/g,
          (_, componentName, props) => renderComponent(componentName, props)
        );

        this.push(`
          <html>
            <head>
              <link rel="preload" href="/styles.css" as="style" />
              <link rel="preload" href="/script.js" as="script" />
              <link rel="stylesheet" href="/styles.css" />
              <script defer src="/script.js"></script>
              <title>${pageName}</title>
            </head>
            <body>
        `);

        this.push(renderedContent);
        this.push('</body></html>');
        this.push(null);
      } catch (streamError) {
        console.error('Error during streaming:', streamError);
        this.destroy(new Error('Failed to stream content.'));
      }
    }
  });

  return readableStream;
}
