// src/fml/renderer/server.js
import { escapeHtml, escapeAttribute } from '../utils/escape.js';
import { SELF_CLOSING_TAGS, resolveExpression } from '../compiler/compiler.js';

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

class ServerRenderer {
  constructor(props = {}, options = {}) {
    this.props = props;
    this.debug = !!options.debug;
    this.phase2 = options.phase2 !== false; // Enabled by default
    this.componentStack = [];
    this.contextStack = []; // For nested scopes: For, If, etc.
  }

  /**
   * Main render dispatch
   */
  render(node) {
    if (!node) return '';

    try {
      switch (node.type) {
        case 'fragment':
          return this.renderFragment(node);
        case 'element':
          return this.renderElement(node);
        case 'component':
          return this.renderComponent(node);
        case 'text':
          return this.renderText(node);
        case 'interpolation':
          return this.renderInterpolation(node);

        // Phase 2: Control Flow
        case 'if':
          return this.phase2 ? this.renderIf(node) : '';
        case 'else':
          return this.phase2 ? this.renderElse(node) : '';
        case 'else_if':
          return this.phase2 ? this.renderElseIf(node) : '';
        case 'for':
          return this.phase2 ? this.renderFor(node) : '';
        case 'switch':
          return this.phase2 ? this.renderSwitch(node) : '';
        case 'case':
          return this.phase2 ? this.renderCase(node) : '';
        case 'default':
          return this.phase2 ? this.renderDefault(node) : '';
        case 'slot':
          return this.phase2 ? this.renderSlot(node) : '';

        default:
          if (this.debug) {
            console.warn(`[Renderer] Unknown node type: ${node.type}`);
          }
          return '';
      }
    } catch (error) {
      if (this.debug) {
        console.error(`[Renderer] Render error in node type '${node.type}':`, error);
      }
      return this.debug
        ? `<!-- Render error: ${error.message} -->`
        : '';
    }
  }

  /**
   * Render fragment (root or group)
   */
  renderFragment(node) {
    return (node.children || [])
      .map(child => this.render(child))
      .join('');
  }

  /**
   * Render HTML element with attributes and children
   */
  renderElement(node) {
    const { tagName, attributes, children } = node;
    const attrs = this.renderAttributes(attributes);
    const content = this.renderChildren(children);

    if (this.isSelfClosingTag(tagName)) {
      return `<${tagName}${attrs} />`;
    }
    return `<${tagName}${attrs}>${content}</${tagName}>`;
  }

  /**
   * Render component with evaluated props
   */
  renderComponent(node) {
    const { name, component, props: rawProps, children } = node;

    if (!component || typeof component !== 'function') {
      throw new Error(`Component "${name}" is not a valid function`);
    }

    if (this.componentStack.includes(name)) {
      throw new Error(`Circular component reference detected: ${name}`);
    }

    this.componentStack.push(name);
    let result = '';

    try {
      const evaluatedProps = this.evaluateProps(rawProps);

      // Pass rendered children as `children` prop
      if (children && children.length > 0) {
        evaluatedProps.children = this.renderChildren(children);
      }

      result = component(evaluatedProps);
      return typeof result === 'string' ? result : String(result || '');
    } catch (error) {
      console.error(`[Renderer] Failed to render component <${name}>:`, error);
      return this.debug
        ? `<div class="fml-error" data-component="${name}">❌ ${name}</div>`
        : '';
    } finally {
      this.componentStack.pop();
    }
  }

  /**
   * Render plain text with HTML escaping
   */
  renderText(node) {
    return escapeHtml(String(node.content));
  }

  /**
   * Render interpolation: {expression}
   */
  renderInterpolation(node) {
    try {
      const value = resolveExpression(node.compiled, this.getCurrentContext());
      return escapeHtml(String(value ?? ''));
    } catch (error) {
      if (this.debug) {
        console.error(`[Renderer] Interpolation error:`, error);
        return `<!-- Interpolation error: ${error.message} -->`;
      }
      return '';
    }
  }

  // === Phase 2: Control Flow Rendering ===

  /**
   * Render <If> and handle <ElseIf>/<Else> chain
   */
  renderIf(node) {
    try {
      const condition = resolveExpression(node.condition, this.getCurrentContext());
      if (condition) {
        return this.renderChildren(node.children);
      }
      // Defer to parent or conditional chain
      return '';
    } catch (error) {
      if (this.debug) {
        console.error(`[Renderer] If directive error:`, error);
      }
      return '';
    }
  }

  /**
   * Render <Else> block
   */
  renderElse(node) {
    return this.renderChildren(node.children);
  }

  /**
   * Render <ElseIf> block
   */
  renderElseIf(node) {
    try {
      const condition = resolveExpression(node.condition, this.getCurrentContext());
      return condition ? this.renderChildren(node.children) : '';
    } catch (error) {
      if (this.debug) {
        console.error(`[Renderer] ElseIf error:`, error);
      }
      return '';
    }
  }

  /**
   * Render <For> loop
   */
  renderFor(node) {
    try {
      const iterable = resolveExpression(node.iterable, this.getCurrentContext());
      const items = Array.isArray(iterable) || typeof iterable === 'string'
        ? iterable
        : Object.values(iterable || {});

      return Array.from(items).map((item, index) => {
        const loopContext = {
          ...this.getCurrentContext(),
          [node.itemName]: item,
          [node.indexName || 'index']: index
        };

        this.pushContext(loopContext);
        try {
          return this.renderChildren(node.children);
        } finally {
          this.popContext();
        }
      }).join('');
    } catch (error) {
      if (this.debug) {
        console.error(`[Renderer] For directive error:`, error);
      }
      return '';
    }
  }

  /**
   * Render <Switch> block
   */
  renderSwitch(node) {
    try {
      const switchValue = resolveExpression(node.value, this.getCurrentContext());
      let matched = false;

      for (const child of node.children) {
        if (child.type === 'case' && !matched) {
          const caseValue = resolveExpression(child.value, this.getCurrentContext());
          if (switchValue === caseValue) {
            matched = true;
            return this.renderChildren(child.children);
          }
        } else if (child.type === 'default' && !matched) {
          return this.renderChildren(child.children);
        }
      }
      return '';
    } catch (error) {
      if (this.debug) {
        console.error(`[Renderer] Switch directive error:`, error);
      }
      return '';
    }
  }

  /**
   * Render <Case> block (handled by Switch)
   */
  renderCase(node) {
    return this.renderChildren(node.children);
  }

  /**
   * Render <Default> block (handled by Switch)
   */
  renderDefault(node) {
    return this.renderChildren(node.children);
  }

  /**
   * Render <Slot> (default content only on SSR)
   */
  renderSlot(node) {
    return this.renderChildren(node.children);
  }

  // === Utilities ===

  /**
   * Render list of children
   */
  renderChildren(children = []) {
    return children
      .map(child => this.render(child))
      .join('');
  }

  /**
   * Render attributes map to HTML string
   */
  renderAttributes(attributes = {}) {
    const parts = [];

    for (const [name, attr] of Object.entries(attributes)) {
      try {
        if (attr.type === 'static') {
          const val = escapeAttribute(String(attr.value));
          parts.push(attr.value === true ? name : `${name}="${val}"`);
        } else if (attr.type === 'dynamic') {
          const value = resolveExpression(attr.compiled, this.getCurrentContext());
          if (value != null && value !== false) {
            const val = escapeAttribute(String(value));
            parts.push(value === true ? name : `${name}="${val}"`);
          }
        } else if (this.phase2 && attr.type === 'event') {
          // Add debug hydration hints
          if (this.debug) {
            const eventName = name.replace(/^on/, '').toLowerCase();
            parts.push(`data-fml-on-${eventName}="${escapeHtml(attr.expression)}"`);
          }
        }
      } catch (error) {
        if (this.debug) {
          console.error(`[Renderer] Attribute error for "${name}":`, error);
        }
      }
    }

    return parts.length ? ' ' + parts.join(' ') : '';
  }

  /**
   * Check if tag is self-closing
   */
  isSelfClosingTag(tagName) {
    return SELF_CLOSING_TAGS.has((tagName || '').toLowerCase());
  }

  /**
   * Evaluate dynamic props
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
        if (this.debug) {
          console.error(`[Renderer] Prop evaluation failed for "${name}":`, error);
        }
        evaluated[name] = undefined;
      }
    }

    return evaluated;
  }

  /**
   * Context stack management for nested scopes
   */
  getCurrentContext() {
    if (this.contextStack.length === 0) return this.props;
    return this.contextStack.reduce(
      (ctx, layer) => ({ ...ctx, ...layer }),
      { ...this.props }
    );
  }

  pushContext(ctx) {
    this.contextStack.push(ctx);
  }

  popContext() {
    if (this.contextStack.length > 0) {
      this.contextStack.pop();
    }
  }

  /**
   * Get rendering stats (debug)
   */
  getStats() {
    return {
      componentStackDepth: this.componentStack.length,
      contextStackDepth: this.contextStack.length,
      propsKeys: Object.keys(this.props),
      debug: this.debug,
      phase2: this.phase2
    };
  }
}

/**
 * Phase 2: Render conditional chain (If -> ElseIf -> Else)
 * @private Used by parent renderer to handle nested conditionals
 */
export function renderConditionalChain(nodes, renderer) {
  const context = renderer.getCurrentContext();
  for (const node of nodes) {
    if (node.type === 'if') {
      const condition = resolveExpression(node.condition, context);
      if (condition) return renderer.renderChildren(node.children);
    } else if (node.type === 'else_if') {
      const condition = resolveExpression(node.condition, context);
      if (condition) return renderer.renderChildren(node.children);
    } else if (node.type === 'else') {
      return renderer.renderChildren(node.children);
    }
  }
  return '';
}