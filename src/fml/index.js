// src/fml/index.js
// FML Framework - Unified, Secure & Optimized (Phase 1 + Phase 2)

// Core parsing and compilation
import { FMLParser } from './parser/parser.js';
import { FMLCompiler } from './compiler/compiler.js';

// Renderers
import { renderServer } from './renderer/server.js';
import { renderClient, mountFML, hydrateFML } from './renderer/client.js';

// Utilities
import { validateFML } from './parser/validator.js';
import * as helpers from './utils/helpers.js';

/**
 * Main FML processing function
 * Converts FML string to HTML or DOM
 */
export async function processFML(fmlContent, options = {}) {
  const {
    mode = 'server',
    props = {},
    components = {},
    debug = false,
    phase2 = true
  } = options;

  try {
    if (typeof fmlContent !== 'string') {
      throw new TypeError('FML content must be a string');
    }

    // Parse: FML → AST
    const parser = new FMLParser({ debug, phase2 });
    const ast = parser.parse(fmlContent);

    if (debug) {
      console.log(`✅ FML Parsed to AST (Phase ${phase2 ? '2' : '1'})`);
    }

    // Validate (dev only)
    if (debug) {
      const validation = validateFML(ast, components, { phase2 });
      if (validation.errors.length > 0) {
        console.error('❌ FML Validation Errors:', validation.errors);
        throw new Error(`Invalid FML: ${validation.errors[0].message}`);
      }
      if (validation.warnings.length > 0) {
        console.warn('⚠️ FML Warnings:', validation.warnings);
      }
    }

    // Compile: AST → Renderable Tree
    const compiler = new FMLCompiler({ components, debug, phase2 });
    const compiled = compiler.compile(ast);

    if (debug) {
      console.log(`✅ FML Compiled to renderable structure (Phase ${phase2 ? '2' : '1'})`);
    }

    // Render: Tree → Output
    const result = mode === 'server'
      ? renderServer(compiled, props, { debug, phase2 })
      : mode === 'compile'
        ? compiled
        : renderClient(compiled, props, { debug, phase2 });

    if (debug) {
      console.log(`✅ FML Rendered in ${mode} mode (Phase ${phase2 ? '2' : '1'})`);
    }

    return result;

  } catch (error) {
    if (debug) {
      console.error('❌ FML Processing Error:', {
        message: error.message,
        stack: error.stack,
        mode,
        phase2,
        hasProps: !!props,
        hasComponents: Object.keys(components).length
      });
    }
    throw new Error(`FML Error: ${error.message}`);
  }
}

/**
 * Utility: Server-side compilation
 */
export async function compileFML(fmlString, components = {}, options = {}) {
  return processFML(fmlString, {
    mode: 'compile',
    components,
    debug: process.env.NODE_ENV === 'development',
    phase2: options.phase2 !== false,
    ...options
  });
}

/**
 * Mount FML component to DOM
 */
export async function mountFMLComponent(fmlString, target, props = {}, components = {}, options = {}) {
  try {
    const compiled = await processFML(fmlString, {
      mode: 'compile',
      components,
      debug: options.debug || false,
      phase2: options.phase2 !== false
    });

    return mountFML(compiled, target, props, options);
  } catch (error) {
    console.error('Failed to mount FML component:', error);
    throw error;
  }
}

/**
 * Hydrate server-rendered FML content
 */
export async function hydrateFMLComponent(target, fmlString, props = {}, components = {}, options = {}) {
  try {
    const compiled = await processFML(fmlString, {
      mode: 'compile',
      components,
      debug: options.debug || false,
      phase2: options.phase2 !== false
    });

    return hydrateFML(target, compiled, props, options);
  } catch (error) {
    console.error('Failed to hydrate FML component:', error);
    throw error;
  }
}

/**
 * Create a reactive FML component
 */
export function createReactiveFML(fmlString, initialProps = {}, components = {}) {
  let currentProps = { ...initialProps };
  let mountedInstance = null;

  return {
    mount(target, options = {}) {
      return mountFMLComponent(fmlString, target, currentProps, components, {
        ...options,
        phase2: true
      }).then(instance => {
        mountedInstance = instance;
        return instance;
      });
    },

    update(newProps) {
      currentProps = { ...currentProps, ...newProps };
      if (mountedInstance && mountedInstance.update) {
        mountedInstance.update(currentProps);
      }
      return this;
    },

    getProps() {
      return { ...currentProps };
    },

    destroy() {
      if (mountedInstance && mountedInstance.destroy) {
        mountedInstance.destroy();
      }
      mountedInstance = null;
    }
  };
}

/**
 * Development helper: Full debug mode
 */
export async function debugFML(fmlString, options = {}) {
  return processFML(fmlString, {
    debug: true,
    phase2: true,
    ...options
  });
}

/**
 * Get FML feature matrix
 */
export function getFMLFeatures() {
  return {
    version: '2.0.0',
    phase: 2,
    core: {
      htmlParsing: true,
      componentComposition: true,
      interpolation: true,
      serverRendering: true,
      security: true
    },
    advanced: {
      conditionalRendering: true,
      listRendering: true,
      switchCase: true,
      advancedExpressions: true,
      clientHydration: true,
      eventHandling: true,
      reactiveUpdates: true,
      contextScoping: true
    }
  };
}

/**
 * Performance benchmarking
 */
export async function benchmarkFML(fmlString, props = {}, components = {}, iterations = 100) {
  const results = {
    server: { times: [], average: 0 },
    client: { times: [], average: 0 }
  };

  // Server benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await processFML(fmlString, {
      mode: 'server',
      props,
      components,
      debug: false
    });
    results.server.times.push(performance.now() - start);
  }

  // Client benchmark (browser only)
  if (typeof document !== 'undefined' && iterations > 0) {
    const testDiv = document.createElement('div');
    testDiv.style.display = 'none';
    document.body.appendChild(testDiv);

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await mountFMLComponent(fmlString, testDiv, props, components, { debug: false });
      results.client.times.push(performance.now() - start);
      testDiv.innerHTML = '';
    }

    document.body.removeChild(testDiv);
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    iterations,
    server: {
      average: Math.round(avg(results.server.times) * 100) / 100,
      min: Math.min(...results.server.times),
      max: Math.max(...results.server.times),
      opsPerSecond: Math.round(1000 / avg(results.server.times))
    },
    client: results.client.times.length > 0 ? {
      average: Math.round(avg(results.client.times) * 100) / 100,
      min: Math.min(...results.client.times),
      max: Math.max(...results.client.times),
      opsPerSecond: Math.round(1000 / avg(results.client.times))
    } : null
  };
}

/**
 * Built-in directive components (for reference)
 */
export const FMLDirectives = {
  If: ({ condition, children }) => condition ? children : null,
  Else: ({ children }) => children,
  ElseIf: ({ condition, children }) => condition ? children : null,
  For: ({ each, as = 'item', index = 'index', children }) => Array.isArray(each)
    ? each.map((item, i) => typeof children === 'function'
      ? children({ [as]: item, [index]: i })
      : children
    )
    : [],
  Switch: ({ value, children }) => children,
  Case: ({ value, children }) => children,
  Default: ({ children }) => children,
  Slot: ({ name = 'default', children }) => children
};

// Re-export core modules
export {
  FMLParser,
  FMLCompiler,
  renderServer,
  renderClient,
  mountFML,
  hydrateFML,
  validateFML
};

// Re-export utilities
export * from './utils/helpers.js';

/**
 * Default export with full API
 */
export default {
  // Core functions
  process: processFML,
  compile: compileFML,
  mount: mountFMLComponent,
  hydrate: hydrateFMLComponent,
  reactive: createReactiveFML,

  // Utilities
  debug: debugFML,
  benchmark: benchmarkFML,
  features: getFMLFeatures,

  // Components
  directives: FMLDirectives,

  // Classes
  Parser: FMLParser,
  Compiler: FMLCompiler,

  // Version
  version: '2.0.0',
  phase: 2
};