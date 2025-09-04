// src/fml/parser/lexer.js

export const TokenType = {
  // Basic HTML tokens
  TAG_OPEN: 'TAG_OPEN',           // <div>
  TAG_CLOSE: 'TAG_CLOSE',         // </div>
  TAG_SELF_CLOSE: 'TAG_SELF_CLOSE', // <br />
  
  // Content tokens
  TEXT: 'TEXT',                   // Plain text content
  INTERPOLATION: 'INTERPOLATION', // {expression}
  
  // Attribute tokens
  ATTRIBUTE: 'ATTRIBUTE',         // name="value"
  ATTRIBUTE_DYNAMIC: 'ATTRIBUTE_DYNAMIC', // {prop: value}
  
  // Special tokens
  COMPONENT: 'COMPONENT',         // <ComponentName>
  EOF: 'EOF',                     // End of file
  
  // Phase 2 tokens (placeholder)
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
      this.skipWhitespace();
      
      if (this.position >= this.input.length) break;
      
      const char = this.current();
      
      if (char === '<') {
        this.tokenizeTag();
      } else if (char === '{') {
        this.tokenizeInterpolation();
      } else {
        this.tokenizeText();
      }
    }

    this.tokens.push(this.createToken(TokenType.EOF, ''));
    return this.tokens;
  }

  // Get current character
  current() {
    return this.input[this.position] || '';
  }

  // Get next character without advancing
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

  // Skip whitespace (but preserve it in text nodes)
  skipWhitespace() {
    while (this.isWhitespace(this.current()) && !this.isInTag()) {
      this.advance();
    }
  }

  // Check if character is whitespace
  isWhitespace(char) {
    return /\s/.test(char);
  }

  // Check if we're currently inside a tag
  isInTag() {
    // Simple heuristic - can be improved in Phase 2
    return false;
  }

  // Tokenize HTML-like tags
  tokenizeTag() {
    const start = this.position;
    this.advance(); // Skip '<'
    
    // Check for closing tag
    const isClosing = this.current() === '/';
    if (isClosing) this.advance();
    
    // Read tag name
    const tagName = this.readTagName();
    
    if (!tagName) {
      throw new Error(`Invalid tag at line ${this.line}, column ${this.column}`);
    }
    
    // Skip whitespace before attributes
    this.skipTagWhitespace();
    
    // Read attributes
    const attributes = this.readAttributes();
    
    // Check for self-closing
    const isSelfClosing = this.current() === '/' && this.peek() === '>';
    if (isSelfClosing) {
      this.advance(); // Skip '/'
    }
    
    // Expect closing '>'
    if (this.current() !== '>') {
      throw new Error(`Expected '>' at line ${this.line}, column ${this.column}`);
    }
    this.advance(); // Skip '>'
    
    // Determine token type
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
    
    const token = this.createToken(tokenType, {
      tagName,
      attributes,
      isClosing,
      isSelfClosing
    });
    
    this.tokens.push(token);
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

  // Check if character is valid for tag name
  isTagNameChar(char) {
    return /[a-zA-Z0-9\-_]/.test(char);
  }

  // Check if tag name represents a component (starts with uppercase)
  isComponent(tagName) {
    return /^[A-Z]/.test(tagName);
  }

  // Skip whitespace within tags
  skipTagWhitespace() {
    while (this.isWhitespace(this.current())) {
      this.advance();
    }
  }

  // Read tag attributes
  readAttributes() {
    const attributes = [];
    
    while (this.current() && this.current() !== '>' && this.current() !== '/') {
      this.skipTagWhitespace();
      
      if (this.current() === '{') {
        // Dynamic attribute object {prop: value, another: value}
        attributes.push(this.readDynamicAttributes());
      } else if (this.isTagNameChar(this.current())) {
        // Regular attribute name="value"
        attributes.push(this.readStaticAttribute());
      } else {
        break;
      }
      
      this.skipTagWhitespace();
    }
    
    return attributes;
  }

  // Read static attribute like name="value"
  readStaticAttribute() {
    const name = this.readAttributeName();
    this.skipTagWhitespace();
    
    let value = true; // Boolean attribute default
    
    if (this.current() === '=') {
      this.advance(); // Skip '='
      this.skipTagWhitespace();
      value = this.readAttributeValue();
    }
    
    return {
      type: 'static',
      name,
      value
    };
  }

  // Read dynamic attributes {prop: value}
  readDynamicAttributes() {
    this.advance(); // Skip '{'
    
    const content = this.readUntil('}');
    this.advance(); // Skip '}'
    
    return {
      type: 'dynamic',
      content: content.trim()
    };
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

  // Read attribute value (quoted string)
  readAttributeValue() {
    const quote = this.current();
    
    if (quote !== '"' && quote !== "'") {
      // Unquoted value
      return this.readUnquotedValue();
    }
    
    this.advance(); // Skip opening quote
    let value = '';
    
    while (this.current() && this.current() !== quote) {
      if (this.current() === '\\') {
        this.advance(); // Skip escape
        value += this.current() || '';
      } else {
        value += this.current();
      }
      this.advance();
    }
    
    if (this.current() === quote) {
      this.advance(); // Skip closing quote
    }
    
    return value;
  }

  // Read unquoted attribute value
  readUnquotedValue() {
    let value = '';
    while (this.current() && !this.isWhitespace(this.current()) && 
           this.current() !== '>' && this.current() !== '/') {
      value += this.current();
      this.advance();
    }
    return value;
  }

  // Tokenize interpolation {expression}
  tokenizeInterpolation() {
    this.advance(); // Skip '{'
    
    const content = this.readUntil('}');
    
    if (this.current() !== '}') {
      throw new Error(`Unclosed interpolation at line ${this.line}, column ${this.column}`);
    }
    this.advance(); // Skip '}'
    
    this.tokens.push(this.createToken(TokenType.INTERPOLATION, content.trim()));
  }

  // Tokenize plain text content
  tokenizeText() {
    let text = '';
    
    while (this.current() && this.current() !== '<' && this.current() !== '{') {
      text += this.current();
      this.advance();
    }
    
    if (text) {
      this.tokens.push(this.createToken(TokenType.TEXT, text));
    }
  }

  // Read until specific character
  readUntil(char) {
    let content = '';
    while (this.current() && this.current() !== char) {
      content += this.current();
      this.advance();
    }
    return content;
  }

  // Create token object
  createToken(type, value) {
    return {
      type,
      value,
      line: this.line,
      column: this.column - (typeof value === 'string' ? value.length : 0)
    };
  }

  // Debug helper
  debugTokens() {
    if (!this.debug) return;
    
    console.log('FML Tokens:');
    this.tokens.forEach((token, index) => {
      console.log(`${index}: ${token.type} - ${JSON.stringify(token.value)}`);
    });
  }
}