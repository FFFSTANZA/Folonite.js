import { components } from './registerComponents.js';
import path from 'path';
import { Readable } from 'stream';

export function renderPageStream(pageName, options = {}) {
  try {
    // Resolve the path for the page module
    const pagePath = path.resolve(`./src/pages/${pageName}.js`);
    const pageModule = require(pagePath);

    // Check if the module has a default export
    if (!pageModule || !pageModule.default) {
      throw new Error(`Page module "${pageName}" does not have a default export.`);
    }

    // Get the content of the page with the passed options
    const pageContent = pageModule.default(options);

    // Create a readable stream for streaming the content
    const readableStream = new Readable({
      read() {
        // Replace component placeholders with actual component renders
        const renderedContent = pageContent.replace(/<Component name="(\w+)" props='(.+?)' \/>/g, (_, componentName, props) => {
          try {
            // Parse the props from the placeholder
            const parsedProps = JSON.parse(props);
            if (components[componentName]) {
              // Render the component with parsed props
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

        // Push the start of the HTML and the rendered content
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

        // Push the rendered page content
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
