// src/fml/parser/lexer.js
// Enhanced FML Lexer - Robust & Powerful (Phase 1 + Phase 2)

export const TokenType = {
  // Basic HTML tokens
  TAG_OPEN: 'TAG_OPEN',           // <div>
  TAG_CLOSE: 'TAG_CLOSE',         // </div>
  TAG_SELF_CLOSE: 'TAG_SELF_CLOSE', // <br />

  // Content tokens
  TEXT: 'TEXT',                   // Plain text
  INTERPOLATION: 'INTERPOLATION', // {simple}
  EXPRESSION_COMPLEX: 'EXPRESSION_COMPLEX', // {a + b}, {user.getName()}

  // Attribute tokens
  ATTRIBUTE_STATIC: 'ATTRIBUTE_STATIC', // name="value"
  ATTRIBUTE_DYNAMIC: 'ATTRIBUTE_DYNAMIC', // name={value}
  EVENT_HANDLER: 'EVENT_HANDLER',       // onClick={handler}

  // Special tokens
  COMPONENT: 'COMPONENT',         // <MyComponent>
  DIRECTIVE: 'DIRECTIVE',         // <If>, <For>, etc.
  EOF: 'EOF',                     // End of file
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

export class FMLLexer {
  constructor(input, options = {}) {
    this.input = input;
    this.length = input.length;
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.debug = !!options.debug;
    this.phase2 = options.phase2 !== false;
    this.tokens = [];
    this.errors = [];
  }

  tokenize() {
    this.tokens = [];
    this.errors = [];
    this.position = 0;
    this.line = 1;
    this.column = 1;

    try {
      while (this.position < this.length) {
        if (this.tokenizeNext()) {
          continue;
        }
        
        // If we get here, we couldn't tokenize anything - advance to prevent infinite loop
        const char = this.current();
        if (char) {
          this.error(`Unexpected character: '${char}'`);
        }
        this.advance();
      }

      this.tokens.push(this.createToken(TokenType.EOF, '', this.line, this.column));
    } catch (err) {
      if (this.debug) {
        console.error('Lexer error:', err);
        console.log('Position:', this.position, 'Character:', this.current());
        console.log('Context:', this.input.slice(Math.max(0, this.position - 20), this.position + 20));
      }
      throw err;
    }

    if (this.debug) this.debugTokens();
    return this.tokens;
  }

  // Main tokenization dispatcher
  tokenizeNext() {
    const startLine = this.line;
    const startColumn = this.column;
    const char = this.current();

    // Skip whitespace
    if (this.isWhitespace(char)) {
      this.skipWhitespace();
      return true;
    }

    // Skip comments
    if (this.isCommentStart()) {
      this.skipComment();
      return true;
    }

    // Handle tags
    if (char === '<') {
      this.tokenizeTag(startLine, startColumn);
      return true;
    }

    // Handle interpolation/expressions
    if (char === '{') {
      this.tokenizeInterpolation(startLine, startColumn);
      return true;
    }

    // Handle text content
    if (char && char !== '<' && char !== '{') {
      this.tokenizeText(startLine, startColumn);
      return true;
    }

    return false;
  }

  // === Character Utilities ===
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

  isWhitespace(char) {
    return /\s/.test(char);
  }

  isAlpha(char) {
    return /[a-zA-Z]/.test(char);
  }

  isAlphaNumeric(char) {
    return /[a-zA-Z0-9]/.test(char);
  }

  isTagNameChar(char) {
    return /[a-zA-Z0-9\-_]/.test(char);
  }

  isAttributeNameChar(char) {
    return /[a-zA-Z0-9\-_:]/.test(char);
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
    // Skip <!--
    this.advance(); this.advance(); this.advance(); this.advance();

    while (this.position < this.length - 2) {
      if (this.current() === '-' && this.peek() === '-' && this.peek(2) === '>') {
        // Skip -->
        this.advance(); this.advance(); this.advance();
        return;
      }
      this.advance();
    }
    
    this.error("Unclosed HTML comment");
  }

  // === Tag Tokenization ===
  tokenizeTag(startLine, startColumn) {
    this.advance(); // Skip '<'

    // Check for closing tag
    const isClosing = this.current() === '/';
    if (isClosing) {
      this.advance();
    }

    // Read tag name
    const tagName = this.readTagName();
    if (!tagName) {
      this.error("Expected tag name after '<'");
    }

    this.skipWhitespace();

    // Read attributes (only for opening tags)
    const attributes = isClosing ? [] : this.readAttributes();

    // Check for self-closing
    const isSelfClosing = this.current() === '/' && this.peek() === '>';
    if (isSelfClosing) {
      this.advance(); // Skip '/'
    }

    // Expect closing '>'
    if (this.current() !== '>') {
      this.error(`Expected '>' to close tag, found '${this.current()}'`);
    }
    this.advance(); // Skip '>'

    // Determine token type
    let tokenType;
    if (isClosing) {
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

    this.tokens.push(
      this.createToken(tokenType, {
        tagName,
        attributes,
        isClosing,
        isSelfClosing
      }, startLine, startColumn)
    );
  }

  readTagName() {
    let name = '';
    while (this.position < this.length && this.isTagNameChar(this.current())) {
      name += this.current();
      this.advance();
    }
    return name;
  }

  isComponent(tagName) {
    return /^[A-Z][a-zA-Z0-9]*$/.test(tagName);
  }

  // === Attributes ===
  readAttributes() {
    const attrs = [];
    
    while (this.position < this.length) {
      this.skipWhitespace();
      
      const char = this.current();
      if (!char || char === '>' || char === '/') {
        break;
      }

      try {
        if (char === '{') {
          // Dynamic object spread: {...props}
          attrs.push(this.readDynamicObject());
        } else if (this.isAlpha(char)) {
          // Regular attribute
          attrs.push(this.readAttribute());
        } else {
          // Unknown character - skip it
          this.error(`Unexpected character in attributes: '${char}'`);
        }
      } catch (err) {
        if (this.debug) {
          console.warn('Attribute parsing error:', err.message);
        }
        // Try to recover by skipping to next whitespace or tag end
        this.skipToNextAttribute();
      }
    }
    
    return attrs;
  }

  readAttribute() {
    const startLine = this.line;
    const startColumn = this.column;
    
    // Read attribute name
    const name = this.readAttributeName();
    if (!name) {
      this.error("Expected attribute name");
    }

    this.skipWhitespace();

    // Check for value
    if (this.current() !== '=') {
      // Boolean attribute
      return this.createToken(TokenType.ATTRIBUTE_STATIC, {
        type: 'static',
        name,
        value: true
      }, startLine, startColumn);
    }

    this.advance(); // Skip '='
    this.skipWhitespace();

    // Read attribute value
    const valueChar = this.current();
    
    if (valueChar === '{') {
      // Dynamic value
      const dynamic = this.readDynamicValue();
      const isEvent = this.phase2 && this.isEventAttribute(name);

      return this.createToken(isEvent ? TokenType.EVENT_HANDLER : TokenType.ATTRIBUTE_DYNAMIC, {
        type: isEvent ? 'event' : 'dynamic',
        name,
        content: dynamic.content,
        value: dynamic.value
      }, startLine, startColumn);
    } else {
      // Static value
      const staticValue = this.readAttributeValue();
      return this.createToken(TokenType.ATTRIBUTE_STATIC, {
        type: 'static',
        name,
        value: staticValue
      }, startLine, startColumn);
    }
  }

  readAttributeName() {
    let name = '';
    while (this.position < this.length && this.isAttributeNameChar(this.current())) {
      name += this.current();
      this.advance();
    }
    return name;
  }

  isEventAttribute(name) {
    return EVENT_ATTRIBUTES.has(name) || EVENT_PREFIX.test(name);
  }

  readAttributeValue() {
    const char = this.current();
    
    if (char === '"' || char === "'") {
      return this.readQuotedValue(char);
    } else {
      return this.readUnquotedValue();
    }
  }

  readQuotedValue(quote) {
    this.advance(); // Skip opening quote
    
    let value = '';
    while (this.position < this.length) {
      const char = this.current();
      
      if (char === quote) {
        this.advance(); // Skip closing quote
        break;
      }
      
      if (char === '\\') {
        // Handle escape sequences
        this.advance();
        const escaped = this.current();
        if (escaped) {
          value += this.getEscapedChar(escaped);
          this.advance();
        }
      } else if (char === '\n') {
        this.error("Unterminated string literal");
      } else {
        value += char;
        this.advance();
      }
    }
    
    return value;
  }

  getEscapedChar(char) {
    switch (char) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '\\': return '\\';
      case '"': return '"';
      case "'": return "'";
      default: return char;
    }
  }

  readUnquotedValue() {
    let value = '';
    while (this.position < this.length) {
      const char = this.current();
      if (this.isWhitespace(char) || char === '>' || char === '/' || char === '<') {
        break;
      }
      value += char;
      this.advance();
    }
    return value;
  }

  readDynamicValue() {
    return this.readEnclosedExpression('{', '}');
  }

  readDynamicObject() {
    const { content } = this.readEnclosedExpression('{', '}');
    return this.createToken(TokenType.ATTRIBUTE_DYNAMIC, {
      type: 'dynamic-object',
      content
    }, this.line, this.column);
  }

  skipToNextAttribute() {
    while (this.position < this.length) {
      const char = this.current();
      if (this.isWhitespace(char) || char === '>' || char === '/') {
        break;
      }
      this.advance();
    }
  }

  // === Interpolation & Expressions ===
  tokenizeInterpolation(startLine, startColumn) {
    const { content } = this.readEnclosedExpression('{', '}');
    
    if (!content.trim()) {
      this.error("Empty interpolation expression");
    }

    const tokenType = this.phase2 && this.isComplexExpression(content)
      ? TokenType.EXPRESSION_COMPLEX
      : TokenType.INTERPOLATION;

    this.tokens.push(this.createToken(tokenType, content, startLine, startColumn));
  }

  isComplexExpression(content) {
    const trimmed = content.trim();
    return (
      /\w\s*\(/.test(trimmed) ||           // Method calls: user.getName()
      /[+\-*/%<>=!&|]/.test(trimmed) ||    // Operators: a + b, x > y
      /\?\s*.*\s*:/.test(trimmed) ||       // Ternary: condition ? a : b
      /^\s*[\[{]/.test(trimmed) ||         // Literals: [1,2,3], {key: value}
      /&&|\|\|/.test(trimmed) ||           // Logical: a && b, x || y
      /===|!==|==|!=|<=|>=/.test(trimmed)  // Comparisons: a === b
    );
  }

  // === Text ===
  tokenizeText(startLine, startColumn) {
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
      this.tokens.push(this.createToken(TokenType.TEXT, text, startLine, startColumn));
    }
  }

  // === General Utilities ===
  skipWhitespace() {
    while (this.position < this.length && this.isWhitespace(this.current())) {
      this.advance();
    }
  }

  readEnclosedExpression(open, close) {
    if (this.current() !== open) {
      return { content: '', line: this.line, column: this.column };
    }

    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // Skip opening character

    let depth = 1;
    let content = '';
    let inString = false;
    let stringChar = '';

    while (this.position < this.length && depth > 0) {
      const char = this.current();

      if (!inString) {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === open) {
          depth++;
        } else if (char === close) {
          depth--;
        }
      } else {
        if (char === stringChar && this.input[this.position - 1] !== '\\') {
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
    }

    return {
      content: content.trim(),
      line: startLine,
      column: startColumn
    };
  }

  // === Token & Error Management ===
  createToken(type, value, line, column) {
    return {
      type,
      value,
      line,
      column,
      // Add source position for debugging
      position: this.position
    };
  }

  error(message, line = this.line, column = this.column) {
    const context = this.getErrorContext();
    const fullMessage = `${message}\n${context}`;
    
    const err = new SyntaxError(`Lexer error at ${line}:${column} - ${fullMessage}`);
    err.location = { line, column, position: this.position };
    err.context = context;
    
    throw err;
  }

  getErrorContext() {
    const start = Math.max(0, this.position - 30);
    const end = Math.min(this.length, this.position + 30);
    const before = this.input.slice(start, this.position);
    const after = this.input.slice(this.position, end);
    const pointer = ' '.repeat(before.length) + '^';
    
    return `Context: ...${before}${after}...\n         ${pointer}`;
  }

  debugTokens() {
    console.log(`=== FML Lexer Tokens (Phase ${this.phase2 ? '2' : '1'}) ===`);
    console.log(`Total tokens: ${this.tokens.length}`);
    
    this.tokens.forEach((token, i) => {
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
  }

  // === Recovery & Error Handling ===
  recover() {
    // Try to recover from errors by finding the next safe token
    while (this.position < this.length) {
      const char = this.current();
      if (char === '<' || char === '}' || this.isWhitespace(char)) {
        break;
      }
      this.advance();
    }
  }

  getStats() {
    return {
      totalTokens: this.tokens.length,
      errors: this.errors.length,
      position: this.position,
      line: this.line,
      column: this.column,
      phase2: this.phase2
    };
  }
}