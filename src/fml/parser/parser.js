// src/fml/parser/parser.js
// Enhanced FML AST Parser - Robust with Error Recovery, Source Maps, and Lookahead

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
  ELSE: 'Else',
  ELSE_IF: 'ElseIf',
  FOR: 'For',
  SWITCH: 'Switch',
  CASE: 'Case',
  DEFAULT: 'Default',
  SLOT: 'Slot'
};

/**
 * Parser states for recovery and debugging
 */
const ParserState = {
  PARSING: 'PARSING',
  RECOVERING: 'RECOVERING',
  LOOKAHEAD: 'LOOKAHEAD',
  BACKTRACKING: 'BACKTRACKING'
};

/**
 * Recovery strategies for different parsing contexts
 */
const RecoveryStrategy = {
  SKIP_TO_NEXT_TAG: 'SKIP_TO_NEXT_TAG',
  SKIP_TO_CLOSING_TAG: 'SKIP_TO_CLOSING_TAG',
  SKIP_TO_SIBLING: 'SKIP_TO_SIBLING',
  CONSUME_AND_CONTINUE: 'CONSUME_AND_CONTINUE',
  ABORT_CURRENT_CONTEXT: 'ABORT_CURRENT_CONTEXT'
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

// Obsolete and self-closing tags
const OBSOLETE_TAGS = new Set(['center', 'font', 's', 'strike', 'big', 'tt', 'nobr', 'acronym', 'dir']);
const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

// Component circular reference tracking
class ComponentGraph {
  constructor() {
    this.dependencies = new Map();
    this.visitStack = new Set();
  }

  addDependency(parent, child) {
    if (!this.dependencies.has(parent)) {
      this.dependencies.set(parent, new Set());
    }
    this.dependencies.get(parent).add(child);
  }

  hasCyclicDependency(component, visited = new Set(), recursionStack = new Set()) {
    if (recursionStack.has(component)) {
      return true; // Cycle detected
    }
    if (visited.has(component)) {
      return false; // Already processed
    }

    visited.add(component);
    recursionStack.add(component);

    const deps = this.dependencies.get(component);
    if (deps) {
      for (const dep of deps) {
        if (this.hasCyclicDependency(dep, visited, recursionStack)) {
          return true;
        }
      }
    }

    recursionStack.delete(component);
    return false;
  }

  getCyclePath(component) {
    const path = [];
    const visited = new Set();
    
    const findCycle = (current, currentPath) => {
      if (visited.has(current)) {
        const cycleStart = currentPath.indexOf(current);
        if (cycleStart !== -1) {
          return currentPath.slice(cycleStart);
        }
        return null;
      }

      visited.add(current);
      currentPath.push(current);

      const deps = this.dependencies.get(current);
      if (deps) {
        for (const dep of deps) {
          const cyclePath = findCycle(dep, [...currentPath]);
          if (cyclePath) return cyclePath;
        }
      }

      return null;
    };

    return findCycle(component, []);
  }
}

/**
 * Source map generation for debugging
 */
class SourceMap {
  constructor(originalSource) {
    this.originalSource = originalSource;
    this.mappings = [];
    this.sourceLines = originalSource.split('\n');
  }

  addMapping(generated, original) {
    this.mappings.push({
      generated: { ...generated },
      original: { ...original }
    });
  }

  findOriginalLocation(generatedLine, generatedColumn) {
    for (const mapping of this.mappings) {
      if (mapping.generated.line === generatedLine && 
          mapping.generated.column === generatedColumn) {
        return mapping.original;
      }
    }
    return null;
  }

  getOriginalSourceLine(line) {
    return this.sourceLines[line - 1] || '';
  }

  generateSourceMapV3() {
    return {
      version: 3,
      sources: ['template.fml'],
      sourcesContent: [this.originalSource],
      mappings: this.encodeMappings(),
      names: []
    };
  }

  encodeMappings() {
    // Simplified VLQ encoding for demo
    return this.mappings.map(m => 
      `${m.generated.line},${m.generated.column},0,${m.original.line},${m.original.column}`
    ).join(';');
  }
}

/**
 * Enhanced FML Parser with advanced error recovery and source mapping
 */
export class FMLParser {
  constructor(options = {}) {
    this.debug = !!options.debug;
    this.phase2 = options.phase2 !== false;
    this.strict = !!options.strict;
    this.generateSourceMap = !!options.sourceMap;
    this.maxErrors = options.maxErrors || 20;
    this.maxRecoveryAttempts = options.maxRecoveryAttempts || 5;
    
    // Parser state
    this.tokens = [];
    this.position = 0;
    this.current = null;
    this.state = ParserState.PARSING;
    
    // Context tracking
    this.tagStack = [];
    this.componentStack = [];
    this.nodeDepth = 0;
    this.componentGraph = new ComponentGraph();
    
    // Error handling
    this.errors = [];
    this.warnings = [];
    this.recoveryAttempts = 0;
    
    // Source mapping
    this.sourceMap = null;
    this.originalSource = '';
    
    // State checkpoints for backtracking
    this.checkpoints = [];
    this.lookaheadCache = new Map();
    
    // Performance tracking
    this.stats = {
      nodesCreated: 0,
      recoveryOperations: 0,
      lookaheadOperations: 0,
      backtrackOperations: 0,
      startTime: 0,
      parseTime: 0
    };
  }

  /**
   * Main entry point: parse FML source into AST with source mapping
   */
  parse(fmlContent, filename = 'template.fml') {
    if (typeof fmlContent !== 'string') {
      throw new TypeError('FML content must be a string');
    }

    this.stats.startTime = performance.now();
    this.originalSource = fmlContent;
    
    if (this.generateSourceMap) {
      this.sourceMap = new SourceMap(fmlContent);
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
        console.log(`Tokens: ${this.tokens.length}, Phase 2: ${this.phase2}, Source Maps: ${this.generateSourceMap}`);
      }

      const ast = this.parseDocument();
      
      // Add metadata to AST
      ast.metadata = {
        filename,
        sourceMap: this.generateSourceMap ? this.sourceMap.generateSourceMapV3() : null,
        stats: this.getStats(),
        errors: this.errors,
        warnings: this.warnings
      };

      this.stats.parseTime = performance.now() - this.stats.startTime;

      if (this.debug) {
        console.log('\n🎯 Enhanced FML AST Generated');
        console.log(`Errors: ${this.errors.length}, Warnings: ${this.warnings.length}`);
        console.log(`Parse time: ${this.stats.parseTime.toFixed(2)}ms`);
      }

      return ast;

    } catch (error) {
      if (this.debug) {
        console.error('Parser Error:', error);
        console.log('Current token:', this.current);
        console.log('Position:', this.position);
        console.log('Tag stack:', this.tagStack);
        console.log('Component stack:', this.componentStack);
      }
      throw this.enhanceError(error);
    }
  }

  /**
   * Parse the root document node
   */
  parseDocument() {
    const children = [];
    const documentNode = this.createNode(NodeType.DOCUMENT, { children }, null, 0);

    while (!this.isAtEnd() && this.errors.length < this.maxErrors) {
      try {
        const node = this.parseNode(documentNode);
        if (node) {
          children.push(node);
        }
      } catch (error) {
        if (this.strict) throw error;
        
        this.handleError(error);
        if (!this.attemptRecovery()) {
          break; // Recovery failed, stop parsing
        }
      }
    }

    return documentNode;
  }

  /**
   * Parse a single node with enhanced context tracking
   */
  parseNode(parent = null) {
    if (this.isAtEnd() || !this.current) return null;

    this.nodeDepth++;
    let node = null;

    try {
      switch (this.current.type) {
        case TokenType.TAG_OPEN:
          node = this.parseElement(parent);
          break;
        case TokenType.COMPONENT:
          node = this.parseComponent(parent);
          break;
        case TokenType.DIRECTIVE:
          node = this.phase2 ? this.parseDirective(parent) : this.parseComponent(parent);
          break;
        case TokenType.TAG_SELF_CLOSE:
          node = this.parseSelfClosingElement(parent);
          break;
        case TokenType.TEXT:
          node = this.parseText(parent);
          break;
        case TokenType.INTERPOLATION:
        case TokenType.EXPRESSION_COMPLEX:
          node = this.parseInterpolation(parent);
          break;
        case TokenType.EOF:
          return null;
        default:
          this.warn(`Skipping unknown token type: ${this.current.type}`);
          this.advance();
          return this.parseNode(parent);
      }

      // Add parent reference and depth metadata
      if (node) {
        node.parent = parent;
        node.depth = this.nodeDepth;
        this.addSourceMapping(node);
      }

    } finally {
      this.nodeDepth--;
    }

    return node;
  }

  /**
   * Parse HTML element with enhanced validation
   */
  parseElement(parent) {
    const token = this.current;
    const tagName = token.value.tagName;

    // Validate HTML tag
    this.validateHtmlTag(tagName);

    this.advance(); // Consume open tag

    const element = this.createNode(NodeType.ELEMENT, {
      tagName,
      attributes: this.parseAttributes(token.value.attributes),
      children: []
    }, parent, this.nodeDepth);

    this.tagStack.push({ name: tagName, node: element, position: this.position });

    // Parse children until matching closing tag
    while (!this.isAtEnd() && !this.isClosingTag(tagName)) {
      try {
        const child = this.parseNode(element);
        if (child) {
          element.children.push(child);
        }
      } catch (error) {
        if (this.strict) throw error;
        this.handleError(error);
        if (!this.recoverInElement(tagName)) {
          break;
        }
      }
    }

    // Handle closing tag with lookahead validation
    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      const closingTagName = this.current.value.tagName;
      if (closingTagName !== tagName) {
        // Try lookahead to find correct closing tag
        const correctClosing = this.lookAheadForClosingTag(tagName);
        if (correctClosing) {
          this.warn(`Mismatched closing tag: expected </${tagName}>, got </${closingTagName}>. Auto-correcting.`);
          this.position = correctClosing.position;
          this.current = correctClosing.token;
        } else {
          this.error(`Mismatched closing tag: expected </${tagName}>, got </${closingTagName}>`);
        }
      }
      this.advance();
    } else if (!SELF_CLOSING_TAGS.has(tagName.toLowerCase())) {
      this.warn(`Unclosed tag: <${tagName}> - auto-closing`);
    }

    this.tagStack.pop();
    return element;
  }

  /**
   * Parse component with circular reference detection
   */
  parseComponent(parent) {
    const token = this.current;
    const name = token.value.tagName;

    // Check for circular references
    if (this.componentStack.some(comp => comp.name === name)) {
      const cyclePath = this.componentGraph.getCyclePath(name);
      this.error(`Circular component reference detected: ${cyclePath ? cyclePath.join(' -> ') : name}`);
    }

    this.advance(); // Consume open tag

    const component = this.createNode(NodeType.COMPONENT, {
      name,
      props: this.parseAttributes(token.value.attributes),
      children: []
    }, parent, this.nodeDepth);

    // Track component dependencies
    if (this.componentStack.length > 0) {
      const parentComponent = this.componentStack[this.componentStack.length - 1];
      this.componentGraph.addDependency(parentComponent.name, name);
    }

    this.tagStack.push({ name, node: component, position: this.position });
    this.componentStack.push({ name, node: component, position: this.position });

    // Parse children until closing tag (if not self-closing)
    if (!token.value.isSelfClosing) {
      while (!this.isAtEnd() && !this.isClosingTag(name)) {
        try {
          const child = this.parseNode(component);
          if (child) {
            component.children.push(child);
          }
        } catch (error) {
          if (this.strict) throw error;
          this.handleError(error);
          if (!this.recoverInElement(name)) {
            break;
          }
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
    this.componentStack.pop();
    return component;
  }

  /**
   * Enhanced Phase 2 directive parsing
   */
  parseDirective(parent) {
    if (!this.phase2) return this.parseComponent(parent);

    const token = this.current;
    const directiveName = token.value.tagName;

    switch (directiveName) {
      case 'If':
        return this.parseIfDirective(parent);
      case 'Else':
        return this.parseElseDirective(parent);
      case 'ElseIf':
        return this.parseElseIfDirective(parent);
      case 'For':
        return this.parseForDirective(parent);
      case 'Switch':
        return this.parseSwitchDirective(parent);
      case 'Case':
        return this.parseCaseDirective(parent);
      case 'Default':
        return this.parseDefaultDirective(parent);
      case 'Slot':
        return this.parseSlotDirective(parent);
      default:
        this.warn(`Unknown directive: ${directiveName}, treating as component`);
        return this.parseComponent(parent);
    }
  }

  parseIfDirective(parent) {
    const token = this.current;
    this.advance();

    const attributes = this.parseAttributes(token.value.attributes);
    const conditionAttr = attributes.find(attr => attr.name === 'condition');
    
    if (!conditionAttr) {
      this.error('If directive requires a condition attribute');
    }

    const ifNode = this.createNode(NodeType.IF, {
      condition: conditionAttr.value,
      children: []
    }, parent, this.nodeDepth);

    this.tagStack.push({ name: 'If', node: ifNode, position: this.position });

    // Parse then branch
    while (!this.isAtEnd() && !this.isClosingTag('If') && 
           !this.isDirective('Else') && !this.isDirective('ElseIf')) {
      const child = this.parseNode(ifNode);
      if (child) {
        ifNode.children.push(child);
      }
    }

    // Handle Else/ElseIf chains
    const elseChain = [];
    while (this.isDirective('ElseIf') || this.isDirective('Else')) {
      const elseNode = this.parseNode(ifNode);
      if (elseNode) {
        elseChain.push(elseNode);
      }
    }

    if (elseChain.length > 0) {
      ifNode.elseChain = elseChain;
    }

    // Consume closing If tag
    if (this.current && this.current.type === TokenType.TAG_CLOSE && 
        this.current.value.tagName === 'If') {
      this.advance();
    }

    this.tagStack.pop();
    return ifNode;
  }

  parseElseDirective(parent) {
    const token = this.current;
    this.advance();

    const elseNode = this.createNode(NodeType.ELSE, {
      children: []
    }, parent, this.nodeDepth);

    // Parse until closing Else tag
    while (!this.isAtEnd() && !this.isClosingTag('Else')) {
      const child = this.parseNode(elseNode);
      if (child) {
        elseNode.children.push(child);
      }
    }

    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      this.advance();
    }

    return elseNode;
  }

  parseElseIfDirective(parent) {
    const token = this.current;
    this.advance();

    const attributes = this.parseAttributes(token.value.attributes);
    const conditionAttr = attributes.find(attr => attr.name === 'condition');
    
    if (!conditionAttr) {
      this.error('ElseIf directive requires a condition attribute');
    }

    const elseIfNode = this.createNode(NodeType.ELSE_IF, {
      condition: conditionAttr.value,
      children: []
    }, parent, this.nodeDepth);

    // Parse until closing ElseIf tag
    while (!this.isAtEnd() && !this.isClosingTag('ElseIf')) {
      const child = this.parseNode(elseIfNode);
      if (child) {
        elseIfNode.children.push(child);
      }
    }

    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      this.advance();
    }

    return elseIfNode;
  }

  parseForDirective(parent) {
    const token = this.current;
    this.advance();

    const attributes = this.parseAttributes(token.value.attributes);
    const eachAttr = attributes.find(attr => attr.name === 'each');
    const asAttr = attributes.find(attr => attr.name === 'as');
    const indexAttr = attributes.find(attr => attr.name === 'index');
    const keyAttr = attributes.find(attr => attr.name === 'key');

    if (!eachAttr) {
      this.error('For directive requires an "each" attribute');
    }

    const forNode = this.createNode(NodeType.FOR, {
      iterable: eachAttr.value,
      itemName: asAttr ? asAttr.value : 'item',
      indexName: indexAttr ? indexAttr.value : 'index',
      keyExpression: keyAttr ? keyAttr.value : null,
      children: []
    }, parent, this.nodeDepth);

    this.tagStack.push({ name: 'For', node: forNode, position: this.position });

    // Parse loop body
    while (!this.isAtEnd() && !this.isClosingTag('For')) {
      const child = this.parseNode(forNode);
      if (child) {
        forNode.children.push(child);
      }
    }

    // Consume closing For tag
    if (this.current && this.current.type === TokenType.TAG_CLOSE && 
        this.current.value.tagName === 'For') {
      this.advance();
    }

    this.tagStack.pop();
    return forNode;
  }

  parseSwitchDirective(parent) {
    const token = this.current;
    this.advance();

    const attributes = this.parseAttributes(token.value.attributes);
    const valueAttr = attributes.find(attr => attr.name === 'value');

    if (!valueAttr) {
      this.error('Switch directive requires a "value" attribute');
    }

    const switchNode = this.createNode(NodeType.SWITCH, {
      value: valueAttr.value,
      cases: []
    }, parent, this.nodeDepth);

    this.tagStack.push({ name: 'Switch', node: switchNode, position: this.position });

    // Parse cases
    while (!this.isAtEnd() && !this.isClosingTag('Switch')) {
      const child = this.parseNode(switchNode);
      if (child && (child.type === NodeType.CASE || child.type === NodeType.DEFAULT)) {
        switchNode.cases.push(child);
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
    return switchNode;
  }

  parseCaseDirective(parent) {
    const token = this.current;
    this.advance();

    const attributes = this.parseAttributes(token.value.attributes);
    const valueAttr = attributes.find(attr => attr.name === 'value');

    if (!valueAttr) {
      this.error('Case directive requires a "value" attribute');
    }

    const caseNode = this.createNode(NodeType.CASE, {
      value: valueAttr.value,
      children: []
    }, parent, this.nodeDepth);

    // Parse until closing Case tag
    while (!this.isAtEnd() && !this.isClosingTag('Case')) {
      const child = this.parseNode(caseNode);
      if (child) {
        caseNode.children.push(child);
      }
    }

    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      this.advance();
    }

    return caseNode;
  }

  parseDefaultDirective(parent) {
    const token = this.current;
    this.advance();

    const defaultNode = this.createNode(NodeType.DEFAULT, {
      children: []
    }, parent, this.nodeDepth);

    // Parse until closing Default tag
    while (!this.isAtEnd() && !this.isClosingTag('Default')) {
      const child = this.parseNode(defaultNode);
      if (child) {
        defaultNode.children.push(child);
      }
    }

    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      this.advance();
    }

    return defaultNode;
  }

  parseSlotDirective(parent) {
    const token = this.current;
    this.advance();

    const attributes = this.parseAttributes(token.value.attributes);
    const nameAttr = attributes.find(attr => attr.name === 'name');

    const slotNode = this.createNode(NodeType.SLOT, {
      name: nameAttr ? nameAttr.value : 'default',
      children: []
    }, parent, this.nodeDepth);

    // Parse fallback content
    while (!this.isAtEnd() && !this.isClosingTag('Slot')) {
      const child = this.parseNode(slotNode);
      if (child) {
        slotNode.children.push(child);
      }
    }

    if (this.current && this.current.type === TokenType.TAG_CLOSE) {
      this.advance();
    }

    return slotNode;
  }

  /**
   * Parse self-closing element with proper metadata
   */
  parseSelfClosingElement(parent) {
    const token = this.current;
    const tagName = token.value.tagName;
    const isComponent = this.isComponentName(tagName);

    this.advance(); // Consume self-closing tag

    const nodeType = isComponent ? NodeType.COMPONENT : NodeType.ELEMENT;
    const propKey = isComponent ? 'props' : 'attributes';

    return this.createNode(nodeType, {
      [isComponent ? 'name' : 'tagName']: tagName,
      [propKey]: this.parseAttributes(token.value.attributes),
      children: [],
      selfClosing: true
    }, parent, this.nodeDepth);
  }

  /**
   * Parse text node with enhanced tracking
   */
  parseText(parent) {
    const token = this.current;
    this.advance();

    return this.createNode(NodeType.TEXT, {
      content: token.value,
      raw: token.value
    }, parent, this.nodeDepth);
  }

  /**
   * Parse interpolation with complexity tracking
   */
  parseInterpolation(parent) {
    const token = this.current;
    this.advance();

    return this.createNode(NodeType.INTERPOLATION, {
      expression: token.value.trim(),
      complex: token.type === TokenType.EXPRESSION_COMPLEX,
      raw: token.value
    }, parent, this.nodeDepth);
  }

  // === Enhanced Utility Methods ===

  /**
   * Enhanced node creation with metadata
   */
  createNode(type, properties, parent = null, depth = 0) {
    const node = { 
      type, 
      ...properties,
      nodeId: ++this.stats.nodesCreated,
      parent,
      depth
    };

    // Add enhanced location tracking
    if (this.current) {
      node.location = {
        start: {
          line: this.current.line,
          column: this.current.column,
          position: this.current.position
        },
        end: {
          line: this.current.line,
          column: this.current.column + (this.current.length || 0),
          position: this.current.position + (this.current.length || 0)
        }
      };
    }

    return node;
  }

  /**
   * Add source mapping for debugging
   */
  addSourceMapping(node) {
    if (this.generateSourceMap && node.location && this.sourceMap) {
      this.sourceMap.addMapping(
        { line: node.nodeId, column: 0 }, // Generated position (simplified)
        node.location.start // Original position
      );
    }
  }

  /**
   * Enhanced lookahead with caching
   */
  lookAheadForClosingTag(tagName, maxLookAhead = 10) {
    const cacheKey = `${this.position}-${tagName}`;
    if (this.lookaheadCache.has(cacheKey)) {
      return this.lookaheadCache.get(cacheKey);
    }

    this.stats.lookaheadOperations++;
    
    for (let i = this.position + 1; i < Math.min(this.tokens.length, this.position + maxLookAhead); i++) {
      const token = this.tokens[i];
      if (token.type === TokenType.TAG_CLOSE && token.value.tagName === tagName) {
        const result = { position: i, token };
        this.lookaheadCache.set(cacheKey, result);
        return result;
      }
    }

    this.lookaheadCache.set(cacheKey, null);
    return null;
  }

  /**
   * Check if current token is a specific directive
   */
  isDirective(directiveName) {
    return this.current && 
           this.current.type === TokenType.DIRECTIVE && 
           this.current.value.tagName === directiveName;
  }

  /**
   * Enhanced attribute parsing with validation
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
              dynamic: false,
              static: true
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
                event: val.type === 'event',
                expression: val.content
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
   * Enhanced dynamic props parsing with better error handling
   */
  parseDynamicProps(content) {
    const props = [];
    const clean = content.trim();

    if (!clean) return props;

    // Enhanced regex for key-value pairs with better boundary detection
    const regex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([^,}]+?)(?=\s*[,}]|$)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(clean)) !== null) {
      const [fullMatch, key, rawValue] = match;
      const keyName = key.trim();
      
      // Prevent infinite loop
      if (regex.lastIndex === lastIndex) {
        break;
      }
      lastIndex = regex.lastIndex;
      
      try {
        const value = this.parsePropValue(rawValue.trim());
        
        if (keyName && value !== undefined) {
          props.push(
            this.createNode(NodeType.ATTRIBUTE, {
              name: keyName,
              value,
              dynamic: true,
              expression: rawValue.trim()
            })
          );
        }
      } catch (error) {
        this.warn(`Failed to parse prop value: ${rawValue} → ${error.message}`);
      }
    }

    if (props.length === 0) {
      throw new Error('No valid props found in object syntax');
    }

    return props;
  }

  /**
   * Enhanced prop value parsing with type inference
   */
  parsePropValue(value) {
    const trimmed = value.trim();
    
    // Boolean values
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    
    // Null/undefined
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;

    // Numbers (enhanced to handle edge cases)
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!isNaN(num) && isFinite(num)) {
        return num;
      }
    }

    // Strings (quoted)
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    // Arrays and objects (with safer parsing)
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return JSON.parse(trimmed);
      } catch (parseError) {
        // Fallback for malformed JSON
        this.warn(`Invalid JSON in prop value: ${trimmed}`);
        return trimmed;
      }
    }

    // Template literals (basic detection)
    if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
      return trimmed.slice(1, -1); // Return as string for now
    }

    // Default: treat as identifier/expression
    return trimmed;
  }

  // === State Management & Checkpoints ===

  /**
   * Create a parser state checkpoint for backtracking
   */
  createCheckpoint() {
    const checkpoint = {
      position: this.position,
      current: this.current,
      tagStack: [...this.tagStack],
      componentStack: [...this.componentStack],
      nodeDepth: this.nodeDepth,
      errors: [...this.errors],
      warnings: [...this.warnings]
    };
    
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  /**
   * Restore parser state from checkpoint
   */
  restoreCheckpoint(checkpoint) {
    this.position = checkpoint.position;
    this.current = checkpoint.current;
    this.tagStack = [...checkpoint.tagStack];
    this.componentStack = [...checkpoint.componentStack];
    this.nodeDepth = checkpoint.nodeDepth;
    this.errors = [...checkpoint.errors];
    this.warnings = [...checkpoint.warnings];
    this.stats.backtrackOperations++;
  }

  /**
   * Remove checkpoint (successful parse)
   */
  releaseCheckpoint() {
    this.checkpoints.pop();
  }

  // === Enhanced Error Recovery ===

  /**
   * Attempt recovery with multiple strategies
   */
  attemptRecovery() {
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      this.error('Maximum recovery attempts exceeded');
      return false;
    }

    this.recoveryAttempts++;
    this.stats.recoveryOperations++;
    this.state = ParserState.RECOVERING;

    const strategies = [
      RecoveryStrategy.SKIP_TO_NEXT_TAG,
      RecoveryStrategy.SKIP_TO_CLOSING_TAG,
      RecoveryStrategy.SKIP_TO_SIBLING,
      RecoveryStrategy.CONSUME_AND_CONTINUE
    ];

    for (const strategy of strategies) {
      if (this.executeRecoveryStrategy(strategy)) {
        this.state = ParserState.PARSING;
        return true;
      }
    }

    this.state = ParserState.PARSING;
    return false;
  }

  /**
   * Execute specific recovery strategy
   */
  executeRecoveryStrategy(strategy) {
    const startPosition = this.position;

    switch (strategy) {
      case RecoveryStrategy.SKIP_TO_NEXT_TAG:
        return this.skipToNextTag();
      
      case RecoveryStrategy.SKIP_TO_CLOSING_TAG:
        return this.skipToClosingTag();
      
      case RecoveryStrategy.SKIP_TO_SIBLING:
        return this.skipToSibling();
      
      case RecoveryStrategy.CONSUME_AND_CONTINUE:
        this.advance();
        return true;
      
      default:
        return false;
    }
  }

  /**
   * Skip to next opening tag
   */
  skipToNextTag() {
    while (!this.isAtEnd()) {
      if (this.current.type === TokenType.TAG_OPEN || 
          this.current.type === TokenType.COMPONENT ||
          this.current.type === TokenType.DIRECTIVE) {
        return true;
      }
      this.advance();
    }
    return false;
  }

  /**
   * Skip to expected closing tag
   */
  skipToClosingTag() {
    if (this.tagStack.length === 0) return false;
    
    const expectedTag = this.tagStack[this.tagStack.length - 1].name;
    
    while (!this.isAtEnd()) {
      if (this.current.type === TokenType.TAG_CLOSE && 
          this.current.value.tagName === expectedTag) {
        return true;
      }
      this.advance();
    }
    return false;
  }

  /**
   * Skip to sibling element
   */
  skipToSibling() {
    let depth = 0;
    
    while (!this.isAtEnd()) {
      const token = this.current;
      
      if (token.type === TokenType.TAG_OPEN || token.type === TokenType.COMPONENT) {
        depth++;
      } else if (token.type === TokenType.TAG_CLOSE) {
        depth--;
        if (depth < 0) {
          return true; // Found parent's closing tag
        }
      }
      
      this.advance();
    }
    return false;
  }

  /**
   * Enhanced recovery within element parsing
   */
  recoverInElement(tagName) {
    // Try to find closing tag or next sibling
    let depth = 1;
    
    while (!this.isAtEnd()) {
      const token = this.current;
      
      if (token.type === TokenType.TAG_CLOSE && token.value.tagName === tagName) {
        return true; // Found our closing tag
      } else if (token.type === TokenType.TAG_OPEN || token.type === TokenType.COMPONENT) {
        depth++;
      } else if (token.type === TokenType.TAG_CLOSE) {
        depth--;
        if (depth <= 0) {
          return true; // Found parent closing or same level
        }
      }
      
      this.advance();
    }
    
    return false;
  }

  // === Validation & Helper Methods ===

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
   * Advance to next token with bounds checking
   */
  advance() {
    if (this.position < this.tokens.length - 1) {
      this.position++;
      this.current = this.tokens[this.position];
    } else {
      this.current = null;
    }
    return this.current;
  }

  /**
   * Enhanced HTML tag validation
   */
  validateHtmlTag(tagName) {
    const lowerTag = tagName.toLowerCase();
    
    if (!VALID_HTML_TAGS.has(lowerTag)) {
      this.warn(`Unknown HTML tag: <${tagName}>. Consider using a component instead.`);
    }
    
    if (OBSOLETE_TAGS.has(lowerTag)) {
      this.warn(`Obsolete HTML tag: <${tagName}>. Consider modern alternatives.`);
    }

    // Additional semantic validations
    if (lowerTag === 'div' && this.nodeDepth > 10) {
      this.warn(`Deep nesting detected (depth: ${this.nodeDepth}). Consider component extraction.`);
    }
  }

  // === Enhanced Error Handling ===

  /**
   * Standardized error reporting
   */
  error(message, code = 'PARSE_ERROR') {
    const location = this.current ? {
      line: this.current.line,
      column: this.current.column,
      position: this.current.position
    } : { line: 0, column: 0, position: this.position };
    
    const context = this.getParseContext();
    
    const error = new Error(`[FML ${code}] ${message}`);
    error.code = code;
    error.location = location;
    error.context = context;
    error.tagStack = [...this.tagStack];
    error.componentStack = [...this.componentStack];
    
    if (this.debug) {
      console.error(`[Parser Error] ${message} at ${location.line}:${location.column}`);
      console.error(`Context: ${context}`);
    }
    
    throw error;
  }

  /**
   * Standardized warning reporting
   */
  warn(message, code = 'PARSE_WARNING') {
    const location = this.current ? {
      line: this.current.line,
      column: this.current.column,
      position: this.current.position
    } : null;

    const warning = {
      code,
      message,
      location,
      tagStack: [...this.tagStack],
      componentStack: [...this.componentStack],
      context: this.getParseContext()
    };
    
    this.warnings.push(warning);
    
    if (this.debug) {
      const loc = location ? `(${location.line}:${location.column})` : '';
      console.warn(`[FML Warning] ${message} ${loc}`);
    }
  }

  /**
   * Handle recoverable errors
   */
  handleError(error, context = '') {
    const errorInfo = {
      error,
      context,
      location: this.current ? {
        line: this.current.line,
        column: this.current.column,
        position: this.current.position
      } : null,
      tagStack: [...this.tagStack],
      componentStack: [...this.componentStack],
      recoveryAttempt: this.recoveryAttempts
    };
    
    this.errors.push(errorInfo);

    if (this.debug) {
      console.error(`[FML Error] ${error.message}${context ? ` (${context})` : ''}`);
      console.error(`Recovery attempt: ${this.recoveryAttempts}/${this.maxRecoveryAttempts}`);
    }
  }

  /**
   * Enhanced parse context information
   */
  getParseContext() {
    const parts = [];
    
    if (this.tagStack.length > 0) {
      const stack = this.tagStack.map(t => t.name).join(' > ');
      parts.push(`Tag stack: ${stack}`);
    } else {
      parts.push('No open tags');
    }
    
    if (this.componentStack.length > 0) {
      const stack = this.componentStack.map(c => c.name).join(' > ');
      parts.push(`Component stack: ${stack}`);
    }
    
    if (this.current) {
      parts.push(`Current token: ${this.current.type}`);
      parts.push(`Position: ${this.position}/${this.tokens.length}`);
    } else {
      parts.push('No current token (EOF)');
    }
    
    return parts.join('\n');
  }

  /**
   * Enhanced error enrichment
   */
  enhanceError(error) {
    if (error.code) {
      return error; // Already enhanced
    }

    const enhanced = new Error(error.message);
    enhanced.name = 'FMLParseError';
    enhanced.code = 'PARSE_ERROR';
    enhanced.location = this.current ? { 
      line: this.current.line, 
      column: this.current.column,
      position: this.current.position
    } : null;
    enhanced.context = this.getParseContext();
    enhanced.tagStack = [...this.tagStack];
    enhanced.componentStack = [...this.componentStack];
    enhanced.errors = this.errors;
    enhanced.warnings = this.warnings;
    enhanced.stats = this.getStats();
    enhanced.originalError = error;

    return enhanced;
  }

  // === Performance & Debugging ===

  /**
   * Get comprehensive parser statistics
   */
  getStats() {
    return {
      ...this.stats,
      tokensProcessed: this.position,
      totalTokens: this.tokens.length,
      completionRate: this.tokens.length > 0 ? (this.position / this.tokens.length) * 100 : 0,
      errors: this.errors.length,
      warnings: this.warnings.length,
      tagStackDepth: this.tagStack.length,
      componentStackDepth: this.componentStack.length,
      maxDepth: this.nodeDepth,
      phase2: this.phase2,
      strict: this.strict,
      sourceMapEnabled: this.generateSourceMap,
      cacheHits: this.lookaheadCache.size,
      checkpoints: this.checkpoints.length
    };
  }

  /**
   * Generate debug report
   */
  generateDebugReport() {
    const stats = this.getStats();
    
    return {
      performance: {
        parseTime: stats.parseTime,
        tokensPerMs: stats.parseTime > 0 ? stats.tokensProcessed / stats.parseTime : 0,
        nodesPerMs: stats.parseTime > 0 ? stats.nodesCreated / stats.parseTime : 0
      },
      quality: {
        errorRate: stats.totalTokens > 0 ? (stats.errors / stats.totalTokens) * 100 : 0,
        warningRate: stats.totalTokens > 0 ? (stats.warnings / stats.totalTokens) * 100 : 0,
        recoverySuccessRate: stats.recoveryOperations > 0 ? 
          ((stats.recoveryOperations - stats.errors) / stats.recoveryOperations) * 100 : 100
      },
      complexity: {
        maxDepth: stats.maxDepth,
        componentComplexity: stats.componentStackDepth,
        lookaheadUsage: stats.lookaheadOperations,
        backtrackUsage: stats.backtrackOperations
      },
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

/**
 * Helper: Quick parse FML string into AST with options
 */
export function parseFML(content, options = {}) {
  const parser = new FMLParser(options);
  return parser.parse(content, options.filename);
}