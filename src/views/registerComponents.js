import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

export const components = {};

export async function registerComponents(debug = false) {
  const componentsDir = path.resolve('./src/components');

  if (!fs.existsSync(componentsDir)) {
    throw new Error(`Components directory not found: ${componentsDir}`);
  }

  const logDebug = (message) => {
    if (debug) {
      console.debug(message);
    }
  };

  const loadComponentsFromDir = async (dir) => {
    logDebug(`Scanning directory: ${dir}`);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        logDebug(`Entering subdirectory: ${entryPath}`);
        await loadComponentsFromDir(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const componentName = path.relative(componentsDir, entryPath).replace(/\.js$/, '').replace(/\\/g, '/');
        try {
          logDebug(`Importing component: ${entryPath}`);
          const componentModule = await import(pathToFileURL(entryPath).href);
          if (componentModule.default) {
            components[componentName] = componentModule.default;
            console.log(`Component registered: ${componentName}`);
          } else {
            console.warn(`Skipping "${componentName}": No default export.`);
          }
        } catch (error) {
          console.error(`Failed to register component "${componentName}":`, error);
          logDebug(`Error details: ${error.stack}`);
        }
      } else {
        console.warn(`Skipping non-JS file: ${entryPath}`);
      }
    }
  };

  try {
    console.log(`Starting component registration from: ${componentsDir}`);
    await loadComponentsFromDir(componentsDir);
    console.log('Component registration complete.');
    console.log('Registered components:', Object.keys(components));
  } catch (error) {
    console.error('Error during component registration:', error);
    logDebug(`Error details: ${error.stack}`);
  }
}
