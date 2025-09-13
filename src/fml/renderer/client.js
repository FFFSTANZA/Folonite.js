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

/**
 * Virtual DOM Node representation for diffing
 */
class VNode {
  constructor(type, props = {}, children = [], key = null) {
    this.type = type;
    this.props = props;
    this.children = Array.isArray(children) ? children : [children];
    this.key = key;
    this.ref = null; // Reference to actual DOM node
    this.component = null; // Component instance if this is a component
  }

  static text(content) {
    return new VNode('text', { content }, []);
  }

  static element(tagName, props, children) {
    return new VNode('element', { tagName, ...props }, children);
  }

  static component(name, props, children) {
    return new VNode('component', { name, ...props }, children);
  }
}

/**
 * Enhanced Client Renderer with Virtual DOM and Lifecycle Management
 */
class ClientRenderer {
  constructor(props = {}, options = {}) {
    this.props = props;
    this.debug = !!options.debug;
    this.phase2 = options.phase2 !== false;
    this.target = typeof options.target === 'string'
      ? document.querySelector(options.target)
      : options.target || null;

    // Virtual DOM state
    this.vdom = null;
    this.prevVdom = null;
    this.domNodes = new WeakMap(); // VNode -> DOM mapping
    this.nodeVNodes = new WeakMap(); // DOM -> VNode mapping

    // Enhanced reactive state tracking
    this.eventHandlers = new Map();
    this.reactiveElements = new WeakMap();
    this.contextStack = [];
    this.componentStack = [];

    // Event delegation system
    this.eventDelegator = new EventDelegator(this);
    
    // Component lifecycle management
    this.componentInstances = new Map();
    this.mountedComponents = new Set();
    this.lifecycleQueue = [];
    
    // Performance monitoring
    this.renderStats = {
      totalRenders: 0,
      diffTime: 0,
      patchTime: 0,
      lastRenderTime: 0
    };

    // Memory leak prevention
    this.cleanupTasks = new Set();
    this.isDestroyed = false;

    // Hydration mismatch detection
    this.hydrationMismatches = [];
    this.isHydrating = false;

    if (this.debug) {
      this.logDebug('ClientRenderer initialized', {
        phase2: this.phase2,
        eventDelegation: true,
        virtualDOM: true
      });
    }
  }

  /**
   * Main render dispatch with Virtual DOM
   */
  render(node) {
    if (!node || this.isDestroyed) return null;

    const startTime = performance.now();
    
    try {
      // Convert AST to Virtual DOM
      const vnode = this.astToVNode(node);
      
      // Perform diff and patch if we have previous VDOM
      if (this.vdom && this.target) {
        this.diff(this.vdom, vnode, this.target);
      } else {
        // Initial render
        const domNode = this.renderVNode(vnode);
        this.vdom = vnode;
        
        // Execute lifecycle hooks
        this.executeLifecycleQueue();
        
        return domNode;
      }

      // Update stats
      const renderTime = performance.now() - startTime;
      this.renderStats.totalRenders++;
      this.renderStats.lastRenderTime = renderTime;
      
      if (this.debug && renderTime > 16) { // Longer than 1 frame
        this.logWarn(`Slow render detected: ${renderTime.toFixed(2)}ms`);
      }

      this.prevVdom = this.vdom;
      this.vdom = vnode;
      
      return this.target;

    } catch (error) {
      this.logError('Render error:', error);
      return this.createErrorNode(`Render failed: ${error.message}`);
    }
  }

  /**
   * Convert AST node to Virtual DOM node
   */
  astToVNode(node) {
    if (!node) return null;

    switch (node.type) {
      case 'fragment':
        return new VNode('fragment', {}, node.children.map(child => this.astToVNode(child)).filter(Boolean));
      
      case 'element':
        return VNode.element(
          node.tagName,
          node.attributes || {},
          (node.children || []).map(child => this.astToVNode(child)).filter(Boolean)
        );
      
      case 'component':
        return VNode.component(
          node.name,
          { component: node.component, props: node.props },
          (node.children || []).map(child => this.astToVNode(child)).filter(Boolean)
        );
      
      case 'text':
        return VNode.text(node.content);
      
      case 'interpolation':
        const value = resolveExpression(node.compiled, this.getCurrentContext());
        return VNode.text(String(value ?? ''));

      // Phase 2: Control Flow
      case 'if':
        return this.phase2 ? this.astToVNodeIf(node) : null;
      case 'for':
        return this.phase2 ? this.astToVNodeFor(node) : null;
      case 'switch':
        return this.phase2 ? this.astToVNodeSwitch(node) : null;
      case 'slot':
        return this.phase2 ? this.astToVNodeSlot(node) : null;

      default:
        if (this.debug) {
          this.logWarn(`Unknown AST node type: ${node.type}`);
        }
        return null;
    }
  }

  /**
   * Convert If directive to VNode
   */
  astToVNodeIf(node) {
    try {
      const condition = resolveExpression(node.condition, this.getCurrentContext());
      if (condition) {
        const children = (node.children || []).map(child => this.astToVNode(child)).filter(Boolean);
        return new VNode('conditional', { condition: true }, children);
      }
      return new VNode('conditional', { condition: false }, []);
    } catch (error) {
      this.logError('If directive error:', error);
      return null;
    }
  }

  /**
   * Convert For directive to VNode
   */
  astToVNodeFor(node) {
    try {
      const iterable = resolveExpression(node.items || node.each, this.getCurrentContext());
      const itemVar = node.itemVar || node.as || 'item';
      const indexVar = node.indexVar || node.index || 'index';
      
      if (!iterable) return new VNode('loop', {}, []);

      const items = Array.isArray(iterable) ? iterable : Object.values(iterable);
      const children = [];

      for (let i = 0; i < items.length; i++) {
        const loopContext = {
          ...this.getCurrentContext(),
          [itemVar]: items[i],
          [indexVar]: i
        };

        this.pushContext(loopContext);
        try {
          const itemChildren = (node.body || node.children || [])
            .map(child => this.astToVNode(child))
            .filter(Boolean);
          
          // Create wrapper with key for efficient diffing
          const wrapper = new VNode('loop-item', { index: i }, itemChildren);
          wrapper.key = `${itemVar}-${i}`;
          children.push(wrapper);
        } finally {
          this.popContext();
        }
      }

      return new VNode('loop', { itemVar, indexVar }, children);
    } catch (error) {
      this.logError('For directive error:', error);
      return new VNode('loop', {}, []);
    }
  }

  /**
   * Convert Switch directive to VNode
   */
  astToVNodeSwitch(node) {
    try {
      const value = resolveExpression(node.value, this.getCurrentContext());
      let matched = false;
      let children = [];

      for (const child of (node.cases || node.children || [])) {
        if (child.type === 'case' && !matched) {
          const caseValue = resolveExpression(child.value, this.getCurrentContext());
          if (value === caseValue) {
            matched = true;
            children = (child.children || []).map(c => this.astToVNode(c)).filter(Boolean);
            break;
          }
        } else if (child.type === 'default' && !matched) {
          children = (child.children || []).map(c => this.astToVNode(c)).filter(Boolean);
          break;
        }
      }

      return new VNode('switch', { value, matched }, children);
    } catch (error) {
      this.logError('Switch directive error:', error);
      return new VNode('switch', {}, []);
    }
  }

  /**
   * Convert Slot directive to VNode
   */
  astToVNodeSlot(node) {
    const children = (node.children || []).map(child => this.astToVNode(child)).filter(Boolean);
    return new VNode('slot', { name: node.name || 'default' }, children);
  }

  /**
   * Render VNode to actual DOM
   */
  renderVNode(vnode) {
    if (!vnode) return null;

    let domNode = null;

    switch (vnode.type) {
      case 'text':
        domNode = document.createTextNode(vnode.props.content || '');
        break;

      case 'element':
        domNode = this.renderElement(vnode);
        break;

      case 'component':
        domNode = this.renderComponent(vnode);
        break;

      case 'fragment':
      case 'conditional':
      case 'loop':
      case 'loop-item':
      case 'switch':
      case 'slot':
        domNode = this.renderContainer(vnode);
        break;

      default:
        if (this.debug) {
          this.logWarn(`Unknown VNode type: ${vnode.type}`);
        }
        return null;
    }

    if (domNode) {
      this.domNodes.set(vnode, domNode);
      this.nodeVNodes.set(domNode, vnode);
      vnode.ref = domNode;
    }

    return domNode;
  }

  /**
   * Render element VNode
   */
  renderElement(vnode) {
    const { tagName, ...attributes } = vnode.props;
    const element = document.createElement(tagName);

    // Set attributes
    this.setAttributes(element, attributes);

    // Render children
    vnode.children.forEach(child => {
      const childNode = this.renderVNode(child);
      if (childNode) {
        element.appendChild(childNode);
      }
    });

    return element;
  }

  /**
   * Render component VNode with lifecycle
   */
  renderComponent(vnode) {
    const { name, component, props: rawProps } = vnode.props;
    
    if (!component || typeof component !== 'function') {
      this.logError(`Component "${name}" is not a valid function`);
      return this.createErrorNode(`Component "${name}" not found`);
    }

    // Check for circular reference
    if (this.componentStack.includes(name)) {
      throw new Error(`Circular component reference: ${this.componentStack.join(' -> ')} -> ${name}`);
    }

    this.componentStack.push(name);

    try {
      // Create component instance
      const instance = {
        name,
        props: this.evaluateProps(rawProps),
        state: {},
        mounted: false,
        vnode,
        hooks: {
          beforeMount: [],
          mounted: [],
          beforeUpdate: [],
          updated: [],
          beforeUnmount: [],
          unmounted: []
        }
      };

      // Add children as props
      if (vnode.children && vnode.children.length > 0) {
        instance.props.children = vnode.children
          .map(child => this.renderVNodeToString(child))
          .join('');
      }

      // Store instance
      this.componentInstances.set(vnode, instance);
      
      // Execute beforeMount hooks
      this.executeHooks(instance, 'beforeMount');

      // Render component
      const result = component(instance.props);
      let domNode;

      if (typeof result === 'string') {
        const temp = document.createElement('div');
        temp.innerHTML = result.trim();
        
        // Hydrate events
        this.hydrateElement(temp);
        
        domNode = temp.children.length === 1 ? temp.firstElementChild : temp;
      } else if (result && result.nodeType) {
        domNode = result;
      } else {
        domNode = this.createErrorNode(`Invalid component return: ${name}`);
      }

      // Schedule mounted hook
      this.lifecycleQueue.push(() => {
        instance.mounted = true;
        this.mountedComponents.add(instance);
        this.executeHooks(instance, 'mounted');
      });

      return domNode;

    } catch (error) {
      this.logError(`Component render failed: ${name}`, error);
      return this.createErrorNode(`Render failed: ${name}`);
    } finally {
      this.componentStack.pop();
    }
  }

  /**
   * Render container (fragment, conditional, loop, etc.)
   */
  renderContainer(vnode) {
    const fragment = document.createDocumentFragment();
    
    // Add container marker for debugging
    if (this.debug) {
      const comment = document.createComment(`FML-${vnode.type}`);
      fragment.appendChild(comment);
    }

    vnode.children.forEach(child => {
      const childNode = this.renderVNode(child);
      if (childNode) {
        fragment.appendChild(childNode);
      }
    });

    return fragment;
  }

  /**
   * Virtual DOM Diffing Algorithm
   */
  diff(oldVNode, newVNode, parentDOM) {
    const startTime = performance.now();

    try {
      this.diffNode(oldVNode, newVNode, parentDOM, 0);
      
      const diffTime = performance.now() - startTime;
      this.renderStats.diffTime += diffTime;
      
      if (this.debug && diffTime > 8) {
        this.logWarn(`Slow diff detected: ${diffTime.toFixed(2)}ms`);
      }
    } catch (error) {
      this.logError('Diff error:', error);
    }
  }

  /**
   * Diff individual nodes
   */
  diffNode(oldVNode, newVNode, parentDOM, index) {
    const oldDOM = oldVNode ? this.domNodes.get(oldVNode) : null;

    // Node removed
    if (!newVNode) {
      if (oldDOM && parentDOM.contains(oldDOM)) {
        this.unmountNode(oldVNode);
        parentDOM.removeChild(oldDOM);
      }
      return;
    }

    // Node added
    if (!oldVNode) {
      const newDOM = this.renderVNode(newVNode);
      if (newDOM) {
        if (index < parentDOM.childNodes.length) {
          parentDOM.insertBefore(newDOM, parentDOM.childNodes[index]);
        } else {
          parentDOM.appendChild(newDOM);
        }
      }
      return;
    }

    // Node type changed - replace
    if (oldVNode.type !== newVNode.type || 
        (oldVNode.type === 'element' && oldVNode.props.tagName !== newVNode.props.tagName)) {
      const newDOM = this.renderVNode(newVNode);
      if (newDOM && oldDOM) {
        this.unmountNode(oldVNode);
        parentDOM.replaceChild(newDOM, oldDOM);
      }
      return;
    }

    // Same node type - update
    this.updateNode(oldVNode, newVNode, oldDOM);
  }

  /**
   * Update existing node
   */
  updateNode(oldVNode, newVNode, domNode) {
    if (!domNode) return;

    // Update DOM mapping
    this.domNodes.set(newVNode, domNode);
    this.nodeVNodes.set(domNode, newVNode);
    newVNode.ref = domNode;

    switch (newVNode.type) {
      case 'text':
        if (oldVNode.props.content !== newVNode.props.content) {
          domNode.textContent = newVNode.props.content || '';
        }
        break;

      case 'element':
        this.updateElementNode(oldVNode, newVNode, domNode);
        break;

      case 'component':
        this.updateComponentNode(oldVNode, newVNode, domNode);
        break;

      default:
        this.updateContainerNode(oldVNode, newVNode, domNode);
        break;
    }
  }

  /**
   * Update element node
   */
  updateElementNode(oldVNode, newVNode, element) {
    // Update attributes
    this.updateAttributes(element, oldVNode.props, newVNode.props);

    // Diff children
    this.diffChildren(oldVNode.children, newVNode.children, element);
  }

  /**
   * Update component node
   */
  updateComponentNode(oldVNode, newVNode, domNode) {
    const instance = this.componentInstances.get(oldVNode);
    if (!instance) return;

    // Update instance mapping
    this.componentInstances.delete(oldVNode);
    this.componentInstances.set(newVNode, instance);
    instance.vnode = newVNode;

    // Execute beforeUpdate hooks
    this.executeHooks(instance, 'beforeUpdate');

    // Check if props changed
    const oldProps = instance.props;
    const newProps = this.evaluateProps(newVNode.props.props);
    
    if (this.propsChanged(oldProps, newProps)) {
      instance.props = newProps;
      
      // Re-render component
      const result = newVNode.props.component(newProps);
      
      if (typeof result === 'string' && domNode.parentNode) {
        const temp = document.createElement('div');
        temp.innerHTML = result.trim();
        this.hydrateElement(temp);
        
        const newDOM = temp.children.length === 1 ? temp.firstElementChild : temp;
        domNode.parentNode.replaceChild(newDOM, domNode);
        
        // Update mappings
        this.domNodes.set(newVNode, newDOM);
        this.nodeVNodes.set(newDOM, newVNode);
        newVNode.ref = newDOM;
      }
    }

    // Execute updated hooks
    this.executeHooks(instance, 'updated');
  }

  /**
   * Update container node (fragment, etc.)
   */
  updateContainerNode(oldVNode, newVNode, container) {
    // For document fragments, we need to find the actual parent
    const parentDOM = container.nodeType === Node.DOCUMENT_FRAGMENT_NODE 
      ? container.parentNode || this.target 
      : container;
    
    if (parentDOM) {
      this.diffChildren(oldVNode.children, newVNode.children, parentDOM);
    }
  }

  /**
   * Diff children arrays
   */
  diffChildren(oldChildren, newChildren, parentDOM) {
    const oldLen = oldChildren.length;
    const newLen = newChildren.length;
    const maxLen = Math.max(oldLen, newLen);

    for (let i = 0; i < maxLen; i++) {
      const oldChild = i < oldLen ? oldChildren[i] : null;
      const newChild = i < newLen ? newChildren[i] : null;
      
      this.diffNode(oldChild, newChild, parentDOM, i);
    }
  }

  /**
   * Update element attributes
   */
  updateAttributes(element, oldProps, newProps) {
    const oldAttrs = { ...oldProps };
    const newAttrs = { ...newProps };
    
    // Remove tagName from comparison
    delete oldAttrs.tagName;
    delete newAttrs.tagName;

    // Remove old attributes
    for (const name in oldAttrs) {
      if (!(name in newAttrs)) {
        this.removeAttribute(element, name);
      }
    }

    // Set new/updated attributes
    for (const name in newAttrs) {
      if (oldAttrs[name] !== newAttrs[name]) {
        this.setAttributeValue(element, name, newAttrs[name]);
      }
    }
  }

  /**
   * Enhanced attribute setting with event delegation
   */
  setAttributes(element, attributes = {}) {
    for (const [name, attr] of Object.entries(attributes)) {
      if (name === 'tagName') continue;
      
      try {
        if (attr.type === 'static') {
          this.setAttributeValue(element, name, attr.value);
        } else if (attr.type === 'dynamic') {
          const value = resolveExpression(attr.compiled, this.getCurrentContext());
          if (value !== null && value !== undefined && value !== false) {
            this.setAttributeValue(element, name, value);

            // Track for reactivity
            if (this.phase2) {
              const tracker = this.reactiveElements.get(element) || {};
              tracker[`attr:${name}`] = attr.compiled;
              this.reactiveElements.set(element, tracker);
            }
          }
        } else if (this.phase2 && attr.type === 'event') {
          this.eventDelegator.bindEvent(element, name, attr.compiled);
        }
      } catch (error) {
        this.logError(`Attribute error for "${name}":`, error);
      }
    }
  }

  setAttributeValue(element, name, value) {
    if (value == null || value === false) return;
    
    if (value === true) {
      element.setAttribute(name, '');
      return;
    }

    // Handle special attributes
    if (name === 'className') {
      element.className = value;
    } else if (name === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (name in element && typeof element[name] !== 'function') {
      element[name] = value;
    } else {
      element.setAttribute(name, escapeAttribute(String(value)));
    }
  }

  removeAttribute(element, name) {
    if (name === 'className') {
      element.className = '';
    } else if (name in element && typeof element[name] !== 'function') {
      element[name] = '';
    } else {
      element.removeAttribute(name);
    }
  }

  /**
   * Enhanced hydration with mismatch detection
   */
  hydrateElement(element, expectedVNode = null) {
    if (!this.phase2) return;
    
    this.isHydrating = true;
    const mismatches = [];

    try {
      // Hydrate events from SSR
      const eventElements = element.querySelectorAll('[data-fml-on-click], [data-fml-on-submit], [data-fml-on-change]');
      
      eventElements.forEach(el => {
        ['click', 'submit', 'change', 'input', 'focus', 'blur'].forEach(eventType => {
          const attr = el.getAttribute(`data-fml-on-${eventType}`);
          if (attr) {
            this.eventDelegator.bindEvent(el, `on${eventType}`, { code: attr, safe: false });
            el.removeAttribute(`data-fml-on-${eventType}`);
          }
        });
      });

      // Check for hydration mismatches
      if (expectedVNode && this.debug) {
        this.detectHydrationMismatches(element, expectedVNode, mismatches);
      }

    } finally {
      this.isHydrating = false;
      
      if (mismatches.length > 0) {
        this.hydrationMismatches.push(...mismatches);
        this.logWarn(`Hydration mismatches detected: ${mismatches.length}`);
        if (this.debug) {
          console.table(mismatches);
        }
      }
    }
  }

  /**
   * Detect hydration mismatches
   */
  detectHydrationMismatches(domNode, vnode, mismatches) {
    if (domNode.nodeType === Node.TEXT_NODE) {
      if (vnode.type === 'text' && domNode.textContent !== vnode.props.content) {
        mismatches.push({
          type: 'text-mismatch',
          expected: vnode.props.content,
          actual: domNode.textContent,
          node: domNode
        });
      }
    } else if (domNode.nodeType === Node.ELEMENT_NODE) {
      if (vnode.type === 'element' && domNode.tagName.toLowerCase() !== vnode.props.tagName) {
        mismatches.push({
          type: 'tag-mismatch',
          expected: vnode.props.tagName,
          actual: domNode.tagName.toLowerCase(),
          node: domNode
        });
      }
    }
  }

  /**
   * Component lifecycle management
   */
  executeLifecycleQueue() {
    while (this.lifecycleQueue.length > 0) {
      const hook = this.lifecycleQueue.shift();
      try {
        hook();
      } catch (error) {
        this.logError('Lifecycle hook error:', error);
      }
    }
  }

  executeHooks(instance, hookName) {
    if (instance.hooks[hookName]) {
      instance.hooks[hookName].forEach(hook => {
        try {
          hook();
        } catch (error) {
          this.logError(`Hook ${hookName} error in ${instance.name}:`, error);
        }
      });
    }
  }

  /**
   * Unmount node and cleanup
   */
  unmountNode(vnode) {
    if (!vnode) return;

    // Unmount component
    if (vnode.type === 'component') {
      const instance = this.componentInstances.get(vnode);
      if (instance) {
        this.executeHooks(instance, 'beforeUnmount');
        this.mountedComponents.delete(instance);
        this.componentInstances.delete(vnode);
        this.executeHooks(instance, 'unmounted');
      }
    }

    // Recursively unmount children
    if (vnode.children) {
      vnode.children.forEach(child => this.unmountNode(child));
    }

    // Cleanup DOM mappings
    const domNode = this.domNodes.get(vnode);
    if (domNode) {
      this.domNodes.delete(vnode);
      this.nodeVNodes.delete(domNode);
      this.eventDelegator.cleanupNode(domNode);
    }
  }

  /**
   * Check if props changed
   */
  propsChanged(oldProps, newProps) {
    const oldKeys = Object.keys(oldProps);
    const newKeys = Object.keys(newProps);
    
    if (oldKeys.length !== newKeys.length) return true;
    
    for (const key of oldKeys) {
      if (oldProps[key] !== newProps[key]) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Context stack management
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
   * Enhanced reactive updates
   */
  updateProps(newProps) {
    if (this.isDestroyed) return;

    const oldProps = { ...this.props };
    Object.assign(this.props, newProps);

    // Check if any reactive elements need updates
    for (const [node, config] of this.reactiveElements.entries()) {
      try {
        if (config.type === 'interpolation') {
          const value = resolveExpression(config.compiled, this.getCurrentContext());
          if (node.textContent !== String(value ?? '')) {
            node.textContent = String(value ?? '');
          }
        }
        
        // Handle dynamic attributes
        for (const [key, compiled] of Object.entries(config)) {
          if (key.startsWith('attr:')) {
            const attrName = key.substring(5);
            const newValue = resolveExpression(compiled, this.getCurrentContext());
            const element = node;
            
            if (element.getAttribute && element.getAttribute(attrName) !== String(newValue)) {
              this.setAttributeValue(element, attrName, newValue);
            }
          }
        }
      } catch (error) {
        this.logError('Reactive update error:', error);
      }
    }

    // Trigger full re-render if props significantly changed
    if (this.shouldFullRerender(oldProps, newProps)) {
      this.render(this.vdom);
    }
  }

  shouldFullRerender(oldProps, newProps) {
    // Simple heuristic - can be made more sophisticated
    const criticalKeys = ['user', 'data', 'config'];
    return criticalKeys.some(key => oldProps[key] !== newProps[key]);
  }

  /**
   * Utility methods
   */
  createErrorNode(message) {
    const el = document.createElement('div');
    el.className = 'fml-error';
    el.style.cssText = 'color: red; border: 1px solid red; padding: 8px; margin: 4px;';
    el.textContent = message;
    return el;
  }

  renderVNodeToString(vnode) {
    // Simplified string rendering for component children
    if (!vnode) return '';
    
    switch (vnode.type) {
      case 'text':
        return escapeHtml(vnode.props.content || '');
      case 'element':
        const { tagName, ...attrs } = vnode.props;
        const attrStr = this.renderAttributesToString(attrs);
        const childrenStr = vnode.children.map(child => this.renderVNodeToString(child)).join('');
        return this.isSelfClosingTag(tagName)
          ? `<${tagName}${attrStr} />`
          : `<${tagName}${attrStr}>${childrenStr}</${tagName}>`;
      default:
        return vnode.children.map(child => this.renderVNodeToString(child)).join('');
    }
  }

  renderAttributesToString(attrs = {}) {
    const parts = [];
    for (const [name, attr] of Object.entries(attrs)) {
      if (name === 'tagName') continue;
      
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
      } catch (error) {
        if (this.debug) this.logWarn(`Attr stringify error: ${name}`, error);
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
        this.logError(`Prop eval error for "${name}":`, error);
        evaluated[name] = undefined;
      }
    }
    return evaluated;
  }

  isSelfClosingTag(tagName) {
    return SELF_CLOSING_TAGS.has(tagName.toLowerCase());
  }

  /**
   * Logging utilities
   */
  logDebug(message, data = null) {
    if (this.debug) {
      console.log(`[FML-Client] ${message}`, data || '');
    }
  }

  logWarn(message, data = null) {
    console.warn(`[FML-Client] ${message}`, data || '');
  }

  logError(message, error) {
    console.error(`[FML-Client] ${message}`, error);
  }

  /**
   * Performance and memory monitoring
   */
  getPerformanceStats() {
    return {
      totalRenders: this.renderStats.totalRenders,
      averageRenderTime: this.renderStats.totalRenders > 0 
        ? (this.renderStats.diffTime + this.renderStats.patchTime) / this.renderStats.totalRenders 
        : 0,
      lastRenderTime: this.renderStats.lastRenderTime,
      diffTime: this.renderStats.diffTime,
      patchTime: this.renderStats.patchTime,
      componentCount: this.componentInstances.size,
      mountedComponents: this.mountedComponents.size,
      eventHandlers: this.eventHandlers.size,
      hydrationMismatches: this.hydrationMismatches.length,
      memoryFootprint: this.getMemoryFootprint()
    };
  }

  getMemoryFootprint() {
    return {
      vdomNodes: this.domNodes.size,
      reactiveElements: this.getReactiveElementsCount(),
      eventHandlers: this.eventHandlers.size,
      componentInstances: this.componentInstances.size
    };
  }

  getReactiveElementsCount() {
    let count = 0;
    // WeakMap doesn't have size, so we can't easily count
    // This is an approximation based on tracked components
    return this.mountedComponents.size * 2; // Rough estimate
  }

  /**
   * Complete cleanup and destruction
   */
  destroy() {
    if (this.isDestroyed) return;
    
    this.logDebug('Destroying ClientRenderer');
    
    // Unmount all components
    for (const instance of this.mountedComponents) {
      this.executeHooks(instance, 'beforeUnmount');
      this.executeHooks(instance, 'unmounted');
    }
    
    // Cleanup event handlers
    this.eventDelegator.destroy();
    
    // Clear all maps and sets
    this.eventHandlers.clear();
    this.componentInstances.clear();
    this.mountedComponents.clear();
    this.lifecycleQueue.length = 0;
    this.contextStack.length = 0;
    this.componentStack.length = 0;
    
    // Clear DOM mappings
    this.domNodes = new WeakMap();
    this.nodeVNodes = new WeakMap();
    this.reactiveElements = new WeakMap();
    
    // Execute cleanup tasks
    for (const cleanup of this.cleanupTasks) {
      try {
        cleanup();
      } catch (error) {
        this.logError('Cleanup task error:', error);
      }
    }
    this.cleanupTasks.clear();
    
    this.isDestroyed = true;
  }
}

/**
 * Enhanced Event Delegation System
 */
class EventDelegator {
  constructor(renderer) {
    this.renderer = renderer;
    this.eventMap = new Map(); // element -> { eventType -> handler }
    this.delegatedEvents = new Set(['click', 'submit', 'change', 'input']);
    this.rootHandlers = new Map(); // eventType -> handler
    
    this.setupRootDelegation();
  }

  setupRootDelegation() {
    if (typeof document === 'undefined') return;
    
    this.delegatedEvents.forEach(eventType => {
      const handler = (event) => this.handleDelegatedEvent(event);
      document.addEventListener(eventType, handler, true);
      this.rootHandlers.set(eventType, handler);
    });
  }

  handleDelegatedEvent(event) {
    let target = event.target;
    
    // Traverse up the DOM tree to find handlers
    while (target && target !== document) {
      const handlers = this.eventMap.get(target);
      if (handlers && handlers[event.type]) {
        try {
          const result = handlers[event.type](event);
          if (result === false || event.defaultPrevented) {
            break;
          }
        } catch (error) {
          this.renderer.logError(`Delegated event error (${event.type}):`, error);
        }
      }
      target = target.parentNode;
    }
  }

  bindEvent(element, eventName, compiled) {
    const eventType = eventName.replace(/^on/i, '').toLowerCase();
    
    try {
      const handler = resolveExpression(compiled, this.renderer.getCurrentContext());
      
      if (typeof handler === 'function') {
        if (!this.eventMap.has(element)) {
          this.eventMap.set(element, {});
        }
        
        const wrapper = (e) => {
          try {
            return handler(e);
          } catch (err) {
            this.renderer.logError(`Event handler error for ${eventName}:`, err);
          }
        };
        
        this.eventMap.get(element)[eventType] = wrapper;
        
        // For non-delegated events, bind directly
        if (!this.delegatedEvents.has(eventType)) {
          element.addEventListener(eventType, wrapper);
          
          // Track for cleanup
          const id = `${eventType}-${Date.now()}-${Math.random()}`;
          this.renderer.eventHandlers.set(id, { element, eventType, wrapper });
        }
      }
    } catch (error) {
      this.renderer.logError(`Could not bind event ${eventName}:`, error);
    }
  }

  cleanupNode(element) {
    // Remove from event map
    this.eventMap.delete(element);
    
    // Remove direct event listeners
    for (const [id, { element: el, eventType, wrapper }] of this.renderer.eventHandlers.entries()) {
      if (el === element) {
        try {
          el.removeEventListener(eventType, wrapper);
          this.renderer.eventHandlers.delete(id);
        } catch (error) {
          this.renderer.logError('Event cleanup error:', error);
        }
      }
    }
  }

  destroy() {
    // Remove root delegation handlers
    this.rootHandlers.forEach((handler, eventType) => {
      document.removeEventListener(eventType, handler, true);
    });
    
    this.rootHandlers.clear();
    this.eventMap.clear();
    this.delegatedEvents.clear();
  }
}

/**
 * Component Lifecycle Hooks API
 */
export class ComponentLifecycle {
  static beforeMount(instance, callback) {
    instance.hooks.beforeMount.push(callback);
  }

  static mounted(instance, callback) {
    instance.hooks.mounted.push(callback);
  }

  static beforeUpdate(instance, callback) {
    instance.hooks.beforeUpdate.push(callback);
  }

  static updated(instance, callback) {
    instance.hooks.updated.push(callback);
  }

  static beforeUnmount(instance, callback) {
    instance.hooks.beforeUnmount.push(callback);
  }

  static unmounted(instance, callback) {
    instance.hooks.unmounted.push(callback);
  }
}

/**
 * Enhanced mount function with lifecycle control
 */
export function mountFML(compiled, target, props = {}, options = {}) {
  const renderer = new ClientRenderer(props, options);
  const dom = renderer.render(compiled);

  if (dom && target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el) {
      if (options.hydrate) {
        renderer.hydrateElement(el, compiled);
        renderer.vdom = renderer.astToVNode(compiled);
      } else {
        el.innerHTML = '';
        el.appendChild(dom);
      }
      
      renderer.target = el;
    }
  }

  return {
    dom,
    renderer,
    update: (newProps) => renderer.updateProps(newProps),
    destroy: () => renderer.destroy(),
    getStats: () => renderer.getPerformanceStats(),
    
    // Lifecycle management
    onBeforeMount: (callback) => renderer.lifecycleQueue.push(callback),
    onMounted: (callback) => renderer.lifecycleQueue.push(callback),
    
    // Development helpers
    debug: {
      getVDOM: () => renderer.vdom,
      getHydrationMismatches: () => renderer.hydrationMismatches,
      forceRerender: () => renderer.render(renderer.vdom)
    }
  };
}

/**
 * Enhanced hydration with better mismatch detection
 */
export function hydrateFML(target, compiled, props = {}, options = {}) {
  return mountFML(compiled, target, props, { 
    ...options, 
    hydrate: true,
    debug: options.debug || false
  });
}

/**
 * Create reactive FML instance with lifecycle management
 */
export function createReactiveFML(compiled, initialProps = {}, options = {}) {
  let instance = null;
  let isDestroyed = false;
  
  return {
    mount(target, mountOptions = {}) {
      if (isDestroyed) throw new Error('Cannot mount destroyed reactive instance');
      
      instance = mountFML(compiled, target, initialProps, {
        ...options,
        ...mountOptions,
        phase2: true
      });
      
      return instance;
    },

    update(newProps) {
      if (instance && !isDestroyed) {
        instance.update(newProps);
      }
      return this;
    },

    getProps() {
      return instance ? instance.renderer.props : initialProps;
    },

    getStats() {
      return instance ? instance.getStats() : null;
    },

    destroy() {
      if (instance) {
        instance.destroy();
        instance = null;
      }
      isDestroyed = true;
    },

    get isDestroyed() {
      return isDestroyed;
    },

    get isMounted() {
      return instance !== null && !isDestroyed;
    }
  };
}

export default {
  renderClient,
  mountFML,
  hydrateFML,
  createReactiveFML,
  ComponentLifecycle,
  ClientRenderer,
  EventDelegator,
  VNode
};

