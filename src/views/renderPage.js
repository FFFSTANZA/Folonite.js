import path from 'path';
import { Readable } from 'stream';
import { pathToFileURL } from 'url';
import fs from 'fs';
import { components } from './registerComponents.js';

async function loadPageModule(pageName) {
  const pagePath = path.resolve(`./src/pages/${pageName}.js`);
  const pageUrl = pathToFileURL(pagePath).href;
  const pageModule = await import(pageUrl);
  if (!pageModule.default) {
    throw new Error(`Page module "${pageName}" does not export a default function.`);
  }
  return pageModule.default;
}

function replaceComponentPlaceholders(content, pageName) {
  return content.replace(/<Component\s+name="(\w+)"(?:\s+props='([^']*)')?\s*\/>/g, (_, componentName, propsJson) => {
    try {
      const props = propsJson ? JSON.parse(propsJson) : {};
      const component = components[componentName];
      if (!component) {
        throw new Error(`Component "${componentName}" not found`);
      }
      return component(props);
    } catch (error) {
      console.error(`Error rendering component "${componentName}" on page "${pageName}":`, error);
      return `<p>Error rendering component "${componentName}"</p>`;
    }
  });
}

function resolveStylesheetPath(pageName) {
  const stylesDir = path.resolve('./public/styles');
  const normalizedPageName = path.normalize(pageName).replace(/\\/g, '/'); // Normalize paths for subdirectories

  const possiblePaths = [
    path.join(stylesDir, `${normalizedPageName}.css`), // Specific page CSS in subdirectories
    path.join(stylesDir, `${path.basename(normalizedPageName)}.css`), // Filename-based CSS
    path.join(stylesDir, 'global.css'), // Global fallback CSS
  ];

  for (const stylesheetPath of possiblePaths) {
    if (fs.existsSync(stylesheetPath)) {
      return `/styles/${path.relative(stylesDir, stylesheetPath).replace(/\\/g, '/')}`; // Return relative web path
    }
  }

  console.warn(`Stylesheet not found for page: ${pageName}`);
  return null; // No stylesheet found
}

export async function renderPage(pageName, options = {}) {
  try {
    const pageFunction = await loadPageModule(pageName);
    const pageContent = pageFunction(options);
    const renderedContent = replaceComponentPlaceholders(pageContent, pageName);

    // Dynamic CSS resolution with fallback
    const stylesheet = resolveStylesheetPath(pageName);

    return buildHtmlPage(pageName, renderedContent, stylesheet);
  } catch (error) {
    console.error(`Error rendering page "${pageName}":`, error);
    return buildErrorPage(pageName, error.message);
  }
}

export function renderPageStream(pageName, options = {}) {
  const stream = new Readable({
    async read() {
      try {
        const pageFunction = await loadPageModule(pageName);
        const pageContent = pageFunction(options);
        const renderedContent = replaceComponentPlaceholders(pageContent, pageName);

        // Dynamic CSS resolution with fallback
        const stylesheet = resolveStylesheetPath(pageName);

        this.push(buildHtmlPage(pageName, renderedContent, stylesheet));
      } catch (error) {
        console.error(`Error streaming page "${pageName}":`, error);
        this.push(buildErrorPage(pageName, error.message));
      }
      this.push(null);
    },
  });
  return stream;
}

function buildHtmlPage(title, bodyContent, stylesheet) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${stylesheet ? `<link rel="stylesheet" href="${stylesheet}">` : ''}
        <script defer src="/script.js"></script>
        <title>${title}</title>
      </head>
      <body>${bodyContent}</body>
    </html>
  `;
}

function buildErrorPage(pageName, errorMessage) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Error - ${pageName}</title>
      </head>
      <body>
        <h1>Error loading page: ${pageName}</h1>
        <p>${errorMessage}</p>
      </body>
    </html>
  `;
}
