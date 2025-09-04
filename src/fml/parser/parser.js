// src/fml/parser/parser.js
// FML AST Parser - Production Ready (Phase 1 + Enhancements)

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
  ATTRIBUTE: 'Attribute'
};

/**
 * FML Parser
 * Converts token stream into AST
 */
export class FMLParser {
  constructor(options = {}) {
    this.debug = !!options.debug;
    this.tokens = [];
    this.position = 0;
    this.current = null;
  }

  /**
   * Main entry point: parse FML source into AST
   */
  parse(fmlContent) {
    if (typeof fmlContent !== 'string') {
      throw new TypeError('FML content must be a string');
    }

    const lexer = new FMLLexer(fmlContent, { debug: this.debug });
    this.tokens = lexer.tokenize();
    this.position = 0;
    this.current = this.tokens.length > 0 ? this.tokens[0] : null;

    if (this.debug) {
      console.log('\n🎯 Starting FML Parsing...');
      lexer.debugTokens();
    }

    const ast = this.parseDocument();

    if (this.debug) {
      console.log('\n🎯 FML AST Generated:');
      console.log(JSON.stringify(ast, null, 2));
    }

    return ast;
  }

  /**
   * Parse the root document node
   */
  parseDocument() {
    const children = [];

    while (!this.isAtEnd()) {
      const node = this.parseNode();
      if (node) {
        children.push(node);
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
      case TokenType.TAG_SELF_CLOSE:
        return this.parseSelfClosingElement();
      case TokenType.TEXT:
        return this.parseText();
      case TokenType.INTERPOLATION:
        return this.parseInterpolation();
      case TokenType.EOF:
        return null;
      default:
        this.advance(); // Skip invalid/unrecognized tokens
        return this.parseNode();
    }
  }

  /**
   * Parse an HTML element: <div attr="value">...</div>
   */
  parseElement() {
    const token = this.current;
    this.advance();

    const element = this.createNode(NodeType.ELEMENT, {
      tagName: token.value.tagName,
      attributes: this.parseAttributes(token.value.attributes),
      children: []
    });

    // Parse children until matching closing tag
    while (!this.isAtEnd() && !this.isClosingTag(token.value.tagName)) {
      const child = this.parseNode();
      if (child) {
        element.children.push(child);
      }
    }

    // Consume closing tag
    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      if (this.current.value.tagName !== token.value.tagName) {
        this.error(`Mismatched closing tag: expected </${token.value.tagName}>, got </${this.current.value.tagName}>`);
      }
      this.advance();
    } else {
      this.error(`Unclosed tag: <${token.value.tagName}>`);
    }

    return element;
  }

  /**
   * Parse a component: <MyComponent prop={value} />
   */
  parseComponent() {
    const token = this.current;
    this.advance();

    const component = this.createNode(NodeType.COMPONENT, {
      name: token.value.tagName,
      props: this.parseAttributes(token.value.attributes),
      children: []
    });

    // Parse children until closing tag
    while (!this.isAtEnd() && !this.isClosingTag(token.value.tagName)) {
      const child = this.parseNode();
      if (child) {
        component.children.push(child);
      }
    }

    // Consume closing tag
    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      this.advance();
    } else {
      this.error(`Unclosed component: <${token.value.tagName}>`);
    }

    return component;
  }

  /**
   * Parse self-closing tag: <input /> or <MyComponent />
   */
  parseSelfClosingElement() {
    const token = this.current;
    this.advance();

    const isComponent = this.isComponentName(token.value.tagName);

    return this.createNode(isComponent ? NodeType.COMPONENT : NodeType.ELEMENT, {
      [isComponent ? 'name' : 'tagName']: token.value.tagName,
      [isComponent ? 'props' : 'attributes']: this.parseAttributes(token.value.attributes),
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

    return this.createNode(NodeType.INTERPOLATION, {
      expression: token.value.trim()
    });
  }

  /**
   * Parse attributes from lexer output
   */
  parseAttributes(attributeTokens = []) {
    const attributes = [];

    for (const attr of attributeTokens) {
      if (attr.type === 'static') {
        attributes.push(
          this.createNode(NodeType.ATTRIBUTE, {
            name: attr.name,
            value: attr.value,
            dynamic: false
          })
        );
      } else if (attr.type === 'dynamic') {
        try {
          const props = this.parseDynamicProps(attr.content);
          attributes.push(...props);
        } catch (error) {
          this.error(`Invalid dynamic props: ${attr.content} → ${error.message}`);
        }
      }
    }

    return attributes;
  }

  /**
   * Parse dynamic props object: { prop: value, enabled: true }
   * 
   * ⚠️ This is a basic parser. In Phase 2, use a real JS parser (e.g., acorn).
   * For now, handles simple cases safely.
   */
  parseDynamicProps(content) {
    const props = [];
    const clean = content.trim();

    if (!clean) return props;

    // Match key-value pairs using regex (more robust than split)
    const regex = /([^,:{}]+)\s*:\s*([^,{}]+)(?=\s*,|\s*}|$)/g;
    let match;

    while ((match = regex.exec(clean)) !== null) {
      const [, key, rawValue] = match;
      const keyName = key.trim();
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
    }

    if (props.length === 0) {
      throw new Error('No valid props found');
    }

    return props;
  }

  /**
   * Parse value in dynamic prop (string, number, boolean, null)
   * Very basic but safe for now
   */
  parsePropValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;

    // Number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value);
    }

    // String (with or without quotes)
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Fallback: treat as identifier/string
    return value;
  }

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

  /**
   * Throw a formatted parse error with location
   */
  error(message) {
    const loc = this.current
      ? `line ${this.current.line}, column ${this.current.column}`
      : 'end of input';
    throw new Error(`[FML Parse Error] ${message} at ${loc}`);
  }
}

/**
 * Helper: Quick parse FML string into AST
 * @param {string} content - FML source
 * @param {boolean} debug - Enable debug logs
 * @returns {Object} AST
 */
export function parseFML(content, debug = false) {
  const parser = new FMLParser({ debug });
  return parser.parse(content);
}