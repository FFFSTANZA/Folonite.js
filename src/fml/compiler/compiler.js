// src/fml/compiler/compiler.js
import { escapeHtml } from '../utils/escape.js';

/**
 * Compiles FML AST to renderable format
 * Focuses on performance and security
 */
export class FMLCompiler {
  constructor(options = {}) {
    this.components = options.components || {};
    this.debug = options.debug || false;
    this.context = new Map(); // For tracking context during compilation
  }

  // Main compilation method
  compile(ast) {
    if (!ast || ast.type !== NodeType.DOCUMENT) {
      throw new Error('Invalid AST: expected Document node');
    }

    const compiled = this.compileNode(ast);
    
    if (this.debug) {
      console.log('Compiled FML:', compiled);
    }

    return compiled;
  }

  // Compile individual node
  compileNode(node) {
    if (!node) return null;

    switch (node.type) {
      case NodeType.DOCUMENT:
        return this.compileDocument(node);
      
      case NodeType.ELEMENT:
        return this.compileElement(node);
      
      case NodeType.COMPONENT:
        return this.compileComponent(node);
      
      case NodeType.TEXT:
        return this.compileText(node);
      
      case NodeType.INTERPOLATION:
        return this.compileInterpolation(node);
      
      default:
        if (this.debug) {
          console.warn(`Unknown node type: ${node.type}`);
        }
        return null;
    }
  }

  // Compile document (root)
  compileDocument(node) {
    return {
      type: 'fragment',
      children: node.children.map(child => this.compileNode(child)).filter(Boolean)
    };
  }

  // Compile HTML element
  compileElement(node) {
    const element = {
      type: 'element',
      tagName: node.tagName,
      attributes: this.compileAttributes(node.attributes),
      children: node.children.map(child => this.compileNode(child)).filter(Boolean)
    };

    // Validate HTML tag
    if (!this.isValidHtmlTag(node.tagName)) {
      if (this.debug) {
        console.warn(`Unknown HTML tag: ${node.tagName}`);
      }
    }

    return element;
  }

  // Compile component
  compileComponent(node) {
    const componentName = node.name;
    
    // Check if component exists
    if (!this.components[componentName]) {
      throw new Error(`Component "${componentName}" not found. Available: ${Object.keys(this.components).join(', ')}`);
    }

    const props = this.compileProps(node.props);
    const children = node.children.map(child => this.compileNode(child)).filter(Boolean);

    return {
      type: 'component',
      name: componentName,
      props: props,
      children: children,
      // Reference to actual component function for rendering
      component: this.components[componentName]
    };
  }

  // Compile text node
  compileText(node) {
    return {
      type: 'text',
      content: node.content
    };
  }

  // Compile interpolation
  compileInterpolation(node) {
    return {
      type: 'interpolation',
      expression: node.expression,
      // Pre-compile expression for performance (basic version)
      compiled: this.compileExpression(node.expression)
    };
  }

  // Compile attributes
  compileAttributes(attributes) {
    const compiled = {};
    
    for (const attr of attributes) {
      if (attr.type !== NodeType.ATTRIBUTE) continue;
      
      if (attr.dynamic) {
        // Dynamic attribute - needs runtime evaluation
        compiled[attr.name] = {
          type: 'dynamic',
          expression: attr.value,
          compiled: this.compileExpression(attr.value)
        };
      } else {
        // Static attribute
        compiled[attr.name] = {
          type: 'static',
          value: attr.value
        };
      }
    }
    
    return compiled;
  }

  // Compile component props
  compileProps(props) {
    const compiled = {};
    
    for (const prop of props) {
      if (prop.type !== NodeType.ATTRIBUTE) continue;
      
      if (prop.dynamic) {
        // Dynamic prop - evaluate at runtime
        compiled[prop.name] = {
          type: 'dynamic',
          expression: prop.value,
          compiled: this.compileExpression(prop.value)
        };
      } else {
        // Static prop
        compiled[prop.name] = {
          type: 'static',
          value: this.parseStaticValue(prop.value)
        };
      }
    }
    
    return compiled;
  }

  // Compile expression (basic implementation)
  compileExpression(expression) {
    // Phase 1: Simple variable access and property chains
    // Phase 2: Full expression parsing with operators, functions, etc.
    
    const trimmed = expression.trim();
    
    // Simple variable access: user.name, data.items, etc.
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(trimmed)) {
      return {
        type: 'property',
        path: trimmed.split('.'),
        safe: true // Mark as safe for property access
      };
    }

    // String literals
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return {
        type: 'literal',
        value: trimmed.slice(1, -1),
        safe: true
      };
    }

    // Number literals
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return {
        type: 'literal',
        value: parseFloat(trimmed),
        safe: true
      };
    }

    // Boolean literals
    if (trimmed === 'true' || trimmed === 'false') {
      return {
        type: 'literal',
        value: trimmed === 'true',
        safe: true
      };
    }

    // Fallback: treat as unsafe expression (evaluate at runtime)
    return {
      type: 'expression',
      code: trimmed,
      safe: false
    };
  }

  // Parse static value (convert strings to appropriate types)
  parseStaticValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return value;
    
    // Try to parse as JSON for objects/arrays
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value; // Keep as string if not valid JSON
      }
    }
    
    // Parse boolean strings
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Parse number strings
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    
    return value;
  }

  // Validate HTML tag names (basic set)
  isValidHtmlTag(tagName) {
    const validTags = new Set([
      // Common HTML5 tags
      'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img', 'ul', 'ol', 'li', 'nav', 'header', 'footer',
      'main', 'section', 'article', 'aside', 'form', 'input',
      'button', 'textarea', 'select', 'option', 'label',
      'table', 'tr', 'td', 'th', 'thead', 'tbody', 'br', 'hr'
    ]);
    
    return validTags.has(tagName.toLowerCase());
  }

  // Add component to registry
  addComponent(name, component) {
    this.components[name] = component;
  }

  // Remove component from registry
  removeComponent(name) {
    delete this.components[name];
  }

  // Get compilation stats
  getStats() {
    return {
      componentsRegistered: Object.keys(this.components).length,
      debug: this.debug
    };
  }
}