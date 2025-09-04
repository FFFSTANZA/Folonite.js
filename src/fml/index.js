// src/fml/index.js
// Main FML entry point - Phase 1

export { FMLParser } from './parser/parser.js';
export { FMLCompiler } from './compiler/compiler.js';
export { renderServer } from './renderer/server.js';
export { renderClient } from './renderer/client.js';

/**
 * FML - Folonite Markup Language
 * A lightweight, JSX-inspired template engine for Folonite.js
 * 
 * Phase 1 Features:
 * - Basic HTML-like syntax parsing
 * - Dynamic content interpolation
 * - Component composition
 * - Server-side rendering
 * - Security-first approach
 */

// Main FML processing function
export async function processFML(fmlContent, options = {}) {
  const { 
    mode = 'server',
    props = {},
    components = {},
    debug = false 
  } = options;

  try {
    // Parse FML to AST
    const parser = new FMLParser({ debug });
    const ast = parser.parse(fmlContent);
    
    // Compile AST to renderable format
    const compiler = new FMLCompiler({ components, debug });
    const compiled = compiler.compile(ast);
    
    // Render based on mode
    if (mode === 'server') {
      const { renderServer } = await import('./renderer/server.js');
      return renderServer(compiled, props);
    } else {
      const { renderClient } = await import('./renderer/client.js');
      return renderClient(compiled, props);
    }
    
  } catch (error) {
    if (debug) {
      console.error('FML Processing Error:', error);
    }
    throw new Error(`FML Error: ${error.message}`);
  }
}

// Utility function for quick FML compilation
export async function compileFML(fmlString, components = {}) {
  return processFML(fmlString, { 
    mode: 'server', 
    components,
    debug: process.env.NODE_ENV === 'development'
  });
}

// Development helper
export async function debugFML(fmlString) {
  return processFML(fmlString, { debug: true });
}
