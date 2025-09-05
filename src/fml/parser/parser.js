// src/fml/parser/parser.js
// Enhanced FML AST Parser - Robust with Error Recovery

import { FMLLexer, TokenType } from './lexer.js';

/**
 * Abstract Syntax Tree (AST) Node Types
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
 * Valid HTML5 tags (comprehensive list)
 */
const VALID_HTML_TAGS = new Set([
  // Document & Sectioning
  'html', 'head', 'body', 'main', 'section', 'article', 'aside', 'nav', 'footer', 'header', 'hgroup',
  
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  
  // Text
  'p', 'div', 'span', 'br', 'hr', 'pre', 'blockquote', 'ol', 'ul', 'li', 'dl', 'dt', 'dd',
  'figure', 'figcaption', 'address', 'details', 'summary',
  
  // Inline
  'a', 'em', 'strong', 'small', 'mark', 'del', 'ins', 'sub', 'sup', 'code', 'var', 'samp', 'kbd',
  'abbr', 'time', 'data', 'q', 'cite', 'dfn', 'i', 'b', 'u', 's', 'wbr',
  
  // Embedded
  'img', 'audio', 'video', 'canvas', 'svg', 'map', 'area', 'picture', 'source',
  
  // Forms
  'form', 'input', 'textarea', 'button', 'select', 'option', 'optgroup', 'label',
  'fieldset', 'legend', 'datalist', 'output', 'progress', 'meter',
  
  // Tables
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  
  // Scripting
  'script', 'noscript', 'template',
  
  // Interactive
  'details', 'dialog', 'summary',
  
  // Web Components
  'slot'
]);

// Obsolete tags
const OBSOLETE_TAGS = new Set(['center', 'font', 's', 'strike', 'big', 'tt', 'nobr', 'acronym', 'dir']);

// Self-closing tags
const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Enhanced FML Parser with error recovery
 */
export class FMLParser {
  constructor(options = {}) {
    this.debug = !!options.debug;
    this.phase2 = options.phase2 !== false;
    this.strict = !!options.strict;
    this.tokens = [];
    this.position = 0;
    this.current = null;
    this.tagStack = [];
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Main entry point: parse FML source into AST
   */
  parse(fmlContent) {
    if (typeof fmlContent !== 'string') {
      throw new TypeError('FML content must be a string');
    }

    try {
      // Tokenize with enhanced lexer
      const lexer = new FMLLexer(fmlContent, { 
        debug: this.debug, 
        phase2: this.phase2 
      });
      
      this.tokens = lexer.tokenize();
      this.position = 0;
      this.current = this.tokens.length > 0 ? this.tokens[0] : null;

      if (this.debug) {
        console.log('\n🎯 Starting Enhanced FML Parsing...');
        console.log(`Tokens: ${this.tokens.length}, Phase 2: ${this.phase2}`);
      }

      const ast = this.parseDocument();

      if (this.debug) {
        console.log('\n🎯 Enhanced FML AST Generated');
        console.log(`Errors: ${this.errors.length}, Warnings: ${this.warnings.length}`);
      }

      return ast;

    } catch (error) {
      if (this.debug) {
        console.error('Parser Error:', error);
        console.log('Current token:', this.current);
        console.log('Position:', this.position);
        console.log('Tag stack:', this.tagStack);
      }
      throw this.enhanceError(error);
    }
  }

  /**
   * Parse the root document node
   */
  parseDocument() {
    const children = [];

    while (!this.isAtEnd()) {
      try {
        const node = this.parseNode();
        if (node) {
          children.push(node);
        }
      } catch (error) {
        if (this.strict) throw error;
        
        this.handleError(error);
        this.recover();
      }
    }

    return this.createNode(NodeType.DOCUMENT, { children });
  }

  /**
   * Parse a single node based on current token
   */
  parseNode() {
    if (this.isAtEnd() || !this.current) return null;

    switch (this.current.type) {
      case TokenType.TAG_OPEN:
        return this.parseElement();
      case TokenType.COMPONENT:
        return this.parseComponent();
      case TokenType.DIRECTIVE:
        return this.phase2 ? this.parseDirective() : this.parseComponent();
      case TokenType.TAG_SELF_CLOSE:
        return this.parseSelfClosingElement();
      case TokenType.TEXT:
        return this.parseText();
      case TokenType.INTERPOLATION:
      case TokenType.EXPRESSION_COMPLEX:
        return this.parseInterpolation();
      case TokenType.EOF:
        return null;
      default:
        this.warn(`Skipping unknown token type: ${this.current.type}`);
        this.advance();
        return this.parseNode();
    }
  }

  /**
   * Parse an HTML element: <div attr="value">...</div>
   */
  parseElement() {
    const token = this.current;
    const tagName = token.value.tagName;

    // Validate HTML tag
    this.validateHtmlTag(tagName);

    this.advance(); // Consume open tag

    const element = this.createNode(NodeType.ELEMENT, {
      tagName,
      attributes: this.parseAttributes(token.value.attributes),
      children: []
    });

    this.tagStack.push(tagName);

    // Parse children until matching closing tag
    while (!this.isAtEnd() && !this.isClosingTag(tagName)) {
      try {
        const child = this.parseNode();
        if (child) {
          element.children.push(child);
        }
      } catch (error) {
        if (this.strict) throw error;
        this.handleError(error);
        this.recoverInElement();
      }
    }

    // Consume closing tag
    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      const closingTagName = this.current.value.tagName;
      if (closingTagName !== tagName) {
        this.error(`Mismatched closing tag: expected </${tagName}>, got </${closingTagName}>`);
      }
      this.advance();
    } else if (!SELF_CLOSING_TAGS.has(tagName.toLowerCase())) {
      this.warn(`Unclosed tag: <${tagName}> - auto-closing`);
    }

    this.tagStack.pop();
    return element;
  }

  /**
   * Parse a component: <MyComponent prop={value} />
   */
  parseComponent() {
    const token = this.current;
    const name = token.value.tagName;

    this.advance(); // Consume open tag

    const component = this.createNode(NodeType.COMPONENT, {
      name,
      props: this.parseAttributes(token.value.attributes),
      children: []
    });

    this.tagStack.push(name);

    // Parse children until closing tag (if not self-closing)
    if (!token.value.isSelfClosing) {
      while (!this.isAtEnd() && !this.isClosingTag(name)) {
        try {
          const child = this.parseNode();
          if (child) {
            component.children.push(child);
          }
        } catch (error) {
          if (this.strict) throw error;
          this.handleError(error);
          this.recoverInElement();
        }
      }

      // Consume closing tag
      if (this.current && this.current.type === TokenType.TAG_CLOSE) {
        this.advance();
      } else {
        this.warn(`Unclosed component: <${name}> - auto-closing`);
      }
    }

    this.tagStack.pop();
    return component;
  }

  /**
   * Phase 2: Parse directive (If, For, Switch, etc.)
   */
  parseDirective() {
    if (!this.phase2) return this.parseComponent();

    const token = this.current;
    const directiveName = token.value.tagName;

    switch (directiveName) {
      case 'If':
        return this.parseIfDirective();
      case 'For':
        return this.parseForDirective();
      case 'Switch':
        return this.parseSwitchDirective();
      default:
        this.warn(`Unknown directive: ${directiveName}, treating as component`);
        return this.parseComponent();
    }
  }

  parseIfDirective() {
    const token = this.current;
    this.advance();

    // Extract condition from attributes
    const attributes = this.parseAttributes(token.value.attributes);
    const conditionAttr = attributes.find(attr => attr.name === 'condition');
    
    if (!conditionAttr) {
      this.error('If directive requires a condition attribute');
    }

    const condition = conditionAttr.value;
    this.tagStack.push('If');

    // Parse then branch
    const thenNode = this.parseNode();

    // Look for Else or ElseIf
    let elseNode = null;
    if (this.current && this.current.type === TokenType.DIRECTIVE) {
      const nextDirective = this.current.value.tagName;
      if (nextDirective === 'Else' || nextDirective === 'ElseIf') {
        elseNode = this.parseNode();
      }
    }

    // Consume closing If tag
    if (this.current && this.current.type === TokenType.TAG_CLOSE && 
        this.current.value.tagName === 'If') {
      this.advance();
    }

    this.tagStack.pop();
    
    return this.createNode(NodeType.IF, {
      condition,
      then: thenNode,
      else: elseNode
    });
  }

  parseForDirective() {
    const token = this.current;
    this.advance();

    const attributes = this.parseAttributes(token.value.attributes);
    const eachAttr = attributes.find(attr => attr.name === 'each');
    const asAttr = attributes.find(attr => attr.name === 'as');
    const indexAttr = attributes.find(attr => attr.name === 'index');

    if (!eachAttr) {
      this.error('For directive requires an "each" attribute');
    }

    this.tagStack.push('For');

    // Parse loop body
    const children = [];
    while (!this.isAtEnd() && !this.isClosingTag('For')) {
      const child = this.parseNode();
      if (child) children.push(child);
    }

    // Consume closing For tag
    if (this.current && this.current.type === TokenType.TAG_CLOSE && 
        this.current.value.tagName === 'For') {
      this.advance();
    }

    this.tagStack.pop();

    return this.createNode(NodeType.FOR, {
      items: eachAttr.value,
      itemVar: asAttr ? asAttr.value : 'item',
      indexVar: indexAttr ? indexAttr.value : 'index',
      body: children.length === 1 ? children[0] : this.createNode(NodeType.DOCUMENT, { children })
    });
  }

  parseSwitchDirective() {
    const token = this.current;
    this.advance();

    const attributes = this.parseAttributes(token.value.attributes);
    const valueAttr = attributes.find(attr => attr.name === 'value');

    if (!valueAttr) {
      this.error('Switch directive requires a "value" attribute');
    }

    this.tagStack.push('Switch');

    // Parse cases
    const cases = [];
    while (!this.isAtEnd() && !this.isClosingTag('Switch')) {
      const child = this.parseNode();
      if (child && (child.type === NodeType.CASE || child.type === NodeType.DEFAULT)) {
        cases.push(child);
      } else if (child) {
        this.warn('Only Case and Default nodes allowed inside Switch');
      }
    }

    // Consume closing Switch tag
    if (this.current && this.current.type === TokenType.TAG_CLOSE && 
        this.current.value.tagName === 'Switch') {
      this.advance();
    }

    this.tagStack.pop();

    return this.createNode(NodeType.SWITCH, {
      value: valueAttr.value,
      cases
    });
  }

  /**
   * Parse self-closing tag: <input /> or <MyComponent />
   */
  parseSelfClosingElement() {
    const token = this.current;
    const tagName = token.value.tagName;
    const isComponent = this.isComponentName(tagName);

    this.advance(); // Consume self-closing tag

    const nodeType = isComponent ? NodeType.COMPONENT : NodeType.ELEMENT;
    const propKey = isComponent ? 'props' : 'attributes';

    return this.createNode(nodeType, {
      [isComponent ? 'name' : 'tagName']: tagName,
      [propKey]: this.parseAttributes(token.value.attributes),
      children: []
    });
  }

  /**
   * Parse plain text node
   */
  parseText() {
    const token = this.current;
    this.advance();

    return this.createNode(NodeType.TEXT, {
      content: token.value
    });
  }

  /**
   * Parse interpolation: {expression}
   */
  parseInterpolation() {
    const token = this.current;
    this.advance();

    const nodeType = token.type === TokenType.EXPRESSION_COMPLEX 
      ? NodeType.INTERPOLATION 
      : NodeType.INTERPOLATION;

    return this.createNode(nodeType, {
      expression: token.value.trim(),
      complex: token.type === TokenType.EXPRESSION_COMPLEX
    });
  }

  /**
   * Parse attributes from lexer output
   */
  parseAttributes(attributeTokens = []) {
    const attributes = [];

    for (const attr of attributeTokens) {
      try {
        if (attr.type === TokenType.ATTRIBUTE_STATIC) {
          const val = attr.value;
          attributes.push(
            this.createNode(NodeType.ATTRIBUTE, {
              name: val.name,
              value: val.value,
              dynamic: false
            })
          );
        } else if (attr.type === TokenType.ATTRIBUTE_DYNAMIC || attr.type === TokenType.EVENT_HANDLER) {
          const val = attr.value;
          if (val.type === 'dynamic' || val.type === 'event') {
            attributes.push(
              this.createNode(NodeType.ATTRIBUTE, {
                name: val.name,
                value: val.content,
                dynamic: true,
                event: val.type === 'event'
              })
            );
          } else if (val.type === 'dynamic-object') {
            try {
              const props = this.parseDynamicProps(val.content);
              attributes.push(...props);
            } catch (error) {
              this.error(`Invalid dynamic props: ${val.content} → ${error.message}`);
            }
          }
        }
      } catch (error) {
        if (this.strict) throw error;
        this.handleError(error, `Failed to parse attribute: ${JSON.stringify(attr)}`);
      }
    }

    return attributes;
  }

  /**
   * Parse dynamic props object: { prop: value, enabled: true }
   */
  parseDynamicProps(content) {
    const props = [];
    const clean = content.trim();

    if (!clean) return props;

    // Enhanced regex for key-value pairs
    const regex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([^,}]+)(?=\s*[,}]|$)/g;
    let match;

    while ((match = regex.exec(clean)) !== null) {
      const [, key, rawValue] = match;
      const keyName = key.trim();
      
      try {
        const value = this.parsePropValue(rawValue.trim());
        
        if (keyName && value !== undefined) {
          props.push(
            this.createNode(NodeType.ATTRIBUTE, {
              name: keyName,
              value,
              dynamic: true
            })
          );
        }
      } catch (error) {
        this.warn(`Failed to parse prop value: ${rawValue}`);
      }
    }

    if (props.length === 0) {
      throw new Error('No valid props found in object syntax');
    }

    return props;
  }

  /**
   * Parse value in dynamic prop (enhanced type detection)
   */
  parsePropValue(value) {
    const trimmed = value.trim();
    
    // Boolean values
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    
    // Null/undefined
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;

    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    // Strings (quoted)
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    // Arrays (basic)
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed; // Fallback to string
      }
    }

    // Objects (basic)
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed; // Fallback to string
      }
    }

    // Default: treat as identifier/expression
    return trimmed;
  }

  // === Helper Methods ===

  /**
   * Check if current token is closing tag for given name
   */
  isClosingTag(tagName) {
    return (
      this.current &&
      this.current.type === TokenType.TAG_CLOSE &&
      this.current.value.tagName === tagName
    );
  }

  /**
   * Determine if tag name is a component (PascalCase)
   */
  isComponentName(name) {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
  }

  /**
   * Check if we've reached end of token stream
   */
  isAtEnd() {
    return !this.current || this.current.type === TokenType.EOF;
  }

  /**
   * Advance to next token
   */
  advance() {
    if (this.position < this.tokens.length - 1) {
      this.position++;
      this.current = this.tokens[this.position];
    } else {
      this.current = null;
    }
  }

  /**
   * Create a standardized AST node
   */
  createNode(type, properties) {
    const node = { type, ...properties };

    // Add location only if current token has it
    if (this.current && this.current.line !== undefined && this.current.column !== undefined) {
      node.location = {
        line: this.current.line,
        column: this.current.column
      };
    }

    return node;
  }

  // === Validation ===

  validateHtmlTag(tagName) {
    const lowerTag = tagName.toLowerCase();
    
    if (!VALID_HTML_TAGS.has(lowerTag)) {
      this.warn(`Unknown HTML tag: <${tagName}>`);
    }
    
    if (OBSOLETE_TAGS.has(lowerTag)) {
      this.warn(`Obsolete HTML tag: <${tagName}> - consider modern alternatives`);
    }
  }

  // === Error Handling & Recovery ===

  error(message) {
    const loc = this.current
      ? `line ${this.current.line}, column ${this.current.column}`
      : 'end of input';
    
    const context = this.getParseContext();
    const fullMessage = `${message} at ${loc}\n${context}`;
    
    const error = new Error(`[FML Parse Error] ${fullMessage}`);
    error.location = this.current ? { line: this.current.line, column: this.current.column } : null;
    error.context = context;
    
    throw error;
  }

  warn(message) {
    const warning = {
      message,
      location: this.current ? { line: this.current.line, column: this.current.column } : null,
      tagStack: [...this.tagStack]
    };
    
    this.warnings.push(warning);
    
    if (this.debug) {
      const loc = warning.location ? `(${warning.location.line}:${warning.location.column})` : '';
      console.warn(`[FML Warning] ${message} ${loc}`);
    }
  }

  handleError(error, context = '') {
    this.errors.push({
      error,
      context,
      location: this.current ? { line: this.current.line, column: this.current.column } : null,
      tagStack: [...this.tagStack]
    });

    if (this.debug) {
      console.error(`[FML Error] ${error.message}${context ? ` (${context})` : ''}`);
    }
  }

  recover() {
    // Try to find the next safe parsing point
    let recovered = false;
    
    while (!this.isAtEnd() && !recovered) {
      const token = this.current;
      
      if (token.type === TokenType.TAG_OPEN || 
          token.type === TokenType.TAG_CLOSE ||
          token.type === TokenType.COMPONENT ||
          token.type === TokenType.DIRECTIVE) {
        recovered = true;
        break;
      }
      
      this.advance();
    }
    
    return recovered;
  }

  recoverInElement() {
    // Recovery within element parsing
    while (!this.isAtEnd()) {
      const token = this.current;
      
      if (token.type === TokenType.TAG_CLOSE ||
          token.type === TokenType.TAG_OPEN ||
          token.type === TokenType.COMPONENT) {
        break;
      }
      
      this.advance();
    }
  }

  getParseContext() {
    const stack = this.tagStack.length > 0 ? `Tag stack: ${this.tagStack.join(' > ')}` : 'No open tags';
    const pos = this.current ? `Token: ${this.current.type}` : 'No current token';
    return `${stack}\n${pos}`;
  }

  enhanceError(error) {
    if (error.location) {
      return error; // Already enhanced
    }

    const enhanced = new Error(error.message);
    enhanced.name = 'FMLParseError';
    enhanced.location = this.current ? { 
      line: this.current.line, 
      column: this.current.column 
    } : null;
    enhanced.context = this.getParseContext();
    enhanced.tagStack = [...this.tagStack];
    enhanced.errors = this.errors;
    enhanced.warnings = this.warnings;
    enhanced.originalError = error;

    return enhanced;
  }

  // === Stats & Debug ===

  getStats() {
    return {
      tokensProcessed: this.position,
      totalTokens: this.tokens.length,
      errors: this.errors.length,
      warnings: this.warnings.length,
      tagStackDepth: this.tagStack.length,
      phase2: this.phase2,
      strict: this.strict
    };
  }
}

/**
 * Helper: Quick parse FML string into AST
 */
export function parseFML(content, debug = false, phase2 = true) {
  const parser = new FMLParser({ debug, phase2 });
  return parser.parse(content);
}