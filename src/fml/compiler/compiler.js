// src/fml/compiler/compiler.js
import { escapeHtml } from '../utils/escape.js';

/**
 * AST Node Types (must match parser)
 */
export const NodeType = {
  DOCUMENT: 'Document',
  ELEMENT: 'Element',
  COMPONENT: 'Component',
  TEXT: 'Text',
  INTERPOLATION: 'Interpolation',
  ATTRIBUTE: 'Attribute'
};

/**
 * Full list of standard HTML5 element names
 * Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Element
 */
const VALID_HTML_TAGS = new Set([
  // Document structure
  'html', 'head', 'body', 'title', 'base', 'link', 'meta', 'style',

  // Sectioning
  'div', 'span', 'main', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'hgroup',

  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',

  // Text content
  'p', 'br', 'hr', 'pre', 'blockquote', 'cite', 'q', 'dl', 'dt', 'dd',
  'ol', 'ul', 'li', 'menu', 'summary', 'details', 'figcaption', 'figure',

  // Inline text semantics
  'a', 'em', 'strong', 'small', 'mark', 'del', 'ins', 'sub', 'sup',
  'code', 'var', 'samp', 'kbd', 'abbr', 'time', 'data', 'ruby', 'rt', 'rp',
  'b', 'i', 'u', 's', 'wbr',

  // Embedded content
  'img', 'video', 'audio', 'canvas', 'svg', 'map', 'area', 'picture', 'source',

  // Tabular data
  'table', 'caption', 'colgroup', 'col', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th',

  // Forms
  'form', 'input', 'textarea', 'button', 'select', 'option', 'optgroup',
  'label', 'fieldset', 'legend', 'datalist', 'output', 'progress', 'meter',

  // Scripting
  'script', 'noscript', 'template',

  // Interactive
  'details', 'dialog', 'summary',

  // Web Components
  'slot'
]);

// Obsolete tags that should warn in debug mode
const OBSOLETE_TAGS = new Set(['font', 'center', 's', 'strike', 'big', 'tt', 'nobr']);

// Self-closing (void) elements
export const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr', 'image'
]);

/**
 * Validates if a tag name is a standard HTML element
 * @param {string} tagName
 * @returns {boolean}
 */
function isValidHtmlTag(tagName) {
  if (typeof tagName !== 'string') return false;
  return VALID_HTML_TAGS.has(tagName.toLowerCase());
}

/**
 * Parses static value strings into appropriate types
 * @param {*} value
 * @returns {any}
 */
function parseStaticValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  // Try JSON parse for objects/arrays
  if ((value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Boolean strings
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number strings
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  return value;
}

/**
 * Compiles FML AST to renderable format
 * Focuses on performance and security
 */
export class FMLCompiler {
  constructor(options = {}) {
    this.components = options.components || {};
    this.debug = options.debug || false;
    this.context = new Map();
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
      children: node.children
        .map(child => this.compileNode(child))
        .filter(Boolean)
    };
  }

  // Compile HTML element
  compileElement(node) {
    const element = {
      type: 'element',
      tagName: node.tagName,
      attributes: this.compileAttributes(node.attributes),
      children: node.children
        .map(child => this.compileNode(child))
        .filter(Boolean)
    };

    const tagName = node.tagName.toLowerCase();

    // Warn for unknown HTML tags
    if (this.debug && !isValidHtmlTag(tagName)) {
      console.warn(`Unknown HTML tag: ${tagName}`);
    }

    // Warn for obsolete tags
    if (this.debug && OBSOLETE_TAGS.has(tagName)) {
      console.warn(`Obsolete HTML tag used: <${tagName}> — avoid in new code`);
    }

    return element;
  }

  // Compile component
  compileComponent(node) {
    const componentName = node.name;

    if (!this.components[componentName]) {
      const available = Object.keys(this.components).length
        ? Object.keys(this.components).join(', ')
        : 'none registered';
      throw new Error(`Component "${componentName}" not found. Available: ${available}`);
    }

    const props = this.compileProps(node.props);
    const children = node.children
      .map(child => this.compileNode(child))
      .filter(Boolean);

    return {
      type: 'component',
      name: componentName,
      props,
      children,
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

  // Compile interpolation {expression}
  compileInterpolation(node) {
    return {
      type: 'interpolation',
      expression: node.expression,
      compiled: this.compileExpression(node.expression)
    };
  }

  // Compile attributes
  compileAttributes(attributes) {
    const compiled = {};

    for (const attr of attributes || []) {
      if (attr.type !== NodeType.ATTRIBUTE) continue;

      if (attr.dynamic) {
        compiled[attr.name] = {
          type: 'dynamic',
          expression: attr.value,
          compiled: this.compileExpression(attr.value)
        };
      } else {
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

    for (const prop of props || []) {
      if (prop.type !== NodeType.ATTRIBUTE) continue;

      if (prop.dynamic) {
        compiled[prop.name] = {
          type: 'dynamic',
          expression: prop.value,
          compiled: this.compileExpression(prop.value)
        };
      } else {
        compiled[prop.name] = {
          type: 'static',
          value: parseStaticValue(prop.value)
        };
      }
    }

    return compiled;
  }

  // Compile expression (Phase 1: safe property access only)
  compileExpression(expression) {
    const trimmed = (expression || '').trim();

    // Safe property chain: user.name, config.api.url
    if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/.test(trimmed)) {
      return {
        type: 'property',
        path: trimmed.split('.'),
        safe: true
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
    if (trimmed === 'true') return { type: 'literal', value: true, safe: true };
    if (trimmed === 'false') return { type: 'literal', value: false, safe: true };

    // Null/undefined
    if (trimmed === 'null') return { type: 'literal', value: null, safe: true };
    if (trimmed === 'undefined') return { type: 'literal', value: undefined, safe: true };

    // Fallback: unsafe expression
    return {
      type: 'expression',
      code: trimmed,
      safe: false
    };
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

/**
 * Helper: Resolve compiled expression against context
 */
export function resolveExpression(expr, context) {
  if (!expr || typeof context !== 'object' || context === null) return undefined;

  if (expr.safe) {
    if (expr.type === 'property') {
      return expr.path.reduce((obj, key) => obj && obj[key] !== undefined ? obj[key] : undefined, context);
    }
    if (expr.type === 'literal') {
      return expr.value;
    }
  }

  // Block unsafe expressions in Phase 1
  if (expr.type === 'expression' && !expr.safe) {
    console.warn(`Unsafe expression not evaluated in Phase 1: ${expr.code}`);
    return `[Expr: ${expr.code}]`;
  }

  return undefined;
}