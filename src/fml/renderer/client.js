// src/fml/renderer/client.js
import { escapeHtml } from '../utils/escape.js';
import { SELF_CLOSING_TAGS, resolveExpression } from '../compiler/compiler.js';

export function renderClient(compiled, props = {}, options = {}) {
  const renderer = new ClientRenderer(props, options);
  return renderer.render(compiled);
}

class ClientRenderer {
  constructor(props = {}, options = {}) {
    this.props = props;
    this.debug = options.debug || false;
    this.target = options.target || document.body;
  }

  render(node) {
    if (!node) return null;

    switch (node.type) {
      case 'fragment': return this.renderFragment(node);
      case 'element': return this.renderElement(node);
      case 'component': return this.renderComponent(node);
      case 'text': return this.renderText(node);
      case 'interpolation': return this.renderInterpolation(node);
      default:
        if (this.debug) {
          console.warn(`Unknown client node type: ${node.type}`);
        }
        return null;
    }
  }

  renderFragment(node) {
    const fragment = document.createDocumentFragment();
    node.children.forEach(child => {
      const rendered = this.render(child);
      if (rendered) {
        if (rendered.nodeType) {
          fragment.appendChild(rendered);
        } else if (Array.isArray(rendered)) {
          rendered.forEach(n => n && fragment.appendChild(n));
        }
      }
    });
    return fragment;
  }

  renderElement(node) {
    const { tagName, attributes, children } = node;
    const element = document.createElement(tagName);
    this.setAttributes(element, attributes);
    children.forEach(child => {
      const rendered = this.render(child);
      if (rendered) {
        if (rendered.nodeType) {
          element.appendChild(rendered);
        } else if (typeof rendered === 'string') {
          element.insertAdjacentHTML('beforeend', rendered);
        }
      }
    });
    return element;
  }

  renderComponent(node) {
    const { name, props, children, component } = node;

    if (!component || typeof component !== 'function') {
      throw new Error(`Component "${name}" not found on client`);
    }

    try {
      const evaluatedProps = this.evaluateProps(props);

      if (children.length > 0) {
        evaluatedProps.children = children.map(child => this.renderToString(child)).join('');
      }

      const result = component(evaluatedProps);
      if (typeof result === 'string') {
        const temp = document.createElement('div');
        temp.innerHTML = result.trim();
        return temp.children.length === 1 ? temp.firstElementChild : temp;
      }
      return null;
    } catch (error) {
      if (this.debug) console.error(`Client render error: ${name}`, error);
      const el = document.createElement('div');
      el.className = 'fml-error';
      el.textContent = `Error: ${name}`;
      return el;
    }
  }

  renderText(node) {
    return document.createTextNode(node.content);
  }

  renderInterpolation(node) {
    try {
      const value = resolveExpression(node.compiled, this.props);
      return document.createTextNode(String(value ?? ''));
    } catch (error) {
      if (this.debug) console.error(`Interpolation error:`, error);
      return document.createTextNode('[Error]');
    }
  }

  renderToString(node) {
    switch (node.type) {
      case 'text': return escapeHtml(node.content);
      case 'interpolation':
        const value = resolveExpression(node.compiled, this.props);
        return escapeHtml(String(value ?? ''));
      case 'element':
        const attrs = this.renderAttributesToString(node.attributes);
        const children = node.children.map(child => this.renderToString(child)).join('');
        return this.isSelfClosingTag(node.tagName)
          ? `<${node.tagName}${attrs} />`
          : `<${node.tagName}${attrs}>${children}</${node.tagName}>`;
      default: return '';
    }
  }

  setAttributes(element, attributes) {
    for (const [name, attr] of Object.entries(attributes || {})) {
      try {
        if (attr.type === 'static') {
          this.setStaticAttribute(element, name, attr.value);
        } else if (attr.type === 'dynamic') {
          const value = resolveExpression(attr.compiled, this.props);
          if (value !== null && value !== undefined && value !== false) {
            this.setStaticAttribute(element, name, value);
          }
        }
      } catch (error) {
        if (this.debug) console.error(`Attr error: ${name}`, error);
      }
    }
  }

  setStaticAttribute(element, name, value) {
    if (value === false || value == null) return;
    if (value === true) {
      element.setAttribute(name, '');
      return;
    }

    if (name === 'className') {
      element.className = value;
    } else if (name in element) {
      element[name] = value;
    } else {
      element.setAttribute(name, String(value));
    }
  }

  renderAttributesToString(attributes) {
    const attrs = [];
    for (const [name, attr] of Object.entries(attributes || {})) {
      try {
        if (attr.type === 'static') {
          attrs.push(attr.value === true ? name : `${name}="${escapeHtml(attr.value)}"`);
        } else if (attr.type === 'dynamic') {
          const value = resolveExpression(attr.compiled, this.props);
          if (value !== null && value !== undefined && value !== false) {
            attrs.push(value === true ? name : `${name}="${escapeHtml(value)}"`);
          }
        }
      } catch (e) { /* ignore */ }
    }
    return attrs.length ? ' ' + attrs.join(' ') : '';
  }

  evaluateProps(props) {
    const evaluated = {};
    for (const [name, prop] of Object.entries(props)) {
      evaluated[name] = prop.type === 'static'
        ? prop.value
        : resolveExpression(prop.compiled, this.props);
    }
    return evaluated;
  }

  isSelfClosingTag(tagName) {
    return SELF_CLOSING_TAGS.has(tagName.toLowerCase());
  }
}

export function mountFML(compiled, target, props = {}, components = {}) {
  const renderer = new ClientRenderer(props);
  const dom = renderer.render(compiled);
  if (dom) {
    if (typeof target === 'string') target = document.querySelector(target);
    if (target) {
      target.innerHTML = '';
      target.appendChild(dom);
    }
  }
  return dom;
}