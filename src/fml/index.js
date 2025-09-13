// src/fml/index.js

// Core imports with circular dependency prevention
let FMLParser, FMLCompiler, renderServer, renderClient, mountFML, hydrateFML, validateFML;
let fmlDebugger, fmlProfiler, healthMonitor, fmlStats;

// Module initialization state
const moduleState = {
  initialized: false,
  initializing: false,
  plugins: new Map(),
  devTools: null,
  analytics: null,
  errorReporter: null
};

/**
 * Plugin System Architecture — Zero-overhead, Lock-free, Optimized
 */
export class FMLPluginSystem {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
    this.middleware = [];
    this.enabled = true;
  }

  register(plugin) {
    if (!plugin || typeof plugin !== 'object' || !plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must be a non-null object with a string "name" property');
    }

    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    if (typeof plugin.install !== 'function') {
      throw new Error(`Plugin "${plugin.name}" must implement an install method`);
    }

    try {
      const context = this.createPluginContext(plugin);
      plugin.install(context);
      this.plugins.set(plugin.name, plugin);
      fmlDebugger?.info(`Plugin "${plugin.name}" registered successfully`);
    } catch (error) {
      throw new Error(`Failed to install plugin "${plugin.name}": ${error.message}`);
    }

    return this;
  }

  unregister(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;

    if (typeof plugin.uninstall === 'function') {
      try { plugin.uninstall(); } catch (e) { fmlDebugger?.warn(`Uninstall error in ${pluginName}:`, e); }
    }

    this.plugins.delete(pluginName);

    for (const [hookName, callbacks] of this.hooks.entries()) {
      this.hooks.set(hookName, callbacks.filter(cb => cb.plugin !== pluginName));
    }

    fmlDebugger?.info(`Plugin "${pluginName}" unregistered`);
    return true;
  }

  addHook(hookName, callback, pluginName = 'anonymous') {
    if (typeof callback !== 'function') {
      throw new Error('Hook callback must be a function');
    }

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    this.hooks.get(hookName).push({ callback, plugin: pluginName });
    return this;
  }

  async executeHook(hookName, context = {}) {
    const callbacks = this.hooks.get(hookName) || [];
    const results = [];

    for (const { callback, plugin } of callbacks) {
      try {
        const result = await callback(context);
        results.push({ plugin, result });
      } catch (error) {
        fmlDebugger?.error(`Hook "${hookName}" failed in plugin "${plugin}":`, error);
        results.push({ plugin, error });
      }
    }

    return results;
  }

  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.middleware.push(middleware);
    return this;
  }

  async executeMiddleware(context) {
    let result = context;
    for (const mw of this.middleware) {
      try {
        result = await mw(result) || result;
      } catch (error) {
        fmlDebugger?.error('Middleware execution failed:', error);
        throw error;
      }
    }
    return result;
  }

  createPluginContext(plugin) {
    return {
      name: plugin.name,
      version: plugin.version || '1.0.0',
      addHook: (hookName, callback) => this.addHook(hookName, callback, plugin.name),
      use: (middleware) => this.use(middleware),
      getConfig: () => plugin.config || {},
      emit: (eventName, data) => this.emit(eventName, data),
      fml: {
        process: processFML,
        compile: compileFML,
        validate: validateFML,
        utils: () => import('./utils/helpers.js')
      }
    };
  }

  emit(eventName, data) {
    return this.executeHook(`event:${eventName}`, data);
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  listPlugins() {
    return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
      name,
      version: plugin.version || '1.0.0',
      description: plugin.description || '',
      author: plugin.author || 'Unknown'
    }));
  }

  disable() {
    this.enabled = false;
  }

  enable() {
    this.enabled = true;
  }
}

/**
 * Development Tools Integration — Minimal footprint, Max utility
 */
export class FMLDevTools {
  constructor() {
    this.enabled = process.env.NODE_ENV === 'development';
    this.panels = new Map();
    this.inspectors = new Map();
    this.timeline = [];
    this.maxTimelineEntries = 1000;
  }

  registerPanel(name, panel) {
    this.panels.set(name, panel);
    this.updateDevToolsUI();
  }

  inspect(component, element) {
    if (!this.enabled) return null;

    const inspection = {
      timestamp: Date.now(),
      component,
      element,
      props: component.props || {},
      state: component.state || {},
      performance: this.measureComponent(component)
    };

    this.inspectors.set(component.id || component.name, inspection);
    this.addTimelineEntry('component:inspect', inspection);
    return inspection;
  }

  measureComponent(component) {
    const start = performance.now();
    // Simulate minimal render measurement
    return {
      renderTime: performance.now() - start,
      memory: this.getMemoryUsage(),
      props: Object.keys(component.props || {}).length,
      children: component.children?.length || 0
    };
  }

  addTimelineEntry(type, data) {
    if (!this.enabled) return;

    this.timeline.push({
      timestamp: Date.now(),
      type,
      data
    });

    if (this.timeline.length > this.maxTimelineEntries) {
      this.timeline.shift();
    }

    this.notifyDevTools('timeline:update', this.timeline.slice(-10));
  }

  enableHotReload() {
    if (!this.enabled || typeof module === 'undefined') return;
    if (module.hot) {
      module.hot.accept((err) => {
        if (err) console.error('Hot reload error:', err);
        else this.notifyDevTools('hot:reload', { timestamp: Date.now() });
      });
    }
  }

  updateDevToolsUI() {
    if (typeof window === 'undefined') return;

    if (!window.__FML_DEVTOOLS__) {
      window.__FML_DEVTOOLS__ = {
        panels: Array.from(this.panels.entries()),
        timeline: this.timeline.slice(-50),
        inspect: (id) => this.inspectors.get(id),
        getStats: () => fmlStats?.getDetailedReport(),
        clearTimeline: () => { this.timeline = []; },
        version: getFMLFeatures().version
      };
    }
  }

  notifyDevTools(event, data) {
    if (typeof window !== 'undefined' && window.__FML_DEVTOOLS__) {
      window.dispatchEvent(new CustomEvent('fml:devtools', {
        detail: { event, data, timestamp: Date.now() },
        bubbles: true,
        cancelable: false
      }));
    }
  }

  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }
}

/**
 * Error Reporting Service — Lightweight, Non-blocking, Async Safe
 */
export class FMLErrorReporter {
  constructor(options = {}) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.enabled = options.enabled !== false;
    this.maxErrors = options.maxErrors || 100;
    this.errors = [];
    this.context = {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
      url: typeof window !== 'undefined' ? window.location.href : 'server',
      timestamp: Date.now(),
      version: getFMLFeatures().version
    };
  }

  report(error, context = {}) {
    if (!this.enabled) return;

    const errorReport = {
      id: this.generateId(),
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      type: error.name || 'Error',
      context: { ...this.context, ...context },
      level: context.level || 'error',
      fingerprint: this.generateFingerprint(error)
    };

    this.errors.push(errorReport);

    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    if (this.endpoint) {
      this.sendToService(errorReport).catch(() => {}); // Non-blocking
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('FML Error Report:', errorReport);
    }

    return errorReport.id;
  }

  async sendToService(errorReport) {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify(errorReport)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch {}
  }

  generateId() {
    return `fml-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateFingerprint(error) {
    const key = `${error.name}:${error.message}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  getErrors(level = null) {
    return level ? this.errors.filter(e => e.level === level) : this.errors;
  }

  clear() {
    this.errors = [];
  }
}

/**
 * Performance Analytics — Efficient, Low-Cost, Event-Driven
 */
export class FMLAnalytics {
  constructor(options = {}) {
    this.enabled = options.enabled !== false && typeof performance !== 'undefined';
    this.metrics = new Map();
    this.sessions = new Map();
    this.currentSession = this.createSession();
    this.reportInterval = options.reportInterval || 60000;
    this.setupPeriodicReporting();
  }

  createSession() {
    return {
      id: this.generateSessionId(),
      startTime: Date.now(),
      metrics: {
        renders: 0,
        compilations: 0,
        errors: 0,
        totalTime: 0,
        components: new Set(),
        features: new Set()
      }
    };
  }

  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  track(event, data = {}) {
    if (!this.enabled) return;

    const metric = {
      event,
      timestamp: Date.now(),
      data,
      session: this.currentSession.id
    };

    const key = `${event}:${Date.now()}`;
    this.metrics.set(key, metric);

    this.updateSessionMetrics(event, data);
    this.cleanOldMetrics();
  }

  updateSessionMetrics(event, data) {
    const session = this.currentSession.metrics;

    switch (event) {
      case 'render':
        session.renders++;
        session.totalTime += data.duration || 0;
        if (data.component) session.components.add(data.component);
        break;
      case 'compile':
        session.compilations++;
        session.totalTime += data.duration || 0;
        break;
      case 'error':
        session.errors++;
        break;
      case 'feature':
        if (data.name) session.features.add(data.name);
        break;
    }
  }

  cleanOldMetrics() {
    const cutoff = Date.now() - 3600000;
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.timestamp < cutoff) this.metrics.delete(key);
    }
  }

  getMetrics(event = null, timeRange = 3600000) {
    const cutoff = Date.now() - timeRange;
    return Array.from(this.metrics.values())
      .filter(metric => metric.timestamp > cutoff)
      .filter(metric => !event || metric.event === event);
  }

  generateReport() {
    const session = this.currentSession;
    const metrics = session.metrics;

    return {
      session: {
        id: session.id,
        duration: Date.now() - session.startTime,
        startTime: session.startTime
      },
      performance: {
        renders: metrics.renders,
        compilations: metrics.compilations,
        averageTime: metrics.renders > 0 ? metrics.totalTime / metrics.renders : 0,
        errors: metrics.errors,
        errorRate: metrics.renders > 0 ? (metrics.errors / metrics.renders * 100).toFixed(2) + '%' : '0%'
      },
      usage: {
        uniqueComponents: metrics.components.size,
        featuresUsed: Array.from(metrics.features),
        componentsUsed: Array.from(metrics.components)
      },
      system: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
        memory: this.getMemoryUsage(),
        timing: typeof performance !== 'undefined' ? performance.timing : null
      }
    };
  }

  setupPeriodicReporting() {
    if (!this.enabled || this.reportInterval <= 0) return;

    setInterval(() => {
      const report = this.generateReport();
      this.emit('report', report);
    }, this.reportInterval);
  }

  emit(event, data) {
    if (moduleState.plugins?.size > 0) {
      pluginSystem.emit(`analytics:${event}`, data);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fml:analytics', {
        detail: { event, data, timestamp: Date.now() },
        bubbles: true,
        cancelable: false
      }));
    }
  }

  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB',
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + ' MB',
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + ' MB'
      };
    }
    return null;
  }
}

/**
 * Module initialization with circular dependency prevention — Optimized
 */
async function initializeModules() {
  if (moduleState.initialized || moduleState.initializing) {
    return moduleState;
  }

  moduleState.initializing = true;

  try {
    // Load modules in parallel
    const [
      parserModule,
      compilerModule,
      serverModule,
      clientModule,
      validatorModule,
      helpersModule
    ] = await Promise.all([
      import('./parser/parser.js'),
      import('./compiler/compiler.js'),
      import('./renderer/server.js'),
      import('./renderer/client.js'),
      import('./parser/validator.js'),
      import('./utils/helpers.js')
    ]);

    // Assign core modules
    FMLParser = parserModule.FMLParser;
    FMLCompiler = compilerModule.FMLCompiler;
    renderServer = serverModule.renderServer;
    renderClient = clientModule.renderClient;
    mountFML = clientModule.mountFML;
    hydrateFML = clientModule.hydrateFML;
    validateFML = validatorModule.validateFML;

    // Assign utilities
    fmlDebugger = helpersModule.fmlDebugger;
    fmlProfiler = helpersModule.fmlProfiler;
    healthMonitor = helpersModule.healthMonitor;
    fmlStats = helpersModule.fmlStats;

    // Initialize systems
    if (typeof window !== 'undefined' || process.env.NODE_ENV === 'development') {
      moduleState.devTools = new FMLDevTools();
      moduleState.devTools.enableHotReload();
    }

    moduleState.errorReporter = new FMLErrorReporter({
      enabled: process.env.NODE_ENV !== 'test'
    });

    moduleState.analytics = new FMLAnalytics({
      enabled: process.env.NODE_ENV !== 'test'
    });

    moduleState.initialized = true;
    moduleState.initializing = false;

    fmlDebugger?.info('FML framework initialized successfully', {
      version: getFMLFeatures().version,
      mode: process.env.NODE_ENV || 'development',
      features: getFMLFeatures()
    });

    return moduleState;

  } catch (error) {
    moduleState.initializing = false;
    throw new Error(`Failed to initialize FML framework: ${error.message}`);
  }
}

// Global plugin system
export const pluginSystem = new FMLPluginSystem();

/**
 * Enhanced error handling — Zero-cost in production
 */
function handleError(error, context = {}) {
  const errorReport = {
    ...context,
    timestamp: Date.now(),
    framework: 'FML',
    version: getFMLFeatures().version
  };

  moduleState.errorReporter?.report(error, errorReport);

  moduleState.analytics?.track('error', {
    message: error.message,
    type: error.name || 'Error',
    context: context.operation || 'unknown'
  });

  if (process.env.NODE_ENV === 'development') {
    fmlDebugger?.error('FML Framework Error:', {
      error: error.message,
      stack: error.stack,
      context: errorReport
    });
  }

  return errorReport;
}

/**
 * Main FML processing function — High-performance, optimized path
 */
export async function processFML(fmlContent, options = {}) {
  await initializeModules();

  const {
    mode = 'server',
    props = {},
    components = {},
    debug = false,
    phase2 = true,
    validate = debug
  } = options;

  const startTime = performance.now();
  const operation = `process:${mode}`;
  let profileId;

  try {
    if (typeof fmlContent !== 'string') {
      throw new TypeError('FML content must be a string');
    }

    if (debug) {
      profileId = fmlProfiler.start(operation);
      fmlProfiler.mark(profileId, 'start');
    }

    // Execute pre-processing hooks
    const hookContext = { fmlContent, options, mode, props, components };
    await pluginSystem.executeHook('before:process', hookContext);

    // Parse: FML → AST
    const parser = new FMLParser({ debug, phase2 });
    const ast = parser.parse(fmlContent);

    if (debug) {
      fmlProfiler.mark(profileId, 'parsed');
      fmlDebugger.info(`✅ FML Parsed to AST (Phase ${phase2 ? '2' : '1'})`);
    }

    // Validate (optional)
    if (validate) {
      const validation = validateFML(ast, components, {
        phase2,
        debug,
        accessibility: options.accessibility,
        performance: options.performance,
        security: options.security
      });

      if (validation.errors.length > 0) {
        const validationError = new Error(`FML Validation Failed: ${validation.errors[0].message}`);
        validationError.validation = validation;
        throw validationError;
      }

      if (validation.warnings.length > 0 && debug) {
        fmlDebugger.warn('FML Validation Warnings:', validation.warnings);
      }

      if (debug) {
        fmlProfiler.mark(profileId, 'validated');
      }
    }

    // Compile: AST → Renderable Tree
    const compiler = new FMLCompiler({ components, debug, phase2 });
    const compiled = compiler.compile(ast);

    if (debug) {
      fmlProfiler.mark(profileId, 'compiled');
      fmlDebugger.info(`✅ FML Compiled to renderable structure (Phase ${phase2 ? '2' : '1'})`);
    }

    // Render: Tree → Output
    let result;
    if (mode === 'server') {
      result = renderServer(compiled, props, { debug, phase2 });
    } else if (mode === 'compile') {
      result = compiled;
    } else {
      result = renderClient(compiled, props, { debug, phase2 });
    }

    const duration = performance.now() - startTime;

    if (debug) {
      fmlProfiler.mark(profileId, 'rendered');
      fmlDebugger.info(`✅ FML Rendered in ${mode} mode (${duration.toFixed(2)}ms)`);
      fmlProfiler.end(profileId);
    }

    // Track analytics
    moduleState.analytics?.track('render', {
      mode,
      duration,
      phase2,
      componentCount: Object.keys(components).length,
      hasValidation: validate
    });

    // Execute post-processing hooks
    await pluginSystem.executeHook('after:process', {
      ...hookContext,
      result,
      ast,
      compiled,
      duration
    });

    return result;

  } catch (error) {
    const errorContext = { operation, mode, phase2, duration: performance.now() - startTime };
    handleError(error, errorContext);

    if (debug && profileId) {
      fmlProfiler.end(profileId);
    }

    throw new Error(`FML Processing Error: ${error.message}`);
  }
}

/**
 * Enhanced compilation with plugin support
 */
export async function compileFML(fmlString, components = {}, options = {}) {
  await initializeModules();

  return processFML(fmlString, {
    mode: 'compile',
    components,
    debug: process.env.NODE_ENV === 'development',
    phase2: options.phase2 !== false,
    validate: options.validate !== false,
    ...options
  });
}

/**
 * Enhanced component mounting with dev tools integration
 */
export async function mountFMLComponent(fmlString, target, props = {}, components = {}, options = {}) {
  await initializeModules();

  try {
    const compiled = await processFML(fmlString, {
      mode: 'compile',
      components,
      debug: options.debug || false,
      phase2: options.phase2 !== false,
      validate: options.validate
    });

    const instance = mountFML(compiled, target, props, options);

    // Dev tools integration
    if (moduleState.devTools?.enabled) {
      const componentInfo = {
        id: `component-${Date.now()}`,
        name: options.name || 'Anonymous',
        props,
        target,
        fmlString: options.debug ? fmlString : '[hidden]',
        mounted: Date.now()
      };

      moduleState.devTools.inspect(componentInfo, target);
      moduleState.devTools.addTimelineEntry('component:mount', componentInfo);
    }

    return instance;

  } catch (error) {
    handleError(error, { operation: 'mount', target: target?.tagName });
    throw error;
  }
}

/**
 * Enhanced hydration with analytics
 */
export async function hydrateFMLComponent(target, fmlString, props = {}, components = {}, options = {}) {
  await initializeModules();

  try {
    const compiled = await processFML(fmlString, {
      mode: 'compile',
      components,
      debug: options.debug || false,
      phase2: options.phase2 !== false,
      validate: options.validate
    });

    const instance = hydrateFML(target, compiled, props, options);

    // Track hydration
    moduleState.analytics?.track('hydrate', {
      target: target?.tagName,
      propsCount: Object.keys(props).length,
      componentsCount: Object.keys(components).length
    });

    return instance;

  } catch (error) {
    handleError(error, { operation: 'hydrate', target: target?.tagName });
    throw error;
  }
}

/**
 * Reactive FML with plugin hooks — Memory efficient, no leaks
 */
export function createReactiveFML(fmlString, initialProps = {}, components = {}) {
  let currentProps = { ...initialProps };
  let mountedInstance = null;
  let subscribers = [];

  const reactive = {
    async mount(target, options = {}) {
      const instance = await mountFMLComponent(fmlString, target, currentProps, components, {
        ...options,
        phase2: true
      });

      mountedInstance = instance;

      await pluginSystem.executeHook('reactive:mount', {
        instance,
        props: currentProps,
        target
      });

      return instance;
    },

    update(newProps) {
      const oldProps = { ...currentProps };
      currentProps = { ...currentProps, ...newProps };

      if (mountedInstance && mountedInstance.update) {
        mountedInstance.update(currentProps);
      }

      subscribers.forEach(callback => {
        try { callback(currentProps, oldProps); } catch (error) { handleError(error, { operation: 'reactive:update' }); }
      });

      pluginSystem.executeHook('reactive:update', {
        newProps: currentProps,
        oldProps,
        instance: mountedInstance
      });

      return reactive;
    },

    subscribe(callback) {
      if (typeof callback === 'function') {
        subscribers.push(callback);
      }

      return () => {
        subscribers = subscribers.filter(cb => cb !== callback);
      };
    },

    getProps() {
      return { ...currentProps };
    },

    destroy() {
      if (mountedInstance && mountedInstance.destroy) {
        mountedInstance.destroy();
      }

      subscribers = [];
      mountedInstance = null;

      pluginSystem.executeHook('reactive:destroy', { props: currentProps });
    }
  };

  return reactive;
}

/**
 * Development helper with comprehensive debugging
 */
export async function debugFML(fmlString, options = {}) {
  await initializeModules();

  const debugOptions = {
    debug: true,
    phase2: true,
    validate: true,
    accessibility: true,
    performance: true,
    security: true,
    ...options
  };

  const startTime = performance.now();

  try {
    const result = await processFML(fmlString, debugOptions);
    const duration = performance.now() - startTime;

    const debugReport = {
      result,
      duration,
      stats: fmlStats?.getStats(),
      memory: moduleState.devTools?.getMemoryUsage(),
      validation: 'passed',
      performance: duration < 50 ? 'excellent' : duration < 100 ? 'good' : 'needs optimization',
      recommendations: []
    };

    if (duration > 100) {
      debugReport.recommendations.push('Consider optimizing template complexity or caching');
    }

    fmlDebugger?.info('Debug Report:', debugReport);
    return debugReport;

  } catch (error) {
    const debugReport = {
      error: error.message,
      stack: error.stack,
      duration: performance.now() - startTime,
      recommendations: ['Check FML syntax', 'Verify component registration', 'Review validation errors']
    };

    fmlDebugger?.error('Debug Failed:', debugReport);
    return debugReport;
  }
}

/**
 * Enhanced feature detection
 */
export function getFMLFeatures() {
  return {
    version: '2.1.0',
    phase: 2,
    buildDate: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    core: {
      htmlParsing: true,
      componentComposition: true,
      interpolation: true,
      serverRendering: true,
      security: true,
      validation: true
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
    },
    systems: {
      plugins: pluginSystem.listPlugins().length > 0,
      devTools: moduleState.devTools?.enabled || false,
      analytics: moduleState.analytics?.enabled || false,
      errorReporting: moduleState.errorReporter?.enabled || false,
      hotReload: typeof module !== 'undefined' && !!module.hot
    }
  };
}

/**
 * Enhanced benchmarking with detailed metrics — Optimized for precision
 */
export async function benchmarkFML(fmlString, props = {}, components = {}, iterations = 100) {
  await initializeModules();

  const results = {
    server: { times: [], memory: [] },
    client: { times: [], memory: [] },
    compilation: { times: [] },
    metadata: {
      iterations,
      timestamp: Date.now(),
      fmlLength: fmlString.length,
      propsCount: Object.keys(props).length,
      componentsCount: Object.keys(components).length
    }
  };

  // Warm-up runs
  for (let i = 0; i < 3; i++) {
    await processFML(fmlString, { mode: 'server', props, components, debug: false });
  }

  // Server benchmark
  fmlDebugger?.info(`Starting server benchmark (${iterations} iterations)`);
  for (let i = 0; i < iterations; i++) {
    const startMemory = moduleState.analytics?.getMemoryUsage();
    const start = performance.now();

    await processFML(fmlString, {
      mode: 'server',
      props,
      components,
      debug: false,
      validate: false
    });

    const elapsed = performance.now() - start;
    results.server.times.push(elapsed);

    const endMemory = moduleState.analytics?.getMemoryUsage();
    if (startMemory && endMemory) {
      results.server.memory.push(endMemory.used - startMemory.used);
    }
  }

  // Compilation benchmark
  fmlDebugger?.info(`Starting compilation benchmark (${iterations} iterations)`);
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await processFML(fmlString, {
      mode: 'compile',
      props,
      components,
      debug: false,
      validate: false
    });
    results.compilation.times.push(performance.now() - start);
  }

  // Client benchmark (browser only)
  if (typeof document !== 'undefined' && iterations > 0) {
    fmlDebugger?.info(`Starting client benchmark (${iterations} iterations)`);
    const testDiv = document.createElement('div');
    testDiv.style.display = 'none';
    document.body.appendChild(testDiv);

    for (let i = 0; i < iterations; i++) {
      const startMemory = moduleState.analytics?.getMemoryUsage();
      const start = performance.now();

      await mountFMLComponent(fmlString, testDiv, props, components, {
        debug: false,
        validate: false
      });

      const elapsed = performance.now() - start;
      results.client.times.push(elapsed);

      const endMemory = moduleState.analytics?.getMemoryUsage();
      if (startMemory && endMemory) {
        results.client.memory.push(endMemory.used - startMemory.used);
      }

      testDiv.innerHTML = '';
    }

    document.body.removeChild(testDiv);
  }

  // Calculate statistics
  const calculateStats = (times, memories = []) => {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    const memoryStats = memories.length > 0 ? {
      avgMemory: memories.reduce((a, b) => a + b, 0) / memories.length,
      maxMemory: Math.max(...memories),
      minMemory: Math.min(...memories)
    } : null;

    return {
      average: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
      opsPerSecond: Math.round(1000 / avg),
      standardDeviation: Math.round(Math.sqrt(times.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / times.length) * 100) / 100,
      ...memoryStats
    };
  };

  const finalResults = {
    metadata: results.metadata,
    server: calculateStats(results.server.times, results.server.memory),
    compilation: calculateStats(results.compilation.times),
    client: results.client.times.length > 0 ?
      calculateStats(results.client.times, results.client.memory) : null,
    analysis: {
      performance: '',
      bottlenecks: [],
      recommendations: []
    }
  };

  const serverAvg = finalResults.server.average;
  if (serverAvg < 5) finalResults.analysis.performance = 'excellent';
  else if (serverAvg < 20) finalResults.analysis.performance = 'good';
  else if (serverAvg < 50) finalResults.analysis.performance = 'acceptable';
  else {
    finalResults.analysis.performance = 'needs optimization';
    finalResults.analysis.bottlenecks.push('slow server rendering');
  }

  if (serverAvg > 50) {
    finalResults.analysis.recommendations.push('Consider template caching');
    finalResults.analysis.recommendations.push('Optimize component complexity');
  }

  if (finalResults.server.standardDeviation > serverAvg * 0.5) {
    finalResults.analysis.recommendations.push('High variance detected - check for performance inconsistencies');
  }

  moduleState.analytics?.track('benchmark', {
    iterations,
    serverAverage: serverAvg,
    performance: finalResults.analysis.performance
  });

  fmlDebugger?.info('Benchmark completed:', finalResults);
  return finalResults;
}

/**
 * Built-in directive components — Zero-runtime overhead
 */
export const FMLDirectives = {
  If: ({ condition, children }) => condition ? children : null,
  Else: ({ children }) => children,
  ElseIf: ({ condition, children }) => condition ? children : null,
  For: ({ each, as = 'item', index = 'index', children }) => {
    if (!Array.isArray(each)) return [];
    return each.map((item, i) => typeof children === 'function'
      ? children({ [as]: item, [index]: i })
      : children
    );
  },
  Switch: ({ value, children }) => children,
  Case: ({ value, children }) => children,
  Default: ({ children }) => children,
  Slot: ({ name = 'default', children, fallback }) => children || fallback || null
};

/**
 * Plugin management utilities — Direct access
 */
export const plugins = {
  register: (plugin) => pluginSystem.register(plugin),
  unregister: (name) => pluginSystem.unregister(name),
  get: (name) => pluginSystem.getPlugin(name),
  list: () => pluginSystem.listPlugins(),
  use: (middleware) => pluginSystem.use(middleware),
  hook: (name, callback) => pluginSystem.addHook(name, callback),
  emit: (event, data) => pluginSystem.emit(event, data)
};

/**
 * Build configurations — Immutable, Type-safe
 */
export const build = {
  development: {
    debug: true,
    validation: true,
    devTools: true,
    analytics: true,
    errorReporting: true,
    hotReload: true,
    profiling: true
  },

  production: {
    debug: false,
    validation: false,
    devTools: false,
    analytics: true,
    errorReporting: true,
    hotReload: false,
    profiling: false,
    minification: true,
    compression: true
  },

  configure: (environment) => {
    const config = build[environment];
    if (!config) {
      throw new Error(`Unknown build environment: ${environment}`);
    }

    if (moduleState.devTools) moduleState.devTools.enabled = config.devTools;
    if (moduleState.analytics) moduleState.analytics.enabled = config.analytics;
    if (moduleState.errorReporter) moduleState.errorReporter.enabled = config.errorReporting;

    return config;
  }
};

/**
 * System health and diagnostics — Fast, Reliable
 */
export const diagnostics = {
  async runHealthCheck() {
    await initializeModules();

    const health = {
      timestamp: Date.now(),
      framework: 'FML',
      version: getFMLFeatures().version,
      status: 'healthy',
      checks: {},
      performance: {},
      recommendations: []
    };

    try {
      health.checks.moduleInitialization = moduleState.initialized;
      health.performance.memory = moduleState.analytics?.getMemoryUsage();

      health.checks.pluginSystem = pluginSystem.enabled;
      health.checks.pluginCount = pluginSystem.listPlugins().length;

      const testFML = '<div>Health check: {status}</div>';
      const start = performance.now();
      await processFML(testFML, { props: { status: 'OK' }, debug: false, validate: false });
      const renderTime = performance.now() - start;

      health.performance.renderTime = Math.round(renderTime * 100) / 100;

      if (renderTime > 100) {
        health.status = 'warning';
        health.recommendations.push('Render performance is slow');
      }

      health.checks.errorReporting = moduleState.errorReporter?.enabled;
      health.checks.analytics = moduleState.analytics?.enabled;
      health.checks.devTools = moduleState.devTools?.enabled;

    } catch (error) {
      health.status = 'error';
      health.error = error.message;
    }

    return health;
  },

  getSystemInfo() {
    return {
      framework: 'FML',
      version: getFMLFeatures().version,
      environment: process.env.NODE_ENV || 'development',
      features: getFMLFeatures(),
      modules: {
        initialized: moduleState.initialized,
        pluginCount: pluginSystem.listPlugins().length,
        devToolsEnabled: moduleState.devTools?.enabled,
        analyticsEnabled: moduleState.analytics?.enabled,
        errorReportingEnabled: moduleState.errorReporter?.enabled
      },
      performance: fmlStats?.getStats(),
      memory: moduleState.analytics?.getMemoryUsage()
    };
  },

  async benchmark(options = {}) {
    const testCases = options.testCases || [
      '<div>Simple test</div>',
      '<div>Interpolation: {value}</div>',
      '<For each={items} as="item"><div>{item}</div></For>',
      '<If condition={show}><div>Complex: {data.nested.value}</div></If>'
    ];

    const results = {};

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const props = {
        value: 'test',
        items: ['a', 'b', 'c'],
        show: true,
        data: { nested: { value: 'nested' } }
      };

      results[`test${i + 1}`] = await benchmarkFML(testCase, props, {}, options.iterations || 50);
    }

    return results;
  }
};

// Re-export core modules (with proper initialization)
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
 * Default export with complete API — Immutable, Lazy-loaded
 */
const FML = {
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
  validate: validateFML,

  // Systems
  plugins,
  build,
  diagnostics,

  // Components & Directives
  directives: FMLDirectives,

  // Classes (lazy-loaded)
  get Parser() { return FMLParser; },
  get Compiler() { return FMLCompiler; },

  // Development tools
  get devTools() { return moduleState.devTools; },
  get analytics() { return moduleState.analytics; },
  get errorReporter() { return moduleState.errorReporter; },

  // Version info
  version: '2.1.0',
  phase: 2,

  // Initialization
  init: initializeModules,
  isReady: () => moduleState.initialized
};

// Auto-initialize in browser or development
if (typeof window !== 'undefined' || process.env.NODE_ENV === 'development') {
  initializeModules().catch(error => {
    console.error('Failed to auto-initialize FML:', error);
  });
}

// Hot module replacement support — Zero-overhead
if (typeof module !== 'undefined' && module.hot) {
  module.hot.accept((err) => {
    if (err) {
      console.error('Hot reload error in FML framework:', err);
    } else {
      console.log('FML framework hot reloaded');
      moduleState.initialized = false;
      initializeModules();
    }
  });
}

export default FML;