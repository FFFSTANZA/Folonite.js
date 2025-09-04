// src/fml/index.js
// Main FML entry point - Phase 1

// Core parsing and compilation
import { FMLParser } from './parser/parser.js';
import { FMLCompiler } from './compiler/compiler.js';

// Renderers (static import for performance)
import { renderServer } from './renderer/server.js';
import { renderClient } from './renderer/client.js';

// Utilities
import { validateFML } from './parser/validator.js';
import * as helpers from './utils/helpers.js';

/**
 * FML - Folonite Markup Language
 * A lightweight, JSX-inspired template engine for Folonite.js
 *
 * Phase 1 Features:
 * - Basic HTML-like syntax parsing
 * - Dynamic content interpolation
 * - Component composition
 * - Server-side rendering
 * - Security-first approach (no eval)
 */

/**
 * Main FML processing function
 * Converts FML string to HTML or DOM
 */
export async function processFML(fmlContent, options = {}) {
  const {
    mode = 'server',
    props = {},
    components = {},
    debug = false
  } = options;

  try {
    if (typeof fmlContent !== 'string') {
      throw new TypeError('FML content must be a string');
    }

    // Parse: FML → AST
    const parser = new FMLParser({ debug });
    const ast = parser.parse(fmlContent);

    if (debug) {
      console.log('✅ FML Parsed to AST');
    }

    // Validate AST (development only)
    if (debug) {
      const validation = validateFML(ast, components);
      if (validation.errors.length > 0) {
        console.error('❌ FML Validation Errors:', validation.errors);
        throw new Error(`Invalid FML: ${validation.errors[0].message}`);
      }
      if (validation.warnings.length > 0) {
        console.warn('⚠️ FML Warnings:', validation.warnings);
      }
    }

    // Compile: AST → Renderable Tree
    const compiler = new FMLCompiler({ components, debug });
    const compiled = compiler.compile(ast);

    if (debug) {
      console.log('✅ FML Compiled to renderable structure');
    }

    // Render: Tree → Output
    const result = mode === 'server'
      ? renderServer(compiled, props, { debug })
      : renderClient(compiled, props, { debug });

    if (debug) {
      console.log(`✅ FML Rendered in ${mode} mode`);
    }

    return result;

  } catch (error) {
    if (debug) {
      console.error('❌ FML Processing Error:', {
        message: error.message,
        stack: error.stack,
        mode,
        hasProps: !!props,
        hasComponents: Object.keys(components).length
      });
    }
    throw new Error(`FML Error: ${error.message}`);
  }
}

/**
 * Utility: Quick server-side compilation
 */
export async function compileFML(fmlString, components = {}) {
  return processFML(fmlString, {
    mode: 'server',
    components,
    debug: process.env.NODE_ENV === 'development'
  });
}

/**
 * Development helper: Full debug mode
 */
export async function debugFML(fmlString, options = {}) {
  return processFML(fmlString, {
    debug: true,
    ...options
  });
}

/**
 * Re-export core modules for advanced usage
 */
export {
  FMLParser,
  FMLCompiler,
  renderServer,
  renderClient,
  validateFML
};

// Re-export all utilities from helpers
export * from './utils/helpers.js';