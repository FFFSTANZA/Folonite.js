// src/fml/renderer/server.js

import { escapeHtml, escapeAttribute } from '../utils/escape.js';
import { SELF_CLOSING_TAGS, resolveExpression } from '../compiler/compiler.js';
import { Readable, Transform } from 'stream';
import { performance } from 'perf_hooks';

/**
 * Render a compiled FML tree on the server
 * @param {Object} compiled - Compiled FML output from FMLCompiler
 * @param {Object} props - Root component props/context
 * @param {Object} options - Renderer options
 * @returns {string} Rendered HTML string
 */
export function renderServer(compiled, props = {}, options = {}) {
  const renderer = new ServerRenderer(props, options);
  return renderer.render(compiled);
}

/**
 * Create a streaming renderer for large documents
 * @param {Object} compiled - Compiled FML output
 * @param {Object} props - Props/context
 * @param {Object} options - Stream options
 * @returns {ReadableStream} Streaming HTML output
 */
export function renderServerStream(compiled, props = {}, options = {}) {
  const renderer = new ServerRenderer(props, { ...options, streaming: true });
  return renderer.createStream(compiled);
}

/**
 * Enhanced Server Renderer with performance monitoring and streaming
 */
class ServerRenderer {
  constructor(props = {}, options = {}) {
    this.props = props;
    this.debug = !!options.debug;
    this.phase2 = options.phase2 !== false;
    this.streaming = !!options.streaming;
    this.validateProps = options.validateProps !== false;
    this.componentStack = [];
    this.contextStack = [];
    
    // Performance monitoring
    this.performance = {
      startTime: performance.now(),
      renderTimes: new Map(),
      componentCounts: new Map(),
      totalNodes: 0,
      maxDepth: 0,
      currentDepth: 0,
      memorySnapshots: [],
      slowComponents: new Set(),
      slowThreshold: options.slowThreshold || 5 // ms
    };
    
    // Memory monitoring
    this.memory = {
      enabled: options.monitorMemory !== false,
      checkInterval: options.memoryCheckInterval || 100,
      nodeCount: 0,
      peakMemory: 0
    };
    
    // Error boundaries
    this.errorBoundaries = [];
    this.maxErrors = options.maxErrors || 10;
    this.errorCount = 0;
    
    // Context debugging
    this.contextDebug = {
      enabled: this.debug && options.debugContext,
      snapshots: [],
      maxSnapshots: 50
    };
    
    if (this.debug) {
      this.logDebug('ServerRenderer initialized', {
        phase2: this.phase2,
        streaming: this.streaming,
        validateProps: this.validateProps,
        memoryMonitoring: this.memory.enabled
      });
    }
  }

  /**
   * Main render dispatch with performance tracking
   */
  render(node) {
    if (!node) return '';

    const startTime = performance.now();
    this.performance.currentDepth++;
    this.performance.maxDepth = Math.max(this.performance.maxDepth, this.performance.currentDepth);
    this.performance.totalNodes++;
    this.memory.nodeCount++;

    // Memory monitoring
    if (this.memory.enabled && this.memory.nodeCount % this.memory.checkInterval === 0) {
      this.checkMemoryUsage();
    }

    try {
      let result = '';
      
      switch (node.type) {
        case 'fragment':
          result = this.renderFragment(node);
          break;
        case 'element':
          result = this.renderElement(node);
          break;
        case 'component':
          result = this.renderComponent(node);
          break;
        case 'text':
          result = this.renderText(node);
          break;
        case 'interpolation':
          result = this.renderInterpolation(node);
          break;

        // Phase 2: Enhanced Control Flow
        case 'if':
          result = this.phase2 ? this.renderIf(node) : '';
          break;
        case 'else':
          result = this.phase2 ? this.renderElse(node) : '';
          break;
        case 'elseif':
        case 'else_if':
          result = this.phase2 ? this.renderElseIf(node) : '';
          break;
        case 'for':
          result = this.phase2 ? this.renderFor(node) : '';
          break;
        case 'switch':
          result = this.phase2 ? this.renderSwitch(node) : '';
          break;
        case 'case':
          result = this.phase2 ? this.renderCase(node) : '';
          break;
        case 'default':
          result = this.phase2 ? this.renderDefault(node) : '';
          break;
        case 'slot':
          result = this.phase2 ? this.renderSlot(node) : '';
          break;

        default:
          this.logWarn(`Unknown node type: ${node.type}`);
          return '';
      }

      // Track render time
      const renderTime = performance.now() - startTime;
      this.trackRenderTime(node.type, renderTime);

      return result;

    } catch (error) {
      this.handleRenderError(error, node);
      return this.debug 
        ? `<!-- Render error: ${error.message} -->` 
        : '';
    } finally {
      this.performance.currentDepth--;
    }
  }

  /**
   * Create streaming renderer for large documents
   */
  createStream(compiled) {
    const self = this;
    let chunkCount = 0;
    
    return new Readable({
      objectMode: false,
      read() {
        try {
          if (chunkCount === 0) {
            // Stream HTML document header
            this.push('<!DOCTYPE html>\n');
            this.push('<html>\n<head>\n');
            this.push('<meta charset="UTF-8">\n');
            this.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">\n');
            if (self.debug) {
              this.push(`<!-- FML Streaming Renderer - Start ${new Date().toISOString()} -->\n`);
            }
            this.push('</head>\n<body>\n');
          }

          if (chunkCount === 1) {
            // Stream main content in chunks
            const content = self.renderWithChunking(compiled, 1000); // 1KB chunks
            for (const chunk of content) {
              this.push(chunk);
            }
          }

          if (chunkCount === 2) {
            // Stream footer and performance stats
            this.push('\n</body>\n');
            
            if (self.debug) {
              const stats = self.getPerformanceStats();
              this.push(`<!-- Performance Stats: ${JSON.stringify(stats)} -->\n`);
            }
            
            this.push('</html>');
            this.push(null); // End stream
          }

          chunkCount++;
        } catch (error) {
          this.emit('error', error);
        }
      }
    });
  }

  /**
   * Render content in chunks for streaming
   */
  renderWithChunking(node, chunkSize = 1000) {
    const chunks = [];
    let currentChunk = '';
    
    const addToChunk = (content) => {
      currentChunk += content;
      if (currentChunk.length >= chunkSize) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
    };

    // Simplified chunked rendering
    const renderChunked = (n) => {
      if (!n) return;
      
      if (n.type === 'fragment') {
        (n.children || []).forEach(renderChunked);
      } else {
        const content = this.render(n);
        addToChunk(content);
      }
    };

    renderChunked(node);
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * Enhanced fragment rendering with error boundaries
   */
  renderFragment(node) {
    const children = node.children || [];
    const results = [];
    
    for (let i = 0; i < children.length; i++) {
      try {
        const result = this.render(children[i]);
        if (result) results.push(result);
      } catch (error) {
        this.handleRenderError(error, children[i], `Fragment child ${i}`);
        if (this.errorCount > this.maxErrors) {
          throw new Error(`Too many render errors (${this.errorCount}). Stopping.`);
        }
      }
    }
    
    return results.join('');
  }

  /**
   * Enhanced element rendering with validation
   */
  renderElement(node) {
    const { tagName, attributes, children } = node;
    
    if (!tagName || typeof tagName !== 'string') {
      throw new Error('Invalid element: tagName must be a non-empty string');
    }

    const attrs = this.renderAttributes(attributes);
    const content = this.renderChildren(children);

    if (this.isSelfClosingTag(tagName)) {
      return `<${tagName}${attrs} />`;
    }
    return `<${tagName}${attrs}>${content}</${tagName}>`;
  }

  /**
   * Enhanced component rendering with prop validation and isolation
   */
  renderComponent(node) {
    const { name, component, props: rawProps, children } = node;
    const componentStartTime = performance.now();

    if (!component || typeof component !== 'function') {
      throw new Error(`Component "${name}" is not a valid function`);
    }

    // Circular reference detection
    if (this.componentStack.includes(name)) {
      throw new Error(`Circular component reference detected: ${this.componentStack.join(' -> ')} -> ${name}`);
    }

    // Context isolation for components
    const isolatedContext = this.createIsolatedContext();
    this.componentStack.push(name);
    this.pushContext(isolatedContext);

    try {
      const evaluatedProps = this.evaluateProps(rawProps);
      
      // Prop validation
      if (this.validateProps) {
        this.validateComponentProps(name, evaluatedProps);
      }

      // Pass rendered children as `children` prop
      if (children && children.length > 0) {
        evaluatedProps.children = this.renderChildren(children);
      }

      const result = component(evaluatedProps);
      const output = typeof result === 'string' ? result : String(result || '');
      
      // Track component performance
      const renderTime = performance.now() - componentStartTime;
      this.trackComponentPerformance(name, renderTime);
      
      return output;

    } catch (error) {
      this.logError(`Failed to render component <${name}>:`, error);
      return this.debug
        ? `<div class="fml-error" data-component="${name}" data-error="${escapeAttribute(error.message)}">❌ ${name}</div>`
        : '';
    } finally {
      this.popContext();
      this.componentStack.pop();
    }
  }

  /**
   * Enhanced Phase 2: If directive with context debugging
   */
  renderIf(node) {
    try {
      this.debugContext('If directive start');
      const condition = resolveExpression(node.condition, this.getCurrentContext());
      
      if (this.debug) {
        this.logDebug(`If condition: ${JSON.stringify(node.condition)} -> ${condition}`);
      }
      
      if (condition) {
        return this.renderChildren(node.children);
      }
      
      // Look for Else/ElseIf siblings
      return this.renderConditionalChain(node);
      
    } catch (error) {
      this.logError('If directive error:', error);
      return '';
    }
  }

  /**
   * Enhanced conditional chain rendering
   */
  renderConditionalChain(ifNode) {
    // This would be handled by the parser to create a proper conditional chain
    // For now, just render the if block
    return '';
  }

  /**
   * Enhanced For directive with performance monitoring
   */
  renderFor(node) {
    const startTime = performance.now();
    
    try {
      this.debugContext('For directive start');
      
      const iterable = resolveExpression(node.items || node.each, this.getCurrentContext());
      const itemVar = node.itemVar || node.as || 'item';
      const indexVar = node.indexVar || node.index || 'index';
      
      if (!iterable) {
        this.logWarn('For directive: iterable is null or undefined');
        return '';
      }

      const items = Array.isArray(iterable) 
        ? iterable
        : typeof iterable === 'string'
          ? Array.from(iterable)
          : Object.values(iterable);

      if (this.debug) {
        this.logDebug(`For loop: ${items.length} items, itemVar: ${itemVar}, indexVar: ${indexVar}`);
      }

      const results = [];
      
      for (let i = 0; i < items.length; i++) {
        const loopContext = {
          [itemVar]: items[i],
          [indexVar]: i,
          // Preserve parent context
          ...this.getCurrentContext()
        };

        this.pushContext(loopContext);
        this.debugContext(`For iteration ${i}`, loopContext);
        
        try {
          const itemResult = this.renderChildren(node.body || node.children);
          if (itemResult) results.push(itemResult);
        } finally {
          this.popContext();
        }
      }

      const renderTime = performance.now() - startTime;
      if (renderTime > this.performance.slowThreshold * items.length) {
        this.logWarn(`Slow For loop detected: ${renderTime.toFixed(2)}ms for ${items.length} items`);
      }

      return results.join('');
      
    } catch (error) {
      this.logError('For directive error:', error);
      return '';
    }
  }

  /**
   * Enhanced Switch directive
   */
  renderSwitch(node) {
    try {
      this.debugContext('Switch directive start');
      
      const switchValue = resolveExpression(node.value, this.getCurrentContext());
      let matched = false;

      if (this.debug) {
        this.logDebug(`Switch value: ${JSON.stringify(switchValue)}`);
      }

      for (const child of (node.cases || node.children || [])) {
        if (child.type === 'case' && !matched) {
          const caseValue = resolveExpression(child.value, this.getCurrentContext());
          if (switchValue === caseValue) {
            matched = true;
            return this.renderChildren(child.body || child.children);
          }
        } else if (child.type === 'default' && !matched) {
          return this.renderChildren(child.body || child.children);
        }
      }
      
      return '';
      
    } catch (error) {
      this.logError('Switch directive error:', error);
      return '';
    }
  }

  /**
   * Render interpolation with error handling
   */
  renderInterpolation(node) {
    try {
      const value = resolveExpression(node.compiled, this.getCurrentContext());
      const result = value ?? '';
      
      if (this.debug && typeof value === 'object') {
        this.logDebug(`Interpolation rendered object: ${JSON.stringify(value)}`);
      }
      
      return escapeHtml(String(result));
    } catch (error) {
      this.logError('Interpolation error:', error);
      return this.debug 
        ? `<!-- Interpolation error: ${error.message} -->`
        : '';
    }
  }

  // Simple implementations for other directives
  renderElse(node) {
    return this.renderChildren(node.children);
  }

  renderElseIf(node) {
    try {
      const condition = resolveExpression(node.condition, this.getCurrentContext());
      return condition ? this.renderChildren(node.children) : '';
    } catch (error) {
      this.logError('ElseIf error:', error);
      return '';
    }
  }

  renderCase(node) {
    return this.renderChildren(node.children);
  }

  renderDefault(node) {
    return this.renderChildren(node.children);
  }

  renderSlot(node) {
    return this.renderChildren(node.children);
  }

  renderText(node) {
    return escapeHtml(String(node.content || ''));
  }

  /**
   * Render children with error boundaries
   */
  renderChildren(children = []) {
    if (!Array.isArray(children)) {
      this.logWarn('renderChildren: children is not an array');
      return '';
    }

    return children
      .map((child, index) => {
        try {
          return this.render(child);
        } catch (error) {
          this.handleRenderError(error, child, `Child ${index}`);
          return '';
        }
      })
      .join('');
  }

  /**
   * Enhanced attribute rendering with validation
   */
  renderAttributes(attributes = {}) {
    if (!attributes || typeof attributes !== 'object') {
      return '';
    }

    const parts = [];

    for (const [name, attr] of Object.entries(attributes)) {
      try {
        if (!name || typeof name !== 'string') {
          this.logWarn(`Invalid attribute name: ${name}`);
          continue;
        }

        if (attr.type === 'static') {
          const val = escapeAttribute(String(attr.value ?? ''));
          parts.push(attr.value === true ? name : `${name}="${val}"`);
        } else if (attr.type === 'dynamic') {
          const value = resolveExpression(attr.compiled, this.getCurrentContext());
          if (value != null && value !== false) {
            const val = escapeAttribute(String(value));
            parts.push(value === true ? name : `${name}="${val}"`);
          }
        } else if (this.phase2 && attr.type === 'event') {
          // Add hydration hints for client-side event binding
          if (this.debug) {
            const eventName = name.replace(/^on/, '').toLowerCase();
            parts.push(`data-fml-on-${eventName}="${escapeAttribute(attr.expression || '')}"`);
          }
        }
      } catch (error) {
        this.logError(`Attribute error for "${name}":`, error);
      }
    }

    return parts.length ? ' ' + parts.join(' ') : '';
  }

  /**
   * Enhanced prop evaluation with validation
   */
  evaluateProps(props = {}) {
    const evaluated = {};

    for (const [name, prop] of Object.entries(props)) {
      try {
        if (prop.type === 'static') {
          evaluated[name] = prop.value;
        } else if (prop.type === 'dynamic') {
          evaluated[name] = resolveExpression(prop.compiled, this.getCurrentContext());
        } else if (this.phase2 && prop.type === 'event') {
          evaluated[name] = prop.compiled; // For hydration
        }
      } catch (error) {
        this.logError(`Prop evaluation failed for "${name}":`, error);
        evaluated[name] = undefined;
      }
    }

    return evaluated;
  }

  /**
   * Validate component props
   */
  validateComponentProps(componentName, props) {
    if (!props || typeof props !== 'object') {
      this.logWarn(`Component "${componentName}": props is not an object`);
      return;
    }

    // Check for common prop issues
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'function' && !key.startsWith('on')) {
        this.logWarn(`Component "${componentName}": prop "${key}" is a function but doesn't look like an event handler`);
      }
      
      if (value === null) {
        this.logDebug(`Component "${componentName}": prop "${key}" is null`);
      }
    }
  }

  /**
   * Create isolated context for component rendering
   */
  createIsolatedContext() {
    // Create a clean context that doesn't leak parent component state
    return {
      ...this.props, // Global props always available
      // Component-specific context isolation could be added here
    };
  }

  /**
   * Context stack management with debugging
   */
  getCurrentContext() {
    if (this.contextStack.length === 0) return this.props;
    
    const context = this.contextStack.reduce(
      (ctx, layer) => ({ ...ctx, ...layer }),
      { ...this.props }
    );
    
    return context;
  }

  pushContext(ctx) {
    this.contextStack.push(ctx);
    this.debugContext('Context pushed', ctx);
  }

  popContext() {
    if (this.contextStack.length > 0) {
      const popped = this.contextStack.pop();
      this.debugContext('Context popped', popped);
      return popped;
    }
  }

  /**
   * Context debugging
   */
  debugContext(action, context = null) {
    if (!this.contextDebug.enabled) return;
    
    const snapshot = {
      action,
      timestamp: performance.now(),
      stackDepth: this.contextStack.length,
      componentStack: [...this.componentStack],
      context: context || this.getCurrentContext()
    };
    
    this.contextDebug.snapshots.push(snapshot);
    
    // Keep only recent snapshots
    if (this.contextDebug.snapshots.length > this.contextDebug.maxSnapshots) {
      this.contextDebug.snapshots.shift();
    }
    
    if (this.debug) {
      this.logDebug(`Context Debug: ${action}`, {
        stackDepth: snapshot.stackDepth,
        componentStack: snapshot.componentStack
      });
    }
  }

  /**
   * Performance tracking
   */
  trackRenderTime(nodeType, time) {
    if (!this.performance.renderTimes.has(nodeType)) {
      this.performance.renderTimes.set(nodeType, []);
    }
    this.performance.renderTimes.get(nodeType).push(time);
    
    if (time > this.performance.slowThreshold) {
      this.performance.slowComponents.add(nodeType);
      if (this.debug) {
        this.logWarn(`Slow render detected: ${nodeType} took ${time.toFixed(2)}ms`);
      }
    }
  }

  trackComponentPerformance(name, time) {
    if (!this.performance.componentCounts.has(name)) {
      this.performance.componentCounts.set(name, { count: 0, totalTime: 0 });
    }
    
    const stats = this.performance.componentCounts.get(name);
    stats.count++;
    stats.totalTime += time;
    
    if (time > this.performance.slowThreshold) {
      this.logWarn(`Slow component: ${name} took ${time.toFixed(2)}ms`);
    }
  }

  /**
   * Memory monitoring
   */
  checkMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      const usedMB = usage.heapUsed / 1024 / 1024;
      
      this.memory.peakMemory = Math.max(this.memory.peakMemory, usedMB);
      this.performance.memorySnapshots.push({
        timestamp: performance.now(),
        heapUsed: usedMB,
        nodeCount: this.memory.nodeCount
      });
      
      // Keep only recent snapshots
      if (this.performance.memorySnapshots.length > 100) {
        this.performance.memorySnapshots.shift();
      }
      
      // Warn if memory usage is high
      if (usedMB > 100) { // 100MB threshold
        this.logWarn(`High memory usage: ${usedMB.toFixed(2)}MB (${this.memory.nodeCount} nodes)`);
      }
    }
  }

  /**
   * Error handling
   */
  handleRenderError(error, node, context = '') {
    this.errorCount++;
    
    const errorInfo = {
      message: error.message,
      nodeType: node?.type,
      context,
      componentStack: [...this.componentStack],
      contextStackDepth: this.contextStack.length
    };
    
    this.logError('Render error:', errorInfo);
    
    if (this.debug) {
      console.error('Full error details:', error);
      console.error('Node that caused error:', node);
    }
  }

  /**
   * Logging utilities
   */
  logDebug(message, data = null) {
    if (this.debug) {
      console.log(`[FML-Server] ${message}`, data || '');
    }
  }

  logWarn(message, data = null) {
    console.warn(`[FML-Server] ${message}`, data || '');
  }

  logError(message, error) {
    console.error(`[FML-Server] ${message}`, error);
  }

  /**
   * Utility methods
   */
  isSelfClosingTag(tagName) {
    return SELF_CLOSING_TAGS.has((tagName || '').toLowerCase());
  }

  /**
   * Get comprehensive performance stats
   */
  getPerformanceStats() {
    const totalTime = performance.now() - this.performance.startTime;
    
    const stats = {
      totalRenderTime: totalTime.toFixed(2) + 'ms',
      totalNodes: this.performance.totalNodes,
      maxDepth: this.performance.maxDepth,
      errorCount: this.errorCount,
      memoryPeak: this.memory.peakMemory.toFixed(2) + 'MB',
      averageTimePerNode: (totalTime / this.performance.totalNodes).toFixed(3) + 'ms',
      
      nodeTypeStats: {},
      componentStats: {},
      slowComponents: Array.from(this.performance.slowComponents),
      
      contextStats: {
        maxStackDepth: Math.max(...this.contextDebug.snapshots.map(s => s.stackDepth), 0),
        totalContextOperations: this.contextDebug.snapshots.length
      }
    };
    
    // Calculate node type averages
    for (const [type, times] of this.performance.renderTimes.entries()) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      stats.nodeTypeStats[type] = {
        count: times.length,
        averageTime: avg.toFixed(3) + 'ms',
        totalTime: times.reduce((a, b) => a + b, 0).toFixed(2) + 'ms'
      };
    }
    
    // Calculate component averages
    for (const [name, data] of this.performance.componentCounts.entries()) {
      stats.componentStats[name] = {
        count: data.count,
        averageTime: (data.totalTime / data.count).toFixed(3) + 'ms',
        totalTime: data.totalTime.toFixed(2) + 'ms'
      };
    }
    
    return stats;
  }

  /**
   * Get memory usage report
   */
  getMemoryReport() {
    return {
      peakMemory: this.memory.peakMemory + 'MB',
      totalNodes: this.memory.nodeCount,
      memoryPerNode: (this.memory.peakMemory / this.memory.nodeCount * 1024).toFixed(2) + 'KB',
      snapshots: this.performance.memorySnapshots.slice(-10) // Last 10 snapshots
    };
  }

  /**
   * Get context debugging report
   */
  getContextReport() {
    if (!this.contextDebug.enabled) {
      return { message: 'Context debugging not enabled' };
    }
    
    return {
      totalOperations: this.contextDebug.snapshots.length,
      recentOperations: this.contextDebug.snapshots.slice(-20),
      maxStackDepth: Math.max(...this.contextDebug.snapshots.map(s => s.stackDepth), 0)
    };
  }
}

/**
 * Utility function for rendering conditional chains
 */
export function renderConditionalChain(nodes, renderer) {
  for (const node of nodes) {
    if (node.type === 'if') {
      const condition = resolveExpression(node.condition, renderer.getCurrentContext());
      if (condition) return renderer.renderChildren(node.children);
    } else if (node.type === 'elseif' || node.type === 'else_if') {
      const condition = resolveExpression(node.condition, renderer.getCurrentContext());
      if (condition) return renderer.renderChildren(node.children);
    } else if (node.type === 'else') {
      return renderer.renderChildren(node.children);
    }
  }
  return '';
}

/**
 * Create a performance monitoring wrapper
 */
export function createPerformanceMonitor(options = {}) {
  return {
    enabled: options.enabled !== false,
    slowThreshold: options.slowThreshold || 5,
    memoryThreshold: options.memoryThreshold || 100,
    maxErrors: options.maxErrors || 10,
    
    wrapRenderer: (renderer) => {
      if (!this.enabled) return renderer;
      
      const originalRender = renderer.render.bind(renderer);
      renderer.render = function(node) {
        const start = performance.now();
        try {
          const result = originalRender(node);
          const time = performance.now() - start;
          
          if (time > this.slowThreshold) {
            console.warn(`Slow render: ${node.type} (${time.toFixed(2)}ms)`);
          }
          
          return result;
        } catch (error) {
          console.error(`Render error in ${node.type}:`, error);
          throw error;
        }
      };
      
      return renderer;
    }
  };
}

export default {
  renderServer,
  renderServerStream,
  ServerRenderer,
  createPerformanceMonitor,
  renderConditionalChain
};