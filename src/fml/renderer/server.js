// src/fml/renderer/server.js
import { escapeHtml } from '../utils/escape.js';
import { SELF_CLOSING_TAGS, resolveExpression } from '../compiler/compiler.js';

export function renderServer(compiled, props = {}, options = {}) {
  const renderer = new ServerRenderer(props, options);
  return renderer.render(compiled);
}

class ServerRenderer {
  constructor(props = {}, options = {}) {
    this.props = props;
    this.debug = options.debug || false;
    this.componentStack = [];
  }

  render(node) {
    if (!node) return '';

    switch (node.type) {
      case 'fragment': return this.renderFragment(node);
      case 'element': return this.renderElement(node);
      case 'component': return this.renderComponent(node);
      case 'text': return this.renderText(node);
      case 'interpolation': return this.renderInterpolation(node);
      default:
        if (this.debug) {
          console.warn(`Unknown render node type: ${node.type}`);
        }
        return '';
    }
  }

  renderFragment(node) {
    return node.children.map(child => this.render(child)).join('');
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
      throw new Error(`Circular component reference: ${name}`);
    }

    this.componentStack.push(name);
    try {
      const evaluatedProps = this.evaluateProps(props);

      if (children.length > 0) {
        evaluatedProps.children = children.map(child => this.render(child)).join('');
      }

      const result = component(evaluatedProps);
      return typeof result === 'string' ? result : String(result || '');
    } catch (error) {
      console.error(`Error rendering component ${name}:`, error);
      return `<div class="fml-error">❌ Failed to render ${name}</div>`;
    } finally {
      this.componentStack.pop();
    }
  }

  renderText(node) {
    return escapeHtml(node.content);
  }

  renderInterpolation(node) {
    try {
      const value = resolveExpression(node.compiled, this.props);
      return escapeHtml(String(value ?? ''));
    } catch (error) {
      if (this.debug) {
        console.error(`Interpolation error:`, error);
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
          const val = escapeHtml(String(attr.value));
          attrs.push(attr.value === true ? name : `${name}="${val}"`);
        } else if (attr.type === 'dynamic') {
          const value = resolveExpression(attr.compiled, this.props);
          if (value !== null && value !== undefined && value !== false) {
            const val = escapeHtml(String(value));
            attrs.push(value === true ? name : `${name}="${val}"`);
          }
        }
      } catch (error) {
        if (this.debug) {
          console.error(`Attribute error for "${name}":`, error);
        }
      }
    }

    return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  }

  isSelfClosingTag(tagName) {
    return SELF_CLOSING_TAGS.has(tagName.toLowerCase());
  }

  evaluateProps(props) {
    const evaluated = {};
    for (const [name, prop] of Object.entries(props)) {
      try {
        evaluated[name] = prop.type === 'static'
          ? prop.value
          : resolveExpression(prop.compiled, this.props);
      } catch (error) {
        if (this.debug) {
          console.error(`Prop error for "${name}":`, error);
        }
        evaluated[name] = undefined;
      }
    }
    return evaluated;
  }

  getStats() {
    return {
      componentStackDepth: this.componentStack.length,
      propsKeys: Object.keys(this.props),
      debug: this.debug
    };
  }
}