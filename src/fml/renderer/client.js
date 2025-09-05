// src/fml/renderer/client.js

import { escapeHtml, escapeAttribute } from '../utils/escape.js';
import { SELF_CLOSING_TAGS, resolveExpression } from '../compiler/compiler.js';

/**
 * Render compiled FML tree to DOM nodes
 * @param {Object} compiled - Output from FMLCompiler
 * @param {Object} props - Initial context/props
 * @param {Object} options - Renderer options
 * @returns {Node|null} DOM node or fragment
 */
export function renderClient(compiled, props = {}, options = {}) {
  const renderer = new ClientRenderer(props, options);
  return renderer.render(compiled);
}

class ClientRenderer {
  constructor(props = {}, options = {}) {
    this.props = props;
    this.debug = !!options.debug;
    this.phase2 = options.phase2 !== false;
    this.target = typeof options.target === 'string'
      ? document.querySelector(options.target)
      : options.target || null;

    // Phase 2: Reactive state tracking
    this.eventHandlers = new Map();        // Track event listeners for cleanup
    this.reactiveElements = new WeakMap(); // Track reactive DOM nodes
    this.contextStack = [];                // For nested scopes (For, If)
  }

  /**
   * Main render dispatch
   */
  render(node) {
    if (!node) return null;

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
          return this.phase2 ? this.renderIf(node) : null;
        case 'else':
        case 'else_if':
          return this.phase2 ? this.renderElse(node) : null;
        case 'for':
          return this.phase2 ? this.renderFor(node) : null;
        case 'switch':
          return this.phase2 ? this.renderSwitch(node) : null;
        case 'case':
          return this.phase2 ? this.renderCase(node) : null;
        case 'default':
          return this.phase2 ? this.renderDefault(node) : null;
        case 'slot':
          return this.phase2 ? this.renderSlot(node) : null;

        default:
          if (this.debug) {
            console.warn(`[ClientRenderer] Unknown node type: ${node.type}`);
          }
          return null;
      }
    } catch (error) {
      if (this.debug) {
        console.error(`[ClientRenderer] Render error in node '${node.type}':`, error);
      }
      return null;
    }
  }

  /**
   * Render fragment (document fragment)
   */
  renderFragment(node) {
    const fragment = document.createDocumentFragment();
    node.children.forEach(child => {
      const el = this.render(child);
      if (el) fragment.appendChild(el);
    });
    return fragment;
  }

  /**
   * Render HTML element with attributes and children
   */
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
        } else if (rendered instanceof DocumentFragment) {
          element.appendChild(rendered);
        }
      }
    });

    return element;
  }

  /**
   * Render component (function call)
   */
  renderComponent(node) {
    const { name, component, props: rawProps, children } = node;

    if (!component || typeof component !== 'function') {
      if (this.debug) {
        console.error(`Component "${name}" is not a valid function`);
        return this.createErrorNode(`Component "${name}" not found`);
      }
      throw new Error(`Component "${name}" is not a valid function`);
    }

    if (this.componentStack?.includes?.(name)) {
      throw new Error(`Circular component reference: ${name}`);
    }

    try {
      const evaluatedProps = this.evaluateProps(rawProps);

      if (children && children.length > 0) {
        evaluatedProps.children = children.map(child => this.renderToString(child)).join('');
      }

      let result = component(evaluatedProps);

      if (typeof result === 'string') {
        const temp = document.createElement('div');
        temp.innerHTML = result.trim();
        this.hydrateElement(temp); // Bind events from SSR
        return temp.children.length === 1 ? temp.firstElementChild : temp;
      }

      return result || null;
    } catch (error) {
      if (this.debug) {
        console.error(`[ClientRenderer] Failed to render component <${name}>:`, error);
      }
      return this.createErrorNode(`Render failed: ${name}`);
    }
  }

  /**
   * Create a safe error node
   */
  createErrorNode(message) {
    const el = document.createElement('div');
    el.className = 'fml-error';
    el.textContent = message;
    return el;
  }

  /**
   * Render text node
   */
  renderText(node) {
    return document.createTextNode(node.content);
  }

  /**
   * Render interpolation with reactivity
   */
  renderInterpolation(node) {
    try {
      const value = resolveExpression(node.compiled, this.getCurrentContext());
      const textNode = document.createTextNode(String(value ?? ''));

      // Phase 2: Make reactive
      if (this.phase2) {
        this.reactiveElements.set(textNode, {
          type: 'interpolation',
          compiled: node.compiled
        });
      }

      return textNode;
    } catch (error) {
      if (this.debug) {
        console.error(`[ClientRenderer] Interpolation error:`, error);
      }
      return document.createTextNode('[Error]');
    }
  }

  // === Phase 2: Control Flow Rendering ===

  /**
   * Render <If> block with reactive container
   */
  renderIf(node) {
    const container = document.createElement('template');
    container.setAttribute('data-fml-if', '');

    try {
      const condition = resolveExpression(node.condition, this.getCurrentContext());
      if (condition) {
        const fragment = document.createDocumentFragment();
        node.children.forEach(child => {
          const el = this.render(child);
          if (el) fragment.appendChild(el);
        });
        container.content.appendChild(fragment);
      }

      // Track for updates
      if (this.phase2) {
        this.reactiveElements.set(container, {
          type: 'if',
          condition: node.condition,
          children: node.children
        });
      }

      return container;
    } catch (error) {
      if (this.debug) {
        console.error(`[ClientRenderer] If error:`, error);
      }
      return container;
    }
  }

  /**
   * Render <Else> / <ElseIf> (handled by parent logic)
   */
  renderElse(node) {
    const fragment = document.createDocumentFragment();
    node.children.forEach(child => {
      const el = this.render(child);
      if (el) fragment.appendChild(el);
    });
    return fragment;
  }

  /**
   * Render <For> loop with reactive container
   */
  renderFor(node) {
    const container = document.createElement('template');
    container.setAttribute('data-fml-for', node.itemName);

    try {
      const iterable = resolveExpression(node.iterable, this.getCurrentContext());
      const items = Array.isArray(iterable) || typeof iterable === 'string'
        ? iterable
        : Object.values(iterable || {});

      const fragment = document.createDocumentFragment();

      Array.from(items).forEach((item, index) => {
        const loopContext = {
          ...this.getCurrentContext(),
          [node.itemName]: item,
          [node.indexName || 'index']: index
        };

        this.pushContext(loopContext);
        try {
          const itemFragment = document.createDocumentFragment();
          node.children.forEach(child => {
            const el = this.render(child);
            if (el) itemFragment.appendChild(el);
          });
          fragment.appendChild(itemFragment);
        } finally {
          this.popContext();
        }
      });

      container.content.appendChild(fragment);

      // Make reactive
      if (this.phase2) {
        this.reactiveElements.set(container, {
          type: 'for',
          iterable: node.iterable,
          itemName: node.itemName,
          indexName: node.indexName,
          children: node.children
        });
      }

      return container;
    } catch (error) {
      if (this.debug) {
        console.error(`[ClientRenderer] For error:`, error);
      }
      return container;
    }
  }

  /**
   * Render <Switch> block
   */
  renderSwitch(node) {
    const container = document.createElement('template');
    container.setAttribute('data-fml-switch', '');

    try {
      const value = resolveExpression(node.value, this.getCurrentContext());
      let matched = false;

      const fragment = document.createDocumentFragment();

      for (const child of node.children) {
        if (child.type === 'case' && !matched) {
          const caseValue = resolveExpression(child.value, this.getCurrentContext());
          if (value === caseValue) {
            matched = true;
            child.children.forEach(c => {
              const el = this.render(c);
              if (el) fragment.appendChild(el);
            });
          }
        } else if (child.type === 'default' && !matched) {
          child.children.forEach(c => {
            const el = this.render(c);
            if (el) fragment.appendChild(el);
          });
        }
      }

      container.content.appendChild(fragment);

      // Make reactive
      if (this.phase2) {
        this.reactiveElements.set(container, {
          type: 'switch',
          value: node.value,
          cases: node.children
        });
      }

      return container;
    } catch (error) {
      if (this.debug) {
        console.error(`[ClientRenderer] Switch error:`, error);
      }
      return container;
    }
  }

  /**
   * Render <Case> / <Default> / <Slot>
   */
  renderCase(node) {
    return this.renderChildrenToFragment(node.children);
  }

  renderDefault(node) {
    return this.renderChildrenToFragment(node.children);
  }

  renderSlot(node) {
    return this.renderChildrenToFragment(node.children);
  }

  // === Utilities ===

  renderChildrenToFragment(children) {
    const fragment = document.createDocumentFragment();
    children.forEach(child => {
      const el = this.render(child);
      if (el) fragment.appendChild(el);
    });
    return fragment;
  }

  /**
   * Set element attributes and bind events
   */
  setAttributes(element, attributes = {}) {
    for (const [name, attr] of Object.entries(attributes)) {
      try {
        if (attr.type === 'static') {
          this.setStaticAttribute(element, name, attr.value);
        } else if (attr.type === 'dynamic') {
          const value = resolveExpression(attr.compiled, this.getCurrentContext());
          if (value !== null && value !== undefined && value !== false) {
            this.setStaticAttribute(element, name, value);

            // Track for reactivity
            if (this.phase2) {
              const tracker = this.reactiveElements.get(element) || {};
              tracker[`attr:${name}`] = attr.compiled;
              this.reactiveElements.set(element, tracker);
            }
          }
        } else if (this.phase2 && attr.type === 'event') {
          this.bindEvent(element, name, attr.compiled);
        }
      } catch (error) {
        if (this.debug) {
          console.error(`[ClientRenderer] Attribute error for "${name}":`, error);
        }
      }
    }
  }

  setStaticAttribute(element, name, value) {
    if (value == null || value === false) return;
    if (value === true) {
      element.setAttribute(name, '');
      return;
    }

    if (name === 'className') {
      element.className = value;
    } else if (name in element && typeof element[name] !== 'function') {
      element[name] = value;
    } else {
      element.setAttribute(name, escapeAttribute(String(value)));
    }
  }

  /**
   * Bind event handler (function or safe string)
   */
  bindEvent(element, eventName, compiled) {
    const eventType = eventName.replace(/^on/i, '').toLowerCase();

    try {
      const handler = resolveExpression(compiled, this.getCurrentContext());

      if (typeof handler === 'function') {
        const wrapper = (e) => {
          e.preventDefault();
          try {
            handler(e);
          } catch (err) {
            if (this.debug) {
              console.error(`Event handler error for ${eventName}:`, err);
            }
          }
        };

        element.addEventListener(eventType, wrapper);
        const id = `${eventType}-${Date.now()}`;
        this.eventHandlers.set(id, { element, eventType, wrapper });
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`[ClientRenderer] Could not bind event ${eventName}:`, error);
      }
    }
  }

  /**
   * Hydrate server-rendered HTML with event listeners
   */
  hydrateElement(element) {
    if (!this.phase2) return;

    const els = element.querySelectorAll('[data-fml-on-click], [data-fml-on-submit], [data-fml-on-change], [data-fml-on-*]');
    els.forEach(el => {
      ['click', 'submit', 'change', 'input', 'focus', 'blur'].forEach(eventType => {
        const attr = el.getAttribute(`data-fml-on-${eventType}`);
        if (attr) {
          this.bindEvent(el, `on${eventType}`, { code: attr, safe: false });
          el.removeAttribute(`data-fml-on-${eventType}`);
        }
      });
    });
  }

  /**
   * Update reactive elements when props change
   */
  updateProps(newProps) {
    Object.assign(this.props, newProps);

    for (const [node, config] of this.reactiveElements.entries()) {
      try {
        if (config.type === 'interpolation') {
          const value = resolveExpression(config.compiled, this.getCurrentContext());
          node.textContent = String(value ?? '');
        } else if (config.type === 'if') {
          const condition = resolveExpression(config.condition, this.getCurrentContext());
          if (node.parentNode) {
            node.style.display = condition ? '' : 'none';
          }
        } else if (config.type === 'for') {
          console.warn('ClientRenderer.updateProps: For loop update not supported. Full re-render needed.');
        } else if (config.type === 'switch') {
          console.warn('ClientRenderer.updateProps: Switch update not supported. Full re-render needed.');
        }
      } catch (error) {
        if (this.debug) {
          console.error(`[ClientRenderer] Update error:`, error);
        }
      }
    }
  }

  /**
   * Context stack for nested scopes
   */
  getCurrentContext() {
    if (this.contextStack.length === 0) return this.props;
    return this.contextStack[this.contextStack.length - 1];
  }

  pushContext(ctx) {
    this.contextStack.push({ ...this.getCurrentContext(), ...ctx });
  }

  popContext() {
    if (this.contextStack.length > 0) {
      this.contextStack.pop();
    }
  }

  /**
   * Render node to string (for component children)
   */
  renderToString(node) {
    switch (node.type) {
      case 'text':
        return escapeHtml(node.content);
      case 'interpolation':
        const value = resolveExpression(node.compiled, this.getCurrentContext());
        return escapeHtml(String(value ?? ''));
      case 'element':
        const attrs = this.renderAttributesToString(node.attributes);
        const children = (node.children || []).map(c => this.renderToString(c)).join('');
        return this.isSelfClosingTag(node.tagName)
          ? `<${node.tagName}${attrs} />`
          : `<${node.tagName}${attrs}>${children}</${node.tagName}>`;
      default:
        return '';
    }
  }

  renderAttributesToString(attrs = {}) {
    const parts = [];
    for (const [name, attr] of Object.entries(attrs)) {
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
        }
      } catch (e) {
        if (this.debug) console.warn(`Attr stringify error: ${name}`, e);
      }
    }
    return parts.length ? ' ' + parts.join(' ') : '';
  }

  evaluateProps(props = {}) {
    const evaluated = {};
    for (const [name, prop] of Object.entries(props)) {
      try {
        evaluated[name] = prop.type === 'static'
          ? prop.value
          : resolveExpression(prop.compiled, this.getCurrentContext());
      } catch (error) {
        if (this.debug) {
          console.error(`[ClientRenderer] Prop eval error for "${name}":`, error);
        }
        evaluated[name] = undefined;
      }
    }
    return evaluated;
  }

  isSelfClosingTag(tagName) {
    return SELF_CLOSING_TAGS.has(tagName.toLowerCase());
  }

  /**
   * Cleanup all event listeners
   */
  destroy() {
    for (const { element, eventType, wrapper } of this.eventHandlers.values()) {
      try {
        element.removeEventListener(eventType, wrapper);
      } catch (e) {
        if (this.debug) console.warn('Cleanup error:', e);
      }
    }
    this.eventHandlers.clear();
    this.reactiveElements = new WeakMap();
    this.contextStack = [];
  }
}

/**
 * Mount FML to DOM with lifecycle control
 */
export function mountFML(compiled, target, props = {}, options = {}) {
  const renderer = new ClientRenderer(props, options);
  const dom = renderer.render(compiled);

  if (dom && target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el) {
      if (options.hydrate) {
        el.replaceChildren(dom);
        renderer.hydrateElement(el);
      } else {
        el.innerHTML = '';
        el.appendChild(dom);
      }
    }
  }

  return {
    dom,
    renderer,
    update: (newProps) => renderer.updateProps(newProps),
    destroy: () => renderer.destroy()
  };
}

/**
 * Hydrate server-rendered FML content
 */
export function hydrateFML(target, compiled, props = {}, options = {}) {
  return mountFML(compiled, target, props, { ...options, hydrate: true });
}