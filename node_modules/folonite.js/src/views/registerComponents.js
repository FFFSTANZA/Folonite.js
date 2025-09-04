import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

export const components = {};

export async function registerComponents() {
  const componentsDir = path.resolve('./src/components');

  if (!fs.existsSync(componentsDir)) {
    console.error(`Components directory not found: ${componentsDir}`);
    return;
  }

  const files = fs.readdirSync(componentsDir);

  for (const file of files) {
    if (file.endsWith('.js')) {
      try {
        const componentName = file.replace('.js', '');
        const componentPath = path.join(componentsDir, file);
        const componentModule = await import(pathToFileURL(componentPath).href);

        if (componentModule && componentModule.default) {
          components[componentName] = componentModule.default;
          console.log(`Component registered: ${componentName}`);
        } else {
          console.warn(`Component "${componentName}" does not have a default export.`);
        }

      } catch (error) {
        console.error(`Error registering component "${file}":`, error);
      }
    } else {
      console.warn(`Skipping non-JS file in components directory: ${file}`);
    }
  }

  console.log('Final registered components:', components);
}
