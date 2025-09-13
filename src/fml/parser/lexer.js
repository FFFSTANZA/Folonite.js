// src/fml/parser/lexer.js

export const TokenType = {
  // Basic HTML tokens
  TAG_OPEN: 'TAG_OPEN',
  TAG_CLOSE: 'TAG_CLOSE', 
  TAG_SELF_CLOSE: 'TAG_SELF_CLOSE',

  // Content tokens
  TEXT: 'TEXT',
  INTERPOLATION: 'INTERPOLATION',
  EXPRESSION_COMPLEX: 'EXPRESSION_COMPLEX',

  // Attribute tokens
  ATTRIBUTE_STATIC: 'ATTRIBUTE_STATIC',
  ATTRIBUTE_DYNAMIC: 'ATTRIBUTE_DYNAMIC', 
  EVENT_HANDLER: 'EVENT_HANDLER',

  // Special tokens
  COMPONENT: 'COMPONENT',
  DIRECTIVE: 'DIRECTIVE',
  EOF: 'EOF',
};

// Lexer states for state machine
const LexerState = {
  TEXT: 'TEXT',
  TAG: 'TAG',
  TAG_NAME: 'TAG_NAME',
  ATTRIBUTES: 'ATTRIBUTES',
  ATTRIBUTE_NAME: 'ATTRIBUTE_NAME',
  ATTRIBUTE_VALUE: 'ATTRIBUTE_VALUE',
  EXPRESSION: 'EXPRESSION',
  STRING: 'STRING',
  COMMENT: 'COMMENT',
  ERROR_RECOVERY: 'ERROR_RECOVERY'
};

// Recovery strategies
const RecoveryMode = {
  SKIP_TO_TAG: 'SKIP_TO_TAG',
  SKIP_TO_EXPRESSION_END: 'SKIP_TO_EXPRESSION_END',
  SKIP_TO_WHITESPACE: 'SKIP_TO_WHITESPACE',
  SKIP_CHAR: 'SKIP_CHAR'
};

// Phase 2: Built-in directives and event attributes
const BUILTIN_DIRECTIVES = new Set([
  'If', 'Else', 'ElseIf', 'For', 'Switch', 'Case', 'Default', 'Slot'
]);

const EVENT_PREFIX = /^on[A-Z]/;
const EVENT_ATTRIBUTES = new Set([
  'onClick', 'onSubmit', 'onChange', 'onInput', 'onFocus', 'onBlur',
  'onMouseOver', 'onMouseOut', 'onKeyDown', 'onKeyUp', 'onLoad',
  'onMouseDown', 'onMouseUp', 'onMouseEnter', 'onMouseLeave',
  'onDoubleClick', 'onContextMenu', 'onScroll', 'onResize'
]);

// Character class checks (optimized)
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\f']);
const ALPHA_CHARS = /^[a-zA-Z]$/;
const ALPHANUM_CHARS = /^[a-zA-Z0-9]$/;
const TAG_NAME_CHARS = /^[a-zA-Z0-9\-_]$/;
const ATTR_NAME_CHARS = /^[a-zA-Z0-9\-_:]$/;

// Expression complexity detection using AST patterns
class ExpressionAnalyzer {
  static analyzeComplexity(content) {
    const trimmed = content.trim();
    if (!trimmed) return false;

    // Check for simple property access first (fast path)
    if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/.test(trimmed)) {
      return false;
    }

    // Check for literals
    if (/^(true|false|null|undefined|\d+(\.\d+)?|"[^"]*"|'[^']*')$/.test(trimmed)) {
      return false;
    }

    // More sophisticated pattern matching
    const complexPatterns = [
      /\w\s*\(/,                    // Function calls
      /[+\-*/%<>=!&|]{1,2}/,       // Operators
      /\?\s*[^:]*\s*:/,            // Ternary
      /^\s*[\[{]/,                 // Object/array literals
      /&&|\|\|/,                   // Logical operators
      /[!=<>]==/,                  // Comparison operators
      /\.[a-zA-Z_$][\w$]*\s*\(/,  // Method calls
      /\[[^\]]+\]/                 // Array access
    ];

    return complexPatterns.some(pattern => pattern.test(trimmed));
  }
}

export class FMLLexer {
  constructor(input, options = {}) {
    this.input = input;
    this.length = input.length;
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.startPosition = 0; // Token start position
    this.debug = !!options.debug;
    this.phase2 = options.phase2 !== false;
    
    // State machine
    this.state = LexerState.TEXT;
    this.stateStack = [];
    
    // Performance tracking
    this.stats = {
      tokensProcessed: 0,
      totalTime: 0,
      errorRecoveries: 0,
      startTime: 0
    };
    
    // Error handling
    this.tokens = [];
    this.errors = [];
    this.warnings = [];
    this.maxErrors = options.maxErrors || 10;
    
    // Recovery tracking
    this.lastRecoveryPosition = -1;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 5;
  }

  tokenize() {
    this.stats.startTime = performance.now();
    this.reset();

    try {
      while (this.position < this.length && this.errors.length < this.maxErrors) {
        const tokenized = this.processCurrentState();
        
        if (!tokenized) {
          if (!this.attemptRecovery()) {
            break; // Failed to recover
          }
        }
      }

      this.addToken(TokenType.EOF, '');
      this.stats.totalTime = performance.now() - this.stats.startTime;
      
      if (this.debug) {
        this.debugTokens();
        this.printStats();
      }
      
    } catch (err) {
      this.handleCriticalError(err);
      throw err;
    }

    return this.tokens;
  }

  reset() {
    this.tokens = [];
    this.errors = [];
    this.warnings = [];
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.state = LexerState.TEXT;
    this.stateStack = [];
    this.stats.tokensProcessed = 0;
    this.lastRecoveryPosition = -1;
    this.recoveryAttempts = 0;
  }

  // === State Machine Core ===
  
  processCurrentState() {
    this.markTokenStart();
    
    switch (this.state) {
      case LexerState.TEXT:
        return this.processTextState();
      case LexerState.TAG:
        return this.processTagState();
      case LexerState.TAG_NAME:
        return this.processTagNameState();
      case LexerState.ATTRIBUTES:
        return this.processAttributesState();
      case LexerState.ATTRIBUTE_NAME:
        return this.processAttributeNameState();
      case LexerState.ATTRIBUTE_VALUE:
        return this.processAttributeValueState();
      case LexerState.EXPRESSION:
        return this.processExpressionState();
      case LexerState.STRING:
        return this.processStringState();
      case LexerState.COMMENT:
        return this.processCommentState();
      case LexerState.ERROR_RECOVERY:
        return this.processErrorRecoveryState();
      default:
        this.error(`Unknown lexer state: ${this.state}`);
        return false;
    }
  }

  processTextState() {
    this.skipWhitespace();
    
    const char = this.current();
    if (!char) return true; // EOF
    
    if (char === '<') {
      if (this.isCommentStart()) {
        this.setState(LexerState.COMMENT);
        return true;
      } else {
        this.setState(LexerState.TAG);
        return true;
      }
    }
    
    if (char === '{') {
      this.setState(LexerState.EXPRESSION);
      return true;
    }
    
    // Read text content
    return this.readTextContent();
  }

  processTagState() {
    this.advance(); // Skip '<'
    
    const char = this.current();
    if (char === '/') {
      this.advance(); // Skip '/'
      this.tagIsClosing = true;
    } else {
      this.tagIsClosing = false;
    }
    
    this.setState(LexerState.TAG_NAME);
    return true;
  }

  processTagNameState() {
    const tagName = this.readTagName();
    if (!tagName) {
      this.error("Expected tag name after '<'");
      return false;
    }
    
    this.currentTagName = tagName;
    this.skipWhitespace();
    
    const char = this.current();
    if (char === '>') {
      this.finishTag(false);
      return true;
    } else if (char === '/' && this.peek() === '>') {
      this.finishTag(true);
      return true;
    } else if (!this.tagIsClosing) {
      this.setState(LexerState.ATTRIBUTES);
      this.currentAttributes = [];
      return true;
    } else {
      this.error("Expected '>' after closing tag name");
      return false;
    }
  }

  processAttributesState() {
    this.skipWhitespace();
    
    const char = this.current();
    if (!char) {
      this.error("Unexpected EOF in attributes");
      return false;
    }
    
    if (char === '>') {
      this.finishTag(false);
      return true;
    }
    
    if (char === '/' && this.peek() === '>') {
      this.finishTag(true);
      return true;
    }
    
    if (char === '{') {
      // Dynamic object spread
      return this.readDynamicObject();
    }
    
    if (ALPHA_CHARS.test(char)) {
      this.setState(LexerState.ATTRIBUTE_NAME);
      return true;
    }
    
    this.error(`Unexpected character in attributes: '${char}'`);
    return false;
  }

  processAttributeNameState() {
    const name = this.readAttributeName();
    if (!name) {
      this.error("Expected attribute name");
      return false;
    }
    
    this.currentAttributeName = name;
    this.skipWhitespace();
    
    if (this.current() === '=') {
      this.advance(); // Skip '='
      this.skipWhitespace();
      this.setState(LexerState.ATTRIBUTE_VALUE);
      return true;
    } else {
      // Boolean attribute
      this.addAttributeToken(TokenType.ATTRIBUTE_STATIC, {
        type: 'static',
        name,
        value: true
      });
      this.setState(LexerState.ATTRIBUTES);
      return true;
    }
  }

  processAttributeValueState() {
    const char = this.current();
    
    if (char === '{') {
      return this.readDynamicAttributeValue();
    } else if (char === '"' || char === "'") {
      return this.readQuotedAttributeValue(char);
    } else {
      return this.readUnquotedAttributeValue();
    }
  }

  processExpressionState() {
    const result = this.readEnclosedExpression('{', '}');
    if (!result) return false;
    
    const { content } = result;
    if (!content.trim()) {
      this.error("Empty interpolation expression");
      return false;
    }

    const isComplex = ExpressionAnalyzer.analyzeComplexity(content);
    const tokenType = this.phase2 && isComplex 
      ? TokenType.EXPRESSION_COMPLEX 
      : TokenType.INTERPOLATION;

    this.addToken(tokenType, content);
    this.setState(LexerState.TEXT);
    return true;
  }

  processStringState() {
    // Handled within other states
    return true;
  }

  processCommentState() {
    this.skipComment();
    this.setState(LexerState.TEXT);
    return true;
  }

  processErrorRecoveryState() {
    // Implemented in recovery section
    return this.recoverFromError();
  }

  // === State Management ===
  
  setState(newState) {
    if (this.debug && newState !== this.state) {
      console.log(`State: ${this.state} → ${newState} at ${this.line}:${this.column}`);
    }
    this.state = newState;
  }

  pushState(newState) {
    this.stateStack.push(this.state);
    this.setState(newState);
  }

  popState() {
    if (this.stateStack.length > 0) {
      this.setState(this.stateStack.pop());
    }
  }

  // === Enhanced Character Utilities ===
  
  current() {
    return this.position < this.length ? this.input[this.position] : '';
  }

  peek(offset = 1) {
    const pos = this.position + offset;
    return pos < this.length ? this.input[pos] : '';
  }

  advance() {
    if (this.position < this.length) {
      if (this.current() === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }
    return this.current();
  }

  advanceN(n) {
    for (let i = 0; i < n && this.position < this.length; i++) {
      this.advance();
    }
  }

  markTokenStart() {
    this.startPosition = this.position;
  }

  // Optimized character checks
  isWhitespace(char) {
    return WHITESPACE_CHARS.has(char);
  }

  isAlpha(char) {
    return ALPHA_CHARS.test(char);
  }

  isAlphaNumeric(char) {
    return ALPHANUM_CHARS.test(char);
  }

  isTagNameChar(char) {
    return TAG_NAME_CHARS.test(char);
  }

  isAttributeNameChar(char) {
    return ATTR_NAME_CHARS.test(char);
  }

  // === Enhanced Parsing Methods ===
  
  skipWhitespace() {
    while (this.position < this.length && this.isWhitespace(this.current())) {
      this.advance();
    }
  }

  readTextContent() {
    let text = '';
    
    while (this.position < this.length) {
      const char = this.current();
      if (char === '<' || char === '{') {
        break;
      }
      text += char;
      this.advance();
    }
    
    if (text.length > 0) {
      this.addToken(TokenType.TEXT, text);
    }
    
    return true;
  }

  readTagName() {
    let name = '';
    while (this.position < this.length && this.isTagNameChar(this.current())) {
      name += this.current();
      this.advance();
    }
    return name;
  }

  readAttributeName() {
    let name = '';
    while (this.position < this.length && this.isAttributeNameChar(this.current())) {
      name += this.current();
      this.advance();
    }
    return name;
  }

  finishTag(isSelfClosing) {
    this.advance(); // Skip '>'
    if (isSelfClosing) {
      this.advance(); // Skip '/' in '/>'
    }

    const tagName = this.currentTagName;
    let tokenType;
    
    if (this.tagIsClosing) {
      tokenType = TokenType.TAG_CLOSE;
    } else if (isSelfClosing) {
      tokenType = TokenType.TAG_SELF_CLOSE;
    } else if (this.phase2 && BUILTIN_DIRECTIVES.has(tagName)) {
      tokenType = TokenType.DIRECTIVE;
    } else if (this.isComponent(tagName)) {
      tokenType = TokenType.COMPONENT;
    } else {
      tokenType = TokenType.TAG_OPEN;
    }

    this.addToken(tokenType, {
      tagName,
      attributes: this.currentAttributes || [],
      isClosing: this.tagIsClosing,
      isSelfClosing
    });

    this.setState(LexerState.TEXT);
    this.currentTagName = null;
    this.currentAttributes = null;
  }

  isComponent(tagName) {
    return /^[A-Z][a-zA-Z0-9]*$/.test(tagName);
  }

  // === Enhanced Expression Parsing ===
  
  readEnclosedExpression(open, close) {
    if (this.current() !== open) {
      return null;
    }

    this.advance(); // Skip opening character

    let depth = 1;
    let content = '';
    let inString = false;
    let stringChar = '';
    let escaped = false;

    while (this.position < this.length && depth > 0) {
      const char = this.current();

      if (escaped) {
        escaped = false;
      } else if (char === '\\' && inString) {
        escaped = true;
      } else if (!inString) {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === open) {
          depth++;
        } else if (char === close) {
          depth--;
        }
      } else {
        if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
      }

      if (depth > 0) {
        content += char;
      }

      this.advance();
    }

    if (depth > 0) {
      this.error(`Unclosed expression: expected '${close}'`);
      return null;
    }

    return { content: content.trim() };
  }

  // === Enhanced Attribute Parsing ===
  
  readDynamicObject() {
    const result = this.readEnclosedExpression('{', '}');
    if (!result) return false;
    
    this.addAttributeToken(TokenType.ATTRIBUTE_DYNAMIC, {
      type: 'dynamic-object',
      content: result.content
    });
    
    this.setState(LexerState.ATTRIBUTES);
    return true;
  }

  readDynamicAttributeValue() {
    const result = this.readEnclosedExpression('{', '}');
    if (!result) return false;
    
    const name = this.currentAttributeName;
    const isEvent = this.phase2 && this.isEventAttribute(name);
    const tokenType = isEvent ? TokenType.EVENT_HANDLER : TokenType.ATTRIBUTE_DYNAMIC;
    
    this.addAttributeToken(tokenType, {
      type: isEvent ? 'event' : 'dynamic',
      name,
      content: result.content,
      value: result.content
    });
    
    this.setState(LexerState.ATTRIBUTES);
    return true;
  }

  readQuotedAttributeValue(quote) {
    this.advance(); // Skip opening quote
    
    let value = '';
    let escaped = false;
    
    while (this.position < this.length) {
      const char = this.current();
      
      if (escaped) {
        value += this.getEscapedChar(char);
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        this.advance(); // Skip closing quote
        break;
      } else if (char === '\n') {
        this.error("Unterminated string literal");
        return false;
      } else {
        value += char;
      }
      
      this.advance();
    }
    
    this.addAttributeToken(TokenType.ATTRIBUTE_STATIC, {
      type: 'static',
      name: this.currentAttributeName,
      value
    });
    
    this.setState(LexerState.ATTRIBUTES);
    return true;
  }

  readUnquotedAttributeValue() {
    let value = '';
    
    while (this.position < this.length) {
      const char = this.current();
      if (this.isWhitespace(char) || char === '>' || char === '/' || char === '<') {
        break;
      }
      value += char;
      this.advance();
    }
    
    this.addAttributeToken(TokenType.ATTRIBUTE_STATIC, {
      type: 'static',
      name: this.currentAttributeName,
      value
    });
    
    this.setState(LexerState.ATTRIBUTES);
    return true;
  }

  isEventAttribute(name) {
    return EVENT_ATTRIBUTES.has(name) || EVENT_PREFIX.test(name);
  }

  // === Enhanced Escape Handling ===
  
  getEscapedChar(char) {
    const escapeMap = {
      'n': '\n',
      't': '\t', 
      'r': '\r',
      'b': '\b',
      'f': '\f',
      'v': '\v',
      '0': '\0',
      '\\': '\\',
      '"': '"',
      "'": "'",
      '/': '/'
    };
    
    return escapeMap[char] || char;
  }

  // === Comment Handling ===
  
  isCommentStart() {
    return (
      this.current() === '<' &&
      this.peek() === '!' &&
      this.peek(2) === '-' &&
      this.peek(3) === '-'
    );
  }

  skipComment() {
    this.advanceN(4); // Skip '<!--'

    while (this.position < this.length - 2) {
      if (this.current() === '-' && this.peek() === '-' && this.peek(2) === '>') {
        this.advanceN(3); // Skip '-->'
        return;
      }
      this.advance();
    }
    
    this.error("Unclosed HTML comment");
  }

  // === Token Management ===
  
  addToken(type, value) {
    const token = {
      type,
      value,
      line: this.line,
      column: this.column,
      position: this.startPosition,
      length: this.position - this.startPosition
    };
    
    this.tokens.push(token);
    this.stats.tokensProcessed++;
    
    if (this.debug && this.stats.tokensProcessed % 100 === 0) {
      console.log(`Processed ${this.stats.tokensProcessed} tokens`);
    }
  }

  addAttributeToken(type, value) {
    if (!this.currentAttributes) {
      this.currentAttributes = [];
    }
    
    this.currentAttributes.push({
      type,
      value,
      line: this.line,
      column: this.column,
      position: this.startPosition
    });
  }

  // === Error Recovery System ===
  
  attemptRecovery() {
    if (this.position === this.lastRecoveryPosition) {
      this.recoveryAttempts++;
      if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
        this.error("Maximum recovery attempts exceeded");
        return false;
      }
    } else {
      this.recoveryAttempts = 0;
      this.lastRecoveryPosition = this.position;
    }

    this.stats.errorRecoveries++;
    this.setState(LexerState.ERROR_RECOVERY);
    return this.recoverFromError();
  }

  recoverFromError() {
    const mode = this.selectRecoveryMode();
    
    switch (mode) {
      case RecoveryMode.SKIP_TO_TAG:
        return this.skipToNextTag();
      case RecoveryMode.SKIP_TO_EXPRESSION_END:
        return this.skipToExpressionEnd();
      case RecoveryMode.SKIP_TO_WHITESPACE:
        return this.skipToWhitespace();
      case RecoveryMode.SKIP_CHAR:
        this.advance();
        this.setState(LexerState.TEXT);
        return true;
      default:
        return false;
    }
  }

  selectRecoveryMode() {
    // Choose recovery strategy based on current context
    if (this.state === LexerState.EXPRESSION) {
      return RecoveryMode.SKIP_TO_EXPRESSION_END;
    } else if (this.state === LexerState.TAG || this.state === LexerState.ATTRIBUTES) {
      return RecoveryMode.SKIP_TO_TAG;
    } else {
      return RecoveryMode.SKIP_TO_WHITESPACE;
    }
  }

  skipToNextTag() {
    while (this.position < this.length) {
      if (this.current() === '<') {
        this.setState(LexerState.TEXT);
        return true;
      }
      this.advance();
    }
    return false;
  }

  skipToExpressionEnd() {
    let depth = 1;
    while (this.position < this.length && depth > 0) {
      const char = this.current();
      if (char === '{') depth++;
      else if (char === '}') depth--;
      this.advance();
    }
    this.setState(LexerState.TEXT);
    return true;
  }

  skipToWhitespace() {
    while (this.position < this.length && !this.isWhitespace(this.current())) {
      this.advance();
    }
    this.setState(LexerState.TEXT);
    return true;
  }

  // === Error Handling ===
  
  error(message) {
    const error = {
      message,
      line: this.line,
      column: this.column,
      position: this.position,
      context: this.getErrorContext(),
      state: this.state
    };
    
    this.errors.push(error);
    
    if (this.debug) {
      console.error(`[Lexer Error] ${message} at ${this.line}:${this.column}`);
      console.error(`Context: ${error.context}`);
    }
    
    if (this.errors.length >= this.maxErrors) {
      throw new Error(`Too many lexer errors (${this.maxErrors}). Last: ${message}`);
    }
  }

  warn(message) {
    const warning = {
      message,
      line: this.line,
      column: this.column,
      position: this.position
    };
    
    this.warnings.push(warning);
    
    if (this.debug) {
      console.warn(`[Lexer Warning] ${message} at ${this.line}:${this.column}`);
    }
  }

  handleCriticalError(err) {
    console.error('Critical lexer error:', err);
    console.error('Position:', this.position, 'State:', this.state);
    console.error('Context:', this.getErrorContext());
  }

  getErrorContext() {
    const start = Math.max(0, this.position - 30);
    const end = Math.min(this.length, this.position + 30);
    const before = this.input.slice(start, this.position);
    const after = this.input.slice(this.position, end);
    const pointer = ' '.repeat(before.length) + '^';
    
    return `...${before}${after}...\n${pointer}`;
  }

  // === Performance & Debugging ===
  
  printStats() {
    console.log('\n=== FML Lexer Performance Stats ===');
    console.log(`Total time: ${this.stats.totalTime.toFixed(2)}ms`);
    console.log(`Tokens processed: ${this.stats.tokensProcessed}`);
    console.log(`Tokens/ms: ${(this.stats.tokensProcessed / this.stats.totalTime).toFixed(2)}`);
    console.log(`Error recoveries: ${this.stats.errorRecoveries}`);
    console.log(`Errors: ${this.errors.length}`);
    console.log(`Warnings: ${this.warnings.length}`);
  }

  debugTokens() {
    console.log(`\n=== FML Lexer Tokens (Phase ${this.phase2 ? '2' : '1'}) ===`);
    console.log(`Total tokens: ${this.tokens.length}`);
    
    this.tokens.slice(0, 50).forEach((token, i) => {
      let val;
      if (typeof token.value === 'string') {
        val = `"${token.value.length > 50 ? token.value.slice(0, 50) + '...' : token.value}"`;
      } else {
        val = JSON.stringify(token.value, null, 0);
        if (val.length > 80) {
          val = val.slice(0, 80) + '...';
        }
      }
      
      console.log(`${i.toString().padStart(3)}: ${token.type.padEnd(20)} @ ${token.line}:${token.column} → ${val}`);
    });
    
    if (this.tokens.length > 50) {
      console.log(`... and ${this.tokens.length - 50} more tokens`);
    }
  }

  getStats() {
    return {
      ...this.stats,
      totalTokens: this.tokens.length,
      errors: this.errors.length,
      warnings: this.warnings.length,
      position: this.position,
      line: this.line,
      column: this.column,
      phase2: this.phase2,
      currentState: this.state,
      performance: {
        tokensPerMs: this.stats.totalTime > 0 ? this.stats.tokensProcessed / this.stats.totalTime : 0,
        avgTokenSize: this.input.length / this.stats.tokensProcessed
      }
    };
  }
}