// src/fml/parser/lexer.js
// FML Lexer - Phase 1 (Optimized & Secure)

export const TokenType = {
  // Basic HTML tokens
  TAG_OPEN: 'TAG_OPEN',           // <div>
  TAG_CLOSE: 'TAG_CLOSE',         // </div>
  TAG_SELF_CLOSE: 'TAG_SELF_CLOSE', // <br />
  
  // Content tokens
  TEXT: 'TEXT',                   // Plain text content
  INTERPOLATION: 'INTERPOLATION', // {expression}
  
  // Attribute tokens
  ATTRIBUTE_STATIC: 'ATTRIBUTE_STATIC', // name="value"
  ATTRIBUTE_DYNAMIC: 'ATTRIBUTE_DYNAMIC', // name={value}
  
  // Special tokens
  COMPONENT: 'COMPONENT',         // <ComponentName>
  EOF: 'EOF',                     // End of file
  
  // Phase 2 tokens (future-ready)
  DIRECTIVE: 'DIRECTIVE'          // <If>, <For>, etc.
};

export class FMLLexer {
  constructor(input, options = {}) {
    this.input = input;
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.debug = options.debug || false;
    this.tokens = [];
  }

  // Main tokenization method
  tokenize() {
    this.tokens = [];
    this.position = 0;
    this.line = 1;
    this.column = 1;

    while (this.position < this.input.length) {
      const startLine = this.line;
      const startColumn = this.column;
      const char = this.current();

      // Skip whitespace
      if (this.isWhitespace(char)) {
        this.advance();
        continue;
      }

      // Handle comments
      if (this.isCommentStart()) {
        this.skipComment();
        continue;
      }

      // Handle tags
      if (char === '<') {
        this.tokenizeTag(startLine, startColumn);
        continue;
      }

      // Handle interpolation
      if (char === '{') {
        this.tokenizeInterpolation(startLine, startColumn);
        continue;
      }

      // Handle text
      this.tokenizeText(startLine, startColumn);
    }

    this.tokens.push(this.createToken(TokenType.EOF, '', this.line, this.column));
    return this.tokens;
  }

  // Get current character
  current() {
    return this.input[this.position] || '';
  }

  // Peek ahead without advancing
  peek(offset = 1) {
    return this.input[this.position + offset] || '';
  }

  // Advance position
  advance() {
    if (this.current() === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.position++;
  }

  // Check if character is whitespace
  isWhitespace(char) {
    return /\s/.test(char);
  }

  // Check if current position starts a comment
  isCommentStart() {
    return this.current() === '<' && 
           this.peek() === '!' && 
           this.peek(2) === '-' && 
           this.peek(3) === '-';
  }

  // Skip HTML comment <!-- ... -->
  skipComment() {
    // Skip "<!--"
    for (let i = 0; i < 4; i++) this.advance();

    // Read until "-->"
    while (this.position < this.input.length - 2) {
      if (this.current() === '-' && this.peek() === '-' && this.peek(2) === '>') {
        break;
      }
      this.advance();
    }

    // Skip "-->"
    if (this.position < this.input.length - 2) {
      this.advance(); // -
      this.advance(); // -
      this.advance(); // >
    }
  }

  // Tokenize tag
  tokenizeTag(startLine, startColumn) {
    this.advance(); // Skip '<'

    const isClosing = this.current() === '/';
    if (isClosing) this.advance();

    const tagName = this.readTagName();
    if (!tagName) {
      this.error(`Invalid tag name`, startLine, startColumn);
    }

    this.skipWhitespace();

    const attributes = this.readAttributes();

    const isSelfClosing = this.current() === '/' && this.peek() === '>';
    if (isSelfClosing) this.advance();

    if (this.current() !== '>') {
      this.error(`Expected '>'`, this.line, this.column);
    }
    this.advance(); // Skip '>'

    let tokenType;
    if (isClosing) {
      tokenType = TokenType.TAG_CLOSE;
    } else if (isSelfClosing) {
      tokenType = TokenType.TAG_SELF_CLOSE;
    } else if (this.isComponent(tagName)) {
      tokenType = TokenType.COMPONENT;
    } else {
      tokenType = TokenType.TAG_OPEN;
    }

    this.tokens.push(this.createToken(tokenType, {
      tagName,
      attributes,
      isClosing,
      isSelfClosing
    }, startLine, startColumn));
  }

  // Read tag name
  readTagName() {
    let name = '';
    while (this.isTagNameChar(this.current())) {
      name += this.current();
      this.advance();
    }
    return name;
  }

  // Check if character is valid in tag name
  isTagNameChar(char) {
    return /[a-zA-Z0-9\-_]/.test(char);
  }

  // Check if tag is a component (PascalCase)
  isComponent(tagName) {
    return /^[A-Z][a-zA-Z0-9]*$/.test(tagName);
  }

  // Skip whitespace
  skipWhitespace() {
    while (this.isWhitespace(this.current())) {
      this.advance();
    }
  }

  // Read all attributes
  readAttributes() {
    const attrs = [];
    while (this.current() && this.current() !== '>' && this.current() !== '/') {
      this.skipWhitespace();
      if (this.current() === '{') {
        attrs.push(this.readDynamicObject());
      } else if (this.isTagNameChar(this.current())) {
        attrs.push(this.readAttribute());
      } else {
        break;
      }
      this.skipWhitespace();
    }
    return attrs;
  }

  // Read attribute (static or dynamic value)
  readAttribute() {
    const startLine = this.line;
    const startColumn = this.column;
    const name = this.readAttributeName();

    this.skipWhitespace();

    if (this.current() !== '=') {
      return this.createToken(TokenType.ATTRIBUTE_STATIC, {
        type: 'static',
        name,
        value: true
      }, startLine, startColumn);
    }

    this.advance(); // Skip '='
    this.skipWhitespace();

    let value;
    if (this.current() === '{') {
      value = this.readDynamicValue();
      return this.createToken(TokenType.ATTRIBUTE_DYNAMIC, {
        type: 'dynamic',
        name,
        content: value.content,
        value: value.value
      }, startLine, startColumn);
    } else {
      const staticValue = this.readAttributeValue();
      return this.createToken(TokenType.ATTRIBUTE_STATIC, {
        type: 'static',
        name,
        value: staticValue
      }, startLine, startColumn);
    }
  }

  // Read dynamic value: {expression}
  readDynamicValue() {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // Skip '{'

    let depth = 1;
    let content = '';

    while (this.position < this.input.length && depth > 0) {
      const char = this.current();
      if (char === '{') depth++;
      if (char === '}') depth--;
      if (depth > 0) content += char;
      this.advance();
    }

    const value = content.trim();
    return { content: value, value, line: startLine, column: startColumn };
  }

  // Read dynamic object: {prop: value, enabled: true}
  readDynamicObject() {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // Skip '{'

    let depth = 1;
    let content = '';

    while (this.position < this.input.length && depth > 0) {
      const char = this.current();
      if (char === '{') depth++;
      if (char === '}') depth--;
      if (depth > 0) content += char;
      this.advance();
    }

    return this.createToken(TokenType.ATTRIBUTE_DYNAMIC, {
      type: 'dynamic-object',
      content: content.trim()
    }, startLine, startColumn);
  }

  // Read attribute name
  readAttributeName() {
    let name = '';
    while (this.isTagNameChar(this.current()) || this.current() === ':') {
      name += this.current();
      this.advance();
    }
    return name;
  }

  // Read attribute value (quoted or unquoted)
  readAttributeValue() {
    const quote = this.current();
    if (quote === '"' || quote === "'") {
      return this.readQuotedValue();
    }
    return this.readUnquotedValue();
  }

  // Read quoted value
  readQuotedValue() {
    const quote = this.current();
    this.advance(); // Skip opening quote
    let value = '';
    while (this.current() && this.current() !== quote) {
      if (this.current() === '\\') {
        this.advance(); // Skip escape
      }
      value += this.current();
      this.advance();
    }
    if (this.current() === quote) this.advance(); // Skip closing quote
    return value;
  }

  // Read unquoted value
  readUnquotedValue() {
    let value = '';
    while (this.current() && !this.isWhitespace(this.current()) &&
           this.current() !== '>' && this.current() !== '/' && this.current() !== '=') {
      value += this.current();
      this.advance();
    }
    return value;
  }

  // Tokenize interpolation {expression}
  tokenizeInterpolation(startLine, startColumn) {
    const { content, line, column } = this.readEnclosedExpression('{', '}');
    this.tokens.push(this.createToken(TokenType.INTERPOLATION, content, startLine, startColumn));
  }

  // Read text content
  tokenizeText(startLine, startColumn) {
    let text = '';
    while (this.current() && this.current() !== '<' && this.current() !== '{') {
      text += this.current();
      this.advance();
    }
    if (text.trim()) {
      this.tokens.push(this.createToken(TokenType.TEXT, text, startLine, startColumn));
    }
  }

  // Read expression enclosed in delimiters (e.g., { })
  readEnclosedExpression(open, close) {
    if (this.current() !== open) return { content: '', line: this.line, column: this.column };
    this.advance(); // Skip open

    let depth = 1;
    let content = '';
    const startLine = this.line;
    const startColumn = this.column;

    while (this.position < this.input.length && depth > 0) {
      const char = this.current();
      if (char === open) depth++;
      if (char === close) depth--;
      if (depth > 0) content += char;
      this.advance();
    }

    return { content: content.trim(), line: startLine, column: startColumn };
  }

  // Create token with location
  createToken(type, value, line, column) {
    return {
      type,
      value,
      line,
      column
    };
  }

  // Error with location
  error(message, line = this.line, column = this.column) {
    throw new Error(`Lexer error at ${line}:${column} - ${message}`);
  }

  // Debug tokens
  debugTokens() {
    if (!this.debug) return;
    console.log('FML Tokens:');
    this.tokens.forEach((t, i) => {
      console.log(`${i}: ${t.type} -`, JSON.stringify(t.value));
    });
  }
}