// src/fml/renderer/client.js

import { escapeHtml } from '../utils/escape.js';

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

  // Main render method - returns DOM nodes
  render(node) {
    if (!node) return null;

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
          console.warn(`Unknown client render node type: ${node.type}`);
        }
        return null;
    }
  }

  // Render fragment as document fragment
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

  // Render HTML element
  renderElement(node) {
    const { tagName, attributes, children } = node;
    const element = document.createElement(tagName);

    // Set attributes
    this.setAttributes(element, attributes);

    // Append children
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

  // Render component (Phase 1: convert to HTML string then parse)
  renderComponent(node) {
    const { name, props, children, component } = node;
    
    if (!component || typeof component !== 'function') {
      throw new Error(`Component "${name}" is not available on client`);
    }

    try {
      // Evaluate props
      const evaluatedProps = this.evaluateProps(props);
      
      // Add children as HTML string
      if (children.length > 0) {
        const childrenHTML = children
          .map(child => this.renderToString(child))
          .join('');
        evaluatedProps.children = childrenHTML;
      }

      // Call component function
      const result = component(evaluatedProps);
      
      if (typeof result === 'string') {
        // Parse HTML string to DOM
        const temp = document.createElement('div');
        temp.innerHTML = result;
        
        // Return single element or fragment
        if (temp.children.length === 1) {
          return temp.firstElementChild;
        } else {
          const fragment = document.createDocumentFragment();
          while (temp.firstChild) {
            fragment.appendChild(temp.firstChild);
          }
          return fragment;
        }
      }

      return null;

    } catch (error) {
      if (this.debug) {
        console.error(`Client component render error for "${name}":`, error);
      }
      
      const errorEl = document.createElement('div');
      errorEl.className = 'fml-error';
      errorEl.textContent = `Error rendering ${name}`;
      return errorEl;
    }
  }

  // Render text node
  renderText(node) {
    return document.createTextNode(node.content);
  }

  // Render interpolation
  renderInterpolation(node) {
    try {
      const value = this.evaluateExpression(node.compiled);
      return document.createTextNode(String(value || ''));
    } catch (error) {
      if (this.debug) {
        console.error(`Client interpolation error:`, error);
        const errorNode = document.createTextNode(`[Error: ${error.message}]`);
        return errorNode;
      }
      return document.createTextNode('');
    }
  }

  // Helper: Render node to HTML string (for component children)
  renderToString(node) {
    // Simplified version - reuse server renderer logic
    switch (node.type) {
      case 'text':
        return escapeHtml(node.content);
      
      case 'interpolation':
        try {
          const value = this.evaluateExpression(node.compiled);
          return escapeHtml(String(value || ''));
        } catch {
          return '';
        }
      
      case 'element':
        const attrs = this.renderAttributesToString(node.attributes);
        const children = node.children
          .map(child => this.renderToString(child))
          .join('');
        
        if (this.isSelfClosingTag(node.tagName)) {
          return `<${node.tagName}${attrs} />`;
        }
        return `<${node.tagName}${attrs}>${children}</${node.tagName}>`;
      
      default:
        return '';
    }
  }

  // Set DOM attributes
  setAttributes(element, attributes) {
    if (!attributes) return;

    for (const [name, attr] of Object.entries(attributes)) {
      try {
        if (attr.type === 'static') {
          this.setStaticAttribute(element, name, attr.value);
        } else if (attr.type === 'dynamic') {
          const value = this.evaluateExpression(attr.compiled);
          if (value !== null && value !== undefined && value !== false) {
            this.setStaticAttribute(element, name, value);
          }
        }
      } catch (error) {
        if (this.debug) {
          console.error(`Attribute setting error for "${name}":`, error);
        }
      }
    }
  }

  // Set static attribute on DOM element
  setStaticAttribute(element, name, value) {
    if (value === false || value === null || value === undefined) {
      return;
    }

    if (value === true) {
      element.setAttribute(name, '');
      return;
    }

    // Handle special attributes
    if (name === 'className') {
      element.className = String(value);
    } else if (name.startsWith('data-') || name.startsWith('aria-')) {
      element.setAttribute(name, String(value));
    } else if (name in element) {
      // DOM property
      element[name] = value;
    } else {
      // Generic attribute
      element.setAttribute(name, String(value));
    }
  }

  // Render attributes to string (for innerHTML usage)
  renderAttributesToString(attributes) {
    if (!attributes || Object.keys(attributes).length === 0) {
      return '';
    }

    const attrs = [];
    
    for (const [name, attr] of Object.entries(attributes)) {
      try {
        if (attr.type === 'static') {
          const rendered = this.renderStaticAttributeToString(name, attr.value);
          if (rendered) attrs.push(rendered);
        } else if (attr.type === 'dynamic') {
          const value = this.evaluateExpression(attr.compiled);
          if (value !== null && value !== undefined && value !== false) {
            const rendered = this.renderStaticAttributeToString(name, value);
            if (rendered) attrs.push(rendered);
          }
        }
      } catch (error) {
        if (this.debug) {
          console.error(`Attribute string rendering error for "${name}":`, error);
        }
      }
    }

    return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  }

  // Render static attribute to string
  renderStaticAttributeToString(name, value) {
    if (value === true) {
      return name;
    }
    
    if (value === false || value === null || value === undefined) {
      return '';
    }

    const escapedValue = escapeHtml(String(value));
    return `${name}="${escapedValue}"`;
  }

  // Evaluate component props (same as server)
  evaluateProps(props) {
    const evaluated = {};
    
    for (const [name, prop] of Object.entries(props)) {
      try {
        if (prop.type === 'static') {
          evaluated[name] = prop.value;
        } else if (prop.type === 'dynamic') {
          evaluated[name] = this.evaluateExpression(prop.compiled);
        }
      } catch (error) {
        if (this.debug) {
          console.error(`Client prop evaluation error for "${name}":`, error);
        }
        evaluated[name] = undefined;
      }
    }
    
    return evaluated;
  }

  // Evaluate expression (same as server renderer)
  evaluateExpression(compiled) {
    if (!compiled) return undefined;

    switch (compiled.type) {
      case 'literal':
        return compiled.value;
      
      case 'property':
        return this.evaluatePropertyAccess(compiled.path);
      
      case 'expression':
        // Phase 1: Limited expression support
        if (this.debug) {
          console.warn(`Complex expressions not supported in Phase 1: ${compiled.code}`);
        }
        return `[Expression: ${compiled.code}]`;
      
      default:
        return undefined;
    }
  }

  // Evaluate property access
  evaluatePropertyAccess(path) {
    let current = this.props;
    
    for (const segment of path) {
      if (current === null || current === undefined) {
        return undefined;
      }
      
      if (typeof current === 'object' && segment in current) {
        current = current[segment];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  // Check if tag is self-closing
  isSelfClosingTag(tagName) {
    const selfClosingTags = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);
    
    return selfClosingTags.has(tagName.toLowerCase());
  }
}

// Utility function for mounting FML to DOM
export function mountFML(compiled, target, props = {}, components = {}) {
  const renderer = new ClientRenderer(props, { debug: true });
  const rendered = renderer.render(compiled);
  
  if (rendered) {
    if (typeof target === 'string') {
      target = document.querySelector(target);
    }
    
    if (target) {
      target.innerHTML = '';
      target.appendChild(rendered);
    }
  }
  
  return rendered;
}