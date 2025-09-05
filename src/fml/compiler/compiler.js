// src/fml/compiler/compiler.js
// Fixed FML Compiler - Phase 2 Compatible

import { createFMLError } from '../utils/helpers.js';

/**
 * AST Node Types (must match parser)
 */
export const NodeType = {
  DOCUMENT: 'Document',
  ELEMENT: 'Element',
  COMPONENT: 'Component',
  TEXT: 'Text',
  INTERPOLATION: 'Interpolation',
  ATTRIBUTE: 'Attribute',
  // Phase 2 additions
  IF: 'If',
  FOR: 'For',
  SWITCH: 'Switch',
  CASE: 'Case',
  DEFAULT: 'Default'
};

/**
 * Full list of standard HTML5 element names
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

// Built-in FML directives
const BUILTIN_DIRECTIVES = new Set([
  'If', 'Else', 'ElseIf', 'For', 'Switch', 'Case', 'Default', 'Slot'
]);

/**
 * Validates if a tag name is a standard HTML element
 */
function isValidHtmlTag(tagName) {
  if (typeof tagName !== 'string') return false;
  return VALID_HTML_TAGS.has(tagName.toLowerCase());
}

/**
 * Parses static value strings into appropriate types
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
    this.phase2 = options.phase2 !== false;
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

    try {
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
        
        // Phase 2 directives - these should be handled as components in the enhanced parser
        case NodeType.IF:
        case NodeType.FOR:
        case NodeType.SWITCH:
          if (this.debug) {
            console.warn(`Directive node ${node.type} should be handled as component. Check parser configuration.`);
          }
          return null;
        
        default:
          if (this.debug) {
            console.warn(`Unknown node type: ${node.type}`);
          }
          return null;
      }
    } catch (error) {
      if (this.debug) {
        console.error(`Error compiling node type ${node.type}:`, error);
      }
      throw error;
    }
  }

  // Compile document (root)
  compileDocument(node) {
    const children = [];
    
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          children.push(compiled);
        }
      }
    }

    return {
      type: 'fragment',
      children
    };
  }

  // Compile HTML element
  compileElement(node) {
    const element = {
      type: 'element',
      tagName: node.tagName,
      attributes: this.compileAttributes(node.attributes || []),
      children: []
    };

    // Compile children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          element.children.push(compiled);
        }
      }
    }

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

    // Handle built-in directives
    if (this.phase2 && BUILTIN_DIRECTIVES.has(componentName)) {
      return this.compileDirective(node);
    }

    // Check for registered component
    if (!this.components[componentName]) {
      const available = Object.keys(this.components).length
        ? Object.keys(this.components).join(', ')
        : 'none registered';
      
      if (this.debug) {
        console.warn(`Component "${componentName}" not found. Available: ${available}`);
        // Return a placeholder instead of throwing
        return {
          type: 'text',
          content: `[Missing Component: ${componentName}]`
        };
      }
      
      throw new Error(`Component "${componentName}" not found. Available: ${available}`);
    }

    const props = this.compileProps(node.props || []);
    const children = [];

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          children.push(compiled);
        }
      }
    }

    return {
      type: 'component',
      name: componentName,
      props,
      children,
      component: this.components[componentName]
    };
  }

  // Compile built-in directives
  compileDirective(node) {
    const directiveName = node.name;

    switch (directiveName) {
      case 'If':
        return this.compileIfDirective(node);
      case 'Else':
        return this.compileElseDirective(node);
      case 'ElseIf':
        return this.compileElseIfDirective(node);
      case 'For':
        return this.compileForDirective(node);
      case 'Switch':
        return this.compileSwitchDirective(node);
      case 'Case':
        return this.compileCaseDirective(node);
      case 'Default':
        return this.compileDefaultDirective(node);
      case 'Slot':
        return this.compileSlotDirective(node);
      default:
        if (this.debug) {
          console.warn(`Unknown directive: ${directiveName}`);
        }
        return null;
    }
  }

  compileIfDirective(node) {
    const props = node.props || [];
    const conditionProp = props.find(p => p.name === 'condition');
    
    if (!conditionProp) {
      throw new Error('If directive requires a condition attribute');
    }

    const children = [];
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          children.push(compiled);
        }
      }
    }

    return {
      type: 'if',
      condition: this.compileExpression(conditionProp.value),
      then: children.length === 1 ? children[0] : { type: 'fragment', children },
      else: null
    };
  }

  compileElseDirective(node) {
    const children = [];
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          children.push(compiled);
        }
      }
    }

    return {
      type: 'else',
      children: children.length === 1 ? children[0] : { type: 'fragment', children }
    };
  }

  compileForDirective(node) {
    const props = node.props || [];
    const eachProp = props.find(p => p.name === 'each');
    const asProp = props.find(p => p.name === 'as');
    const indexProp = props.find(p => p.name === 'index');

    if (!eachProp) {
      throw new Error('For directive requires an "each" attribute');
    }

    const children = [];
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          children.push(compiled);
        }
      }
    }

    return {
      type: 'for',
      items: this.compileExpression(eachProp.value),
      itemVar: asProp ? asProp.value : 'item',
      indexVar: indexProp ? indexProp.value : 'index',
      body: children.length === 1 ? children[0] : { type: 'fragment', children }
    };
  }

  compileSwitchDirective(node) {
    const props = node.props || [];
    const valueProp = props.find(p => p.name === 'value');

    if (!valueProp) {
      throw new Error('Switch directive requires a "value" attribute');
    }

    const cases = [];
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child.type === NodeType.COMPONENT && 
            (child.name === 'Case' || child.name === 'Default')) {
          const compiled = this.compileNode(child);
          if (compiled) {
            cases.push(compiled);
          }
        }
      }
    }

    return {
      type: 'switch',
      value: this.compileExpression(valueProp.value),
      cases
    };
  }

  compileCaseDirective(node) {
    const props = node.props || [];
    const valueProp = props.find(p => p.name === 'value');

    if (!valueProp) {
      throw new Error('Case directive requires a "value" attribute');
    }

    const children = [];
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          children.push(compiled);
        }
      }
    }

    return {
      type: 'case',
      value: this.compileExpression(valueProp.value),
      body: children.length === 1 ? children[0] : { type: 'fragment', children }
    };
  }

  compileDefaultDirective(node) {
    const children = [];
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          children.push(compiled);
        }
      }
    }

    return {
      type: 'default',
      body: children.length === 1 ? children[0] : { type: 'fragment', children }
    };
  }

  compileSlotDirective(node) {
    const props = node.props || [];
    const nameProp = props.find(p => p.name === 'name');

    const children = [];
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const compiled = this.compileNode(child);
        if (compiled) {
          children.push(compiled);
        }
      }
    }

    return {
      type: 'slot',
      name: nameProp ? nameProp.value : 'default',
      fallback: children
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

    if (!Array.isArray(attributes)) {
      return compiled;
    }

    for (const attr of attributes) {
      if (attr.type !== NodeType.ATTRIBUTE) continue;

      try {
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
      } catch (error) {
        if (this.debug) {
          console.error(`Error compiling attribute ${attr.name}:`, error);
        }
        // Fallback to static
        compiled[attr.name] = {
          type: 'static',
          value: String(attr.value || '')
        };
      }
    }

    return compiled;
  }

  // Compile component props
  compileProps(props) {
    const compiled = {};

    if (!Array.isArray(props)) {
      return compiled;
    }

    for (const prop of props) {
      if (prop.type !== NodeType.ATTRIBUTE) continue;

      try {
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
      } catch (error) {
        if (this.debug) {
          console.error(`Error compiling prop ${prop.name}:`, error);
        }
        // Fallback to static
        compiled[prop.name] = {
          type: 'static',
          value: prop.value
        };
      }
    }

    return compiled;
  }

  // Compile expression (Phase 1: safe property access only, Phase 2: enhanced)
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

    // Phase 2: Enhanced expressions
    if (this.phase2) {
      // Array access: items[0], user.data[key]
      if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*\[[^\]]+\]$/.test(trimmed)) {
        const match = trimmed.match(/^(.+)\[([^\]]+)\]$/);
        if (match) {
          const [, basePath, indexExpr] = match;
          return {
            type: 'arrayAccess',
            base: this.compileExpression(basePath),
            index: this.compileExpression(indexExpr),
            safe: true
          };
        }
      }

      // Simple comparisons: user.age > 18, status === 'active'
      const comparisonMatch = trimmed.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
      if (comparisonMatch) {
        const [, left, operator, right] = comparisonMatch;
        return {
          type: 'comparison',
          left: this.compileExpression(left.trim()),
          operator,
          right: this.compileExpression(right.trim()),
          safe: true
        };
      }

      // Logical operators: user.active && user.verified
      const logicalMatch = trimmed.match(/^(.+?)\s*(&&|\|\|)\s*(.+)$/);
      if (logicalMatch) {
        const [, left, operator, right] = logicalMatch;
        return {
          type: 'logical',
          left: this.compileExpression(left.trim()),
          operator,
          right: this.compileExpression(right.trim()),
          safe: true
        };
      }

      // Function calls: items.length, user.getName()
      if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*\(\)$/.test(trimmed)) {
        const methodPath = trimmed.replace(/\(\)$/, '');
        return {
          type: 'methodCall',
          path: methodPath.split('.'),
          args: [],
          safe: true
        };
      }

      // Method calls with property access: tasks.filter(t => t.completed).length
      if (/\.filter\(/.test(trimmed) || /\.map\(/.test(trimmed) || /\.length$/.test(trimmed)) {
        return {
          type: 'complexMethod',
          expression: trimmed,
          safe: false // Complex JS expressions are unsafe
        };
      }
    }

    // Fallback: unsafe expression (blocked in Phase 1, logged in Phase 2)
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
      debug: this.debug,
      phase2: this.phase2
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

    // Phase 2: Enhanced expression resolution
    if (expr.type === 'arrayAccess') {
      const base = resolveExpression(expr.base, context);
      const index = resolveExpression(expr.index, context);
      return base && base[index] !== undefined ? base[index] : undefined;
    }

    if (expr.type === 'comparison') {
      const left = resolveExpression(expr.left, context);
      const right = resolveExpression(expr.right, context);
      
      switch (expr.operator) {
        case '===': return left === right;
        case '!==': return left !== right;
        case '==': return left == right;
        case '!=': return left != right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        default: return false;
      }
    }

    if (expr.type === 'logical') {
      const left = resolveExpression(expr.left, context);
      
      if (expr.operator === '&&') {
        return left && resolveExpression(expr.right, context);
      }
      if (expr.operator === '||') {
        return left || resolveExpression(expr.right, context);
      }
    }

    if (expr.type === 'methodCall') {
      const obj = expr.path.slice(0, -1).reduce((obj, key) => obj && obj[key], context);
      const method = expr.path[expr.path.length - 1];
      
      if (obj && typeof obj[method] === 'function') {
        try {
          return obj[method]();
        } catch (error) {
          console.warn(`Method call error: ${expr.path.join('.')}()`, error);
          return undefined;
        }
      }
      
      // Handle property access like .length
      if (obj && obj[method] !== undefined) {
        return obj[method];
      }
    }
  }

  // Block unsafe expressions in Phase 1, warn in Phase 2
  if (expr.type === 'expression' && !expr.safe) {
    console.warn(`Unsafe expression not evaluated: ${expr.code}`);
    return `[Expr: ${expr.code}]`;
  }

  if (expr.type === 'complexMethod' && !expr.safe) {
    console.warn(`Complex expression not evaluated: ${expr.expression}`);
    return `[Complex: ${expr.expression}]`;
  }

  return undefined;
}