import { components } from './registerComponents.js';
import path from 'path';
import { Readable } from 'stream';
import { pathToFileURL } from 'url';

// Function for standard page rendering
export async function renderPage(pageName, options = {}) {
  try {
    const pagePath = path.resolve(`./src/pages/${pageName}.js`);
    const pageUrl = pathToFileURL(pagePath).href;
    console.log(`Attempting to load page from URL: ${pageUrl}`);

    const pageModule = await import(pageUrl);
    console.log(`Successfully loaded page: ${pageName}`);

    if (!pageModule.default) {
      throw new Error(`Page module "${pageName}" does not have a default export.`);
    }

    // Get the page content by invoking the default export function
    const pageContent = pageModule.default(options);

    // Replace component placeholders with actual component renders
    const renderedContent = pageContent.replace(/<Component name="(\w+)" props='(.+?)' \/>/g, (_, componentName, props) => {
      try {
        const parsedProps = JSON.parse(props);
        if (components[componentName]) {
          return components[componentName](parsedProps);
        } else {
          console.warn(`Component "${componentName}" not found in the registry.`);
          return `<p>Component ${componentName} not found</p>`;
        }
      } catch (err) {
        console.error(`Error rendering component "${componentName}":`, err);
        return `<p>Error rendering component "${componentName}"</p>`;
      }
    });

    return `
      <html>
        <head>
          <link rel="preload" href="/styles.css" as="style" />
          <link rel="preload" href="/script.js" as="script" />
          <link rel="stylesheet" href="/styles.css" />
          <script defer src="/script.js"></script>
          <title>${pageName}</title>
        </head>
        <body>
          ${renderedContent}
        </body>
      </html>
    `;
  } catch (error) {
    console.error(`Error loading page: ${pageName}`, error);
    throw new Error(`Page not found: ${pageName}`);
  }
}

// Function for page streaming
export function renderPageStream(pageName, options = {}) {
  try {
    const pagePath = path.resolve(`./src/pages/${pageName}.js`);
    const pageModule = require(pagePath);

    if (!pageModule || !pageModule.default) {
      throw new Error(`Page module "${pageName}" does not have a default export.`);
    }

    const pageContent = pageModule.default(options);

    const readableStream = new Readable({
      read() {
        // Replace component placeholders with actual component renders
        const renderedContent = pageContent.replace(/<Component name="(\w+)" props='(.+?)' \/>/g, (_, componentName, props) => {
          try {
            const parsedProps = JSON.parse(props);
            if (components[componentName]) {
              return components[componentName](parsedProps);
            } else {
              console.warn(`Component "${componentName}" not found in the registry.`);
              return `<p>Component ${componentName} not found</p>`;
            }
          } catch (err) {
            console.error(`Error rendering component "${componentName}":`, err);
            return `<p>Error rendering component "${componentName}"</p>`;
          }
        });

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
        this.push('</body></html>'); // End the HTML
        this.push(null); // End the stream
      }
    });

    return readableStream;
  } catch (error) {
    console.error(`Error loading page: ${pageName}`, error);
    throw new Error(`Page not found: ${pageName}`);
  }
}
