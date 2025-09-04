// src/fml/renderer/server.js

import { escapeHtml } from '../utils/escape.js';

export function renderServer(compiled, props = {}, options = {}) {
  const renderer = new ServerRenderer(props, options);
  return renderer.render(compiled);
}

class ServerRenderer {
  constructor(props = {}, options = {}) {
    this.props = props;
    this.debug = options.debug || false;
    this.context = new Map();
    this.componentStack = [];
  }

  // Main render method
  render(node) {
    if (!node) return '';

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
      default:
        if (this.debug) {
          console.warn(`Unknown render node type: ${node.type}`);
        }
        return '';
    }
  }

  renderFragment(node) {
    return node.children
      .map(child => this.render(child))
      .join('');
  }

  renderElement(node) {
    const { tagName, attributes, children } = node;

    const attrs = this.renderAttributes(attributes);

    if (this.isSelfClosingTag(tagName)) {
      return `<${tagName}${attrs} />`;
    }

    const content = children.map(child => this.render(child)).join('');
    return `<${tagName}${attrs}>${content}</${tagName}>`;
  }

  renderComponent(node) {
    const { name, props, children, component } = node;

    if (!component || typeof component !== 'function') {
      throw new Error(`Component "${name}" is not a valid function`);
    }

    if (this.componentStack.includes(name)) {
      throw new Error(`Circular component reference detected: ${name}`);
    }

    this.componentStack.push(name);

    try {
      const evaluatedProps = this.evaluateProps(props);

      if (children.length > 0) {
        const renderedChildren = children.map(child => this.render(child)).join('');
        evaluatedProps.children = renderedChildren;
      }

      const result = component(evaluatedProps);

      if (typeof result === 'string') return result;
      if (result && typeof result === 'object') return this.render(result);

      return String(result || '');
    } finally {
      this.componentStack.pop();
    }
  }

  renderText(node) {
    return escapeHtml(node.content);
  }

  renderInterpolation(node) {
    try {
      const value = this.evaluateExpression(node.compiled);
      return escapeHtml(String(value || ''));
    } catch (error) {
      if (this.debug) {
        console.error(`Interpolation error: ${error.message}`, node);
        return `<!-- Error: ${error.message} -->`;
      }
      return '';
    }
  }

  renderAttributes(attributes) {
    if (!attributes || Object.keys(attributes).length === 0) return '';

    const attrs = [];

    for (const [name, attr] of Object.entries(attributes)) {
      try {
        if (attr.type === 'static') {
          attrs.push(this.renderStaticAttribute(name, attr.value));
        } else if (attr.type === 'dynamic') {
          const value = this.evaluateExpression(attr.compiled);
          if (value !== null && value !== undefined && value !== false) {
            attrs.push(this.renderStaticAttribute(name, value));
          }
        }
      } catch (error) {
        if (this.debug) console.error(`Attribute evaluation error for "${name}":`, error);
      }
    }

    return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  }

  renderStaticAttribute(name, value) {
    if (value === true) return name;
    if (value === false || value === null || value === undefined) return '';

    const escapedValue = escapeHtml(String(value));
    return `${name}="${escapedValue}"`;
  }

  evaluateProps(props) {
    const evaluated = {};

    for (const [name, prop] of Object.entries(props)) {
      try {
        if (prop.type === 'static') evaluated[name] = prop.value;
        else if (prop.type === 'dynamic') evaluated[name] = this.evaluateExpression(prop.compiled);
      } catch (error) {
        if (this.debug) console.error(`Prop evaluation error for "${name}":`, error);
        evaluated[name] = undefined;
      }
    }

    return evaluated;
  }

  evaluateExpression(compiled) {
    if (!compiled) return undefined;

    switch (compiled.type) {
      case 'literal':
        return compiled.value;
      case 'property':
        return this.evaluatePropertyAccess(compiled.path);
      case 'expression':
        return this.evaluateUnsafeExpression(compiled.code);
      default:
        return undefined;
    }
  }

  evaluatePropertyAccess(path) {
    let current = this.props;

    for (const segment of path) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object' && segment in current) current = current[segment];
      else return undefined;
    }

    return current;
  }

  evaluateUnsafeExpression(code) {
    if (this.debug) {
      console.warn(`Unsafe expression evaluation disabled in Phase 1: ${code}`);
    }
    return `[Expression: ${code}]`;
  }

  isSelfClosingTag(tagName) {
    const selfClosingTags = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);
    return selfClosingTags.has(tagName.toLowerCase());
  }

  getStats() {
    return {
      componentStackDepth: this.componentStack.length,
      propsKeys: Object.keys(this.props),
      debug: this.debug
    };
  }
}

