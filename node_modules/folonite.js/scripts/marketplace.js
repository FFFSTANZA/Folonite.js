#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import https from 'https';

const args = process.argv.slice(2);
const marketplaceURL = 'https://raw.githubusercontent.com/FFFSTANZA/Folonite-Lib/main/marketplace.json';

// Function to fetch the latest marketplace JSON from GitHub
function fetchMarketplace(callback) {
  https.get(marketplaceURL, (response) => {
    let data = '';
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      try {
        const marketplace = JSON.parse(data);
        callback(null, marketplace);
      } catch (error) {
        callback(new Error('Invalid marketplace JSON data.'));
      }
    });
  }).on('error', (err) => { callback(err); });
}

// Search for components/templates based on a keyword
function searchMarketplace(keyword) {
  fetchMarketplace((err, marketplace) => {
    if (err) {
      console.error(`Error fetching marketplace: ${err.message}`);
      return;
    }

    if (!marketplace || marketplace.length === 0) {
      console.log("The marketplace is currently empty. We'll provide components/templates soon!");
      return;
    }

    const results = marketplace.filter(item => 
      item.tags.includes(keyword.toLowerCase()) || 
      item.name.toLowerCase().includes(keyword.toLowerCase()) || 
      item.description.toLowerCase().includes(keyword.toLowerCase())
    );

    if (results.length === 0) {
      console.log(`No results found for "${keyword}". We'll provide this component/template soon!`);
      return;
    }

    console.log(`Search results for "${keyword}":`);
    results.forEach(item => {
      console.log(`- ${item.name} (v${item.version}) by ${item.author}`);
      console.log(`  Description: ${item.description}`);
      console.log(`  Type: ${item.type}`);
      console.log('-------------------------------------------------');
    });

    console.log(`\nUse "npm run marketplace -- info [name]" to see more details or download the component.`);
  });
}

// View detailed information about a specific component/template
function viewInfo(name) {
  fetchMarketplace((err, marketplace) => {
    if (err) {
      console.error(`Error fetching marketplace: ${err.message}`);
      return;
    }

    if (!marketplace || marketplace.length === 0) {
      console.log("The marketplace is currently empty.");
      return;
    }

    const item = marketplace.find(i => i.name.toLowerCase() === name.toLowerCase());

    if (!item) {
      console.error(`Item "${name}" not found.`);
      return;
    }

    console.log(`Information about "${name}":`);
    console.log(`Name: ${item.name}`);
    console.log(`Version: ${item.version}`);
    console.log(`Author: ${item.author}`);
    console.log(`Description: ${item.description}`);
    console.log(`Type: ${item.type}`);
    console.log(`Download Link: ${item.downloadLink}`);
    console.log(`Created At: ${item.createdAt}`);
    console.log(`Updated At: ${item.updatedAt}`);
    console.log('\nUse "npm run marketplace -- download [name]" to download this component/template.');
  });
}

// Download a component/template
function downloadItem(name) {
  fetchMarketplace((err, marketplace) => {
    if (err) {
      console.error(`Error fetching marketplace: ${err.message}`);
      return;
    }

    if (!marketplace || marketplace.length === 0) {
      console.log("The marketplace is currently empty.");
      return;
    }

    const item = marketplace.find(i => i.name.toLowerCase() === name.toLowerCase());

    if (!item) {
      console.error(`Item "${name}" not found.`);
      return;
    }

    const downloadsDir = path.resolve('./downloads');
    const filePath = path.join(downloadsDir, `${item.name}.js`);

    // Ensure the downloads directory exists
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const file = fs.createWriteStream(filePath);

    https.get(item.downloadLink, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Item "${name}" downloaded successfully at ${filePath}`);
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Remove the file if an error occurs
      console.error(`Error downloading "${name}": ${err.message}`);
    });
  });
}

// Main CLI logic
switch (args[0]) {
  case 'search':
    if (!args[1]) {
      console.error('Usage: search [keyword]');
    } else {
      searchMarketplace(args[1]);
    }
    break;

  case 'info':
    if (!args[1]) {
      console.error('Usage: info [name]');
    } else {
      viewInfo(args[1]);
    }
    break;

  case 'download':
    if (!args[1]) {
      console.error('Usage: download [name]');
    } else {
      downloadItem(args[1]);
    }
    break;

  default:
    console.log(`
Usage:
  search [keyword]            Search for a component/template by keyword
  info [name]                 View detailed information about a component/template
  download [name]             Download a component/template by name
`);
}
