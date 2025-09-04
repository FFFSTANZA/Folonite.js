// src/fml/examples/demo-server.js
// FML Phase 1 Demo Server - Fully Working

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import FML modules with error handling
let processFML = null;

async function loadFML() {
  try {
    const fmlModule = await import('../index.js');
    processFML = fmlModule.processFML;
    console.log('✅ FML loaded successfully');
  } catch (error) {
    console.error('❌ Failed to load FML:', error);
    console.log('Make sure all FML files are in place:');
    console.log('  - src/fml/index.js');
    console.log('  - src/fml/parser/parser.js');
    console.log('  - src/fml/compiler/compiler.js');
    console.log('  - src/fml/renderer/server.js');
    console.log('  - src/fml/utils/escape.js');
    process.exit(1);
  }
}

// Load FML file from disk
function loadFMLFile(filename) {
  const filePath = path.join(__dirname, '..', '..', 'pages', filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`FML file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

const app = express();
const PORT = 3001;

// Simple demo components
const components = {
  Header: ({ title }) => `
    <header style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px; margin-bottom: 30px;">
      <h1>${title || 'FML Demo'}</h1>
      <p>Phase 1 Complete - Lightweight JSX Alternative</p>
    </header>
  `,

  Footer: () => `
    <footer style="background: #f8f9fa; padding: 20px; text-align: center; margin-top: 30px; border-top: 1px solid #dee2e6;">
      <p>&copy; 2024 Folonite.js - FML Phase 1</p>
    </footer>
  `,

  Card: ({ type, children }) => {
    const border = type === 'info' ? '1px solid #3b82f6' : 'none';
    return `
      <div style="background: white; padding: 25px; margin: 20px 0; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: ${border};">
        ${children || ''}
      </div>
    `;
  },

  UserCard: ({ name, avatar, status }) => `
    <div style="display: flex; align-items: center; gap: 15px; margin: 15px 0;">
      <img src="${avatar}" alt="${name}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
      <div>
        <h4 style="margin: 0;">${name}</h4>
        <small style="color: #6b7280;">
          Status: <span style="color: ${status === 'online' ? '#10b981' : '#6b7280'};">●</span> ${status}
        </small>
      </div>
    </div>
  `,

  Button: ({ variant, size, children }) => {
    const variants = {
      primary: 'background: #4f46e5; color: white;',
      secondary: 'background: #6b7280; color: white;'
    };
    const sizes = {
      small: 'padding: 8px 12px; font-size: 0.875rem;',
      large: 'padding: 12px 24px; font-size: 1.125rem;'
    };
    return `
      <button style="${variants[variant] || ''} ${sizes[size] || ''} border: none; border-radius: 6px; cursor: pointer;">
        ${children || ''}
      </button>
    `;
  },

  Separator: () => `
    <hr style="border: 1px solid #e5e7eb; margin: 30px 0;">
  `
};

// Test route to verify FML works
app.get('/test-fml', async (req, res) => {
  if (!processFML) {
    return res.status(500).send('<h1>FML not loaded</h1><p>Check server console for errors</p>');
  }

  try {
    const fmlContent = `
      <main style="font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <Header title="FML Test Success" />
        
        <Card type="info">
          <p>FML is working correctly in your Folonite.js project!</p>
          
          <div style="background: #d1fae5; border: 1px solid #a7f3d0; color: #065f46; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <strong>✅ Test Results:</strong>
            <ul style="margin: 10px 0;">
              <li>FML Parser: Working</li>
              <li>FML Compiler: Working</li>
              <li>Component System: Working</li>
              <li>Server Rendering: Working</li>
            </ul>
          </div>

          <h4>Dynamic Content Test:</h4>
          <p>Current time: <strong>{currentTime}</strong></p>
          <p>Random number: <strong>{randomNum}</strong></p>
          <p>User greeting: <strong>Hello, {user.name}!</strong></p>
        </Card>

        <Card>
          <ol>
            <li>Create <code>.fml</code> files in your <code>src/pages/</code> directory</li>
            <li>Use components with <code><ComponentName prop="value" /></code> syntax</li>
            <li>Add dynamic content with <code>{variable}</code> interpolation</li>
            <li>Visit your pages - FML will be used automatically!</li>
          </ol>
          
          <p><a href="/basic-example" style="color: #4f46e5;">→ See a basic example</a></p>
        </Card>
        
        <Footer />
      </main>
    `;

    const html = await processFML(fmlContent, {
      mode: 'server',
      props: {
        currentTime: new Date().toLocaleString(),
        randomNum: Math.floor(Math.random() * 1000),
        user: { name: 'Developer' }
      },
      components,
      debug: true
    });

    res.send(html);
  } catch (error) {
    console.error('FML Test Error:', error);
    res.status(500).send(`
      <div style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">❌ FML Test Failed</h1>
        <p><strong>Error:</strong> ${error.message}</p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong>Troubleshooting:</strong>
          <ol>
            <li>Check that all FML files exist in the correct locations</li>
            <li>Verify imports are working properly</li>
            <li>Look at the server console for detailed error messages</li>
          </ol>
        </div>
        <a href="/" style="color: #4f46e5;">← Back to home</a>
      </div>
    `);
  }
});

// Basic example route – loads from file
app.get('/basic-example', async (req, res) => {
  if (!processFML) {
    return res.status(500).send('<h1>FML not loaded</h1>');
  }

  try {
    const fmlContent = loadFMLFile('basic.fml');
    const html = await processFML(fmlContent, {
      mode: 'server',
      props: {
        user: {
          name: 'Alice Johnson',
          email: 'alice@example.com',
          role: 'Full Stack Developer',
          avatar: 'https://i.pravatar.cc/150?u=alice'
        },
        stats: {
          posts: 42,
          followers: 1337,
          likes: 2890
        }
      },
      components,
      debug: true
    });

    res.send(html);
  } catch (error) {
    res.status(500).send(`
      <div style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">❌ Error Loading Page</h1>
        <p><strong>${error.message}</strong></p>
        <a href="/" style="color: #4f46e5;">← Back to home</a>
      </div>
    `);
  }
});

// Home route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FML Demo Server</title>
      <style>
        body { 
          font-family: system-ui, sans-serif; 
          max-width: 600px; 
          margin: 50px auto; 
          padding: 20px; 
          background: #f8f9fa; 
          line-height: 1.6;
        }
        .card { 
          background: white; 
          padding: 30px; 
          border-radius: 12px; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          margin: 20px 0; 
        }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #4f46e5; 
          color: white; 
          text-decoration: none; 
          border-radius: 8px; 
          margin: 10px 10px 10px 0; 
          font-weight: 500;
        }
        .button:hover { background: #4338ca; }
        .success { 
          background: #d1fae5; 
          border: 1px solid #a7f3d0; 
          color: #065f46; 
          padding: 15px; 
          border-radius: 8px; 
          margin: 20px 0;
        }
        code {
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🚀 FML Demo Server</h1>
        <p>Welcome to the FML (Folonite Markup Language) demonstration server!</p>
        
        <div class="success">
          <strong>✅ Server Running:</strong> FML Phase 1 is ready for testing
        </div>
        
        <h3>Test Routes:</h3>
        <a href="/test-fml" class="button">🧪 FML Test</a>
        <a href="/basic-example" class="button">📝 Basic Example</a>
        
        <h3>Integration Instructions:</h3>
        <ol>
          <li>Copy the FML files to your Folonite.js project</li>
          <li>Update your <code>renderPage.js</code> with the fixed version</li>
          <li>Create <code>.fml</code> files in <code>src/pages/</code></li>
          <li>Visit your pages - FML will be used automatically!</li>
        </ol>
        
        <p><strong>Note:</strong> This is a standalone demo server. The main integration happens in your <code>server.js</code> file.</p>
      </div>
    </body>
    </html>
  `);
});

// Start server
async function startServer() {
  await loadFML();
  
  app.listen(PORT, () => {
    console.log('\n🚀 FML Demo Server Started!');
    console.log(`📍 Visit: http://localhost:${PORT}`);
    console.log('\n📚 Available routes:');
    console.log(`   🏠 http://localhost:${PORT}/           - Home`);
    console.log(`   🧪 http://localhost:${PORT}/test-fml   - FML Test`);
    console.log(`   📝 http://localhost:${PORT}/basic-example - Basic Example`);
    console.log('\n✅ FML Phase 1 is ready!\n');
  });
}

startServer().catch(console.error);