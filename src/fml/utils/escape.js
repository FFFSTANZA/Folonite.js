// src/fml/utils/escape.js

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '<',
  '>': '>',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

const EXTENDED_HTML_ESCAPE_MAP = {
  ...HTML_ESCAPE_MAP,
  '\u00A0': '&nbsp;',   // Non-breaking space
  '\u2028': '&#x2028;', // Line separator
  '\u2029': '&#x2029;', // Paragraph separator
  '\u0000': '',         // Null character (remove)
  '\uFEFF': ''          // Byte order mark (remove)
};

const UNICODE_ESCAPE_MAP = {
  '\u0000': '',
  '\u0001': '',
  '\u0002': '',
  '\u0003': '',
  '\u0004': '',
  '\u0005': '',
  '\u0006': '',
  '\u0007': '',
  '\u0008': '',
  '\u000B': '',
  '\u000C': '',
  '\u000E': '',
  '\u000F': '',
  '\u0010': '',
  '\u0011': '',
  '\u0012': '',
  '\u0013': '',
  '\u0014': '',
  '\u0015': '',
  '\u0016': '',
  '\u0017': '',
  '\u0018': '',
  '\u0019': '',
  '\u001A': '',
  '\u001B': '',
  '\u001C': '',
  '\u001D': '',
  '\u001E': '',
  '\u001F': '',
  '\u007F': ''
};

/**
 * Performance-optimized regex patterns
 */
const HTML_ESCAPE_REGEX = /[&<>"'\/`=]/g;
const EXTENDED_HTML_ESCAPE_REGEX = /[&<>"'\/`=\u00A0\u2028\u2029\u0000\uFEFF]/g;
const UNICODE_CONTROL_REGEX = /[\u0000-\u001F\u007F]/g;
const ATTRIBUTE_ESCAPE_REGEX = /["&]/g;
const JAVASCRIPT_ESCAPE_REGEX = /[\\'"\/\r\n\t\b\f]/g;

/**
 * XSS attack patterns for detection
 */
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
  /<object[\s\S]*?>[\s\S]*?<\/object>/gi,
  /<embed[\s\S]*?>[\s\S]*?<\/embed>/gi,
  /<link[\s\S]*?>/gi,
  /<meta[\s\S]*?>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /on\w+\s*=/gi,
  /<svg[\s\S]*?>[\s\S]*?<\/svg>/gi,
  /<math[\s\S]*?>[\s\S]*?<\/math>/gi,
  /expression\s*\(/gi,
  /@import/gi,
  /url\s*\(\s*['"]*javascript:/gi
];

/**
 * CSS injection patterns
 */
const CSS_INJECTION_PATTERNS = [
  /javascript:/gi,
  /expression\s*\(/gi,
  /url\s*\(\s*['"]*javascript:/gi,
  /url\s*\(\s*['"]*data:/gi,
  /@import/gi,
  /binding:/gi,
  /-moz-binding/gi,
  /behavior:/gi,
  /\\([0-9a-f]{1,6})/gi, // Unicode escape sequences
  /\/\*[\s\S]*?\*\//g    // CSS comments (can hide attacks)
];

/**
 * URL validation patterns
 */
const URL_PROTOCOLS = {
  SAFE: ['http:', 'https:', 'ftp:', 'ftps:', 'mailto:', 'tel:', 'sms:'],
  UNSAFE: ['javascript:', 'vbscript:', 'data:', 'blob:', 'file:'],
  RELATIVE: ['/', './', '../', '#']
};

/**
 * Content Security Policy nonce generator
 */
let nonceCounter = 0;
const CSP_NONCE_LENGTH = 16;

/**
 * Performance cache for frequently escaped strings
 */
const escapeCache = new Map();
const ESCAPE_CACHE_MAX_SIZE = 1000;
const ESCAPE_CACHE_MAX_STRING_LENGTH = 100;

/**
 * Enhanced HTML entity escaping with performance optimization
 * @param {any} text - Text to escape
 * @param {Object} options - Escaping options
 * @returns {string} Escaped text
 */
export function escapeHtml(text, options = {}) {
  if (text === null || text === undefined) {
    return '';
  }
  
  if (typeof text !== 'string') {
    text = String(text);
  }
  
  if (text === '') {
    return '';
  }

  const {
    extended = false,
    removeControlChars = true,
    useCache = true,
    maxLength = 10000
  } = options;

  // Truncate extremely long strings for security
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
  }

  // Check cache for short, frequently used strings
  if (useCache && text.length <= ESCAPE_CACHE_MAX_STRING_LENGTH) {
    const cacheKey = `${text}-${extended}-${removeControlChars}`;
    if (escapeCache.has(cacheKey)) {
      return escapeCache.get(cacheKey);
    }
  }

  let result = text;

  // Remove Unicode control characters
  if (removeControlChars) {
    result = result.replace(UNICODE_CONTROL_REGEX, char => UNICODE_ESCAPE_MAP[char] || '');
  }

  // Apply HTML escaping
  const escapeMap = extended ? EXTENDED_HTML_ESCAPE_MAP : HTML_ESCAPE_MAP;
  const escapeRegex = extended ? EXTENDED_HTML_ESCAPE_REGEX : HTML_ESCAPE_REGEX;
  
  result = result.replace(escapeRegex, char => escapeMap[char] || char);

  // Cache the result
  if (useCache && text.length <= ESCAPE_CACHE_MAX_STRING_LENGTH) {
    const cacheKey = `${text}-${extended}-${removeControlChars}`;
    
    // Manage cache size
    if (escapeCache.size >= ESCAPE_CACHE_MAX_SIZE) {
      const firstKey = escapeCache.keys().next().value;
      escapeCache.delete(firstKey);
    }
    
    escapeCache.set(cacheKey, result);
  }

  return result;
}

/**
 * Enhanced attribute escaping with type-specific sanitization
 * @param {any} attr - Attribute value to escape
 * @param {string} attrName - Attribute name for context
 * @param {string} tagName - Tag name for context
 * @returns {string} Escaped and sanitized attribute value
 */
export function escapeAttribute(attr, attrName = '', tagName = '') {
  if (attr === null || attr === undefined) {
    return '';
  }
  
  if (typeof attr !== 'string') {
    attr = String(attr);
  }

  // Type-specific attribute sanitization
  const sanitized = sanitizeAttributeByType(attr, attrName, tagName);
  
  // Basic HTML attribute escaping
  return sanitized.replace(ATTRIBUTE_ESCAPE_REGEX, char => HTML_ESCAPE_MAP[char]);
}

/**
 * Sanitize attributes based on their type and context
 * @param {string} value - Attribute value
 * @param {string} attrName - Attribute name
 * @param {string} tagName - Tag name
 * @returns {string} Sanitized value
 */
export function sanitizeAttributeByType(value, attrName, tagName) {
  if (!value) return '';
  
  const lowerAttrName = attrName.toLowerCase();
  const lowerTagName = tagName.toLowerCase();

  // URL attributes
  if (isUrlAttribute(lowerAttrName, lowerTagName)) {
    return sanitizeUrl(value);
  }

  // Style attributes
  if (lowerAttrName === 'style') {
    return sanitizeCSSInline(value);
  }

  // Class attributes
  if (lowerAttrName === 'class' || lowerAttrName === 'classname') {
    return sanitizeClassName(value);
  }

  // ID attributes
  if (lowerAttrName === 'id') {
    return sanitizeId(value);
  }

  // Data attributes
  if (lowerAttrName.startsWith('data-')) {
    return sanitizeDataAttribute(value);
  }

  // Event handlers (should be blocked in most cases)
  if (lowerAttrName.startsWith('on')) {
    return ''; // Block all event handlers in attributes
  }

  // srcset attribute (for responsive images)
  if (lowerAttrName === 'srcset') {
    return sanitizeSrcset(value);
  }

  // Content attributes
  if (['alt', 'title', 'placeholder', 'label'].includes(lowerAttrName)) {
    return sanitizeContentAttribute(value);
  }

  // Default: basic sanitization
  return sanitizeGenericAttribute(value);
}

/**
 * Enhanced CSS value sanitization with injection protection
 * @param {string} property - CSS property name
 * @param {string} value - CSS property value
 * @returns {string} Sanitized value or empty string
 */
export function sanitizeCSSValue(property, value) {
  if (typeof value !== 'string') return '';
  
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';

  // Check for CSS injection patterns
  for (const pattern of CSS_INJECTION_PATTERNS) {
    if (pattern.test(trimmedValue)) {
      return '';
    }
  }

  // Property-specific validation
  const lowerProperty = property.toLowerCase();
  
  switch (lowerProperty) {
    case 'color':
    case 'background-color':
    case 'border-color':
      return sanitizeColorValue(trimmedValue);
    
    case 'font-family':
      return sanitizeFontFamily(trimmedValue);
    
    case 'background-image':
      return sanitizeBackgroundImage(trimmedValue);
    
    case 'url':
      return ''; // Block URL properties entirely
    
    default:
      return sanitizeGenericCSSValue(trimmedValue);
  }
}

/**
 * Sanitize inline CSS styles
 * @param {string} styles - CSS styles string
 * @returns {string} Sanitized styles
 */
export function sanitizeCSSInline(styles) {
  if (typeof styles !== 'string') return '';
  
  const declarations = styles.split(';');
  const sanitizedDeclarations = [];
  
  for (const declaration of declarations) {
    const colonIndex = declaration.indexOf(':');
    if (colonIndex === -1) continue;
    
    const property = declaration.substring(0, colonIndex).trim();
    const value = declaration.substring(colonIndex + 1).trim();
    
    const sanitizedValue = sanitizeCSSValue(property, value);
    if (sanitizedValue) {
      sanitizedDeclarations.push(`${property}: ${sanitizedValue}`);
    }
  }
  
  return sanitizedDeclarations.join('; ');
}

/**
 * Enhanced URL validation and sanitization
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @returns {string} Sanitized URL or empty string
 */
export function sanitizeUrl(url, options = {}) {
  if (typeof url !== 'string') return '';
  
  const {
    allowDataUrls = false,
    allowRelative = true,
    allowProtocols = URL_PROTOCOLS.SAFE
  } = options;

  const trimmedUrl = url.trim();
  if (!trimmedUrl) return '';

  // Check for obvious XSS attempts
  if (containsXSSPatterns(trimmedUrl)) {
    return '';
  }

  try {
    // Handle relative URLs
    if (allowRelative && isRelativeUrl(trimmedUrl)) {
      return escapeHtml(trimmedUrl);
    }

    // Parse absolute URLs
    const urlObj = new URL(trimmedUrl);
    const protocol = urlObj.protocol.toLowerCase();

    // Check protocol whitelist
    if (!allowProtocols.includes(protocol)) {
      // Special handling for data URLs
      if (protocol === 'data:' && allowDataUrls) {
        return sanitizeDataUrl(trimmedUrl);
      }
      return '';
    }

    // Additional validation for specific protocols
    if (protocol === 'javascript:' || protocol === 'vbscript:') {
      return '';
    }

    return escapeHtml(urlObj.href);
  } catch (error) {
    // Invalid URL
    return '';
  }
}

/**
 * XSS protection tests
 * @param {string} content - Content to test
 * @returns {Object} Test results
 */
export function testXSSProtection(content) {
  if (typeof content !== 'string') {
    return { safe: true, threats: [] };
  }

  const threats = [];
  
  for (let i = 0; i < XSS_PATTERNS.length; i++) {
    const pattern = XSS_PATTERNS[i];
    const matches = content.match(pattern);
    
    if (matches) {
      threats.push({
        type: getXSSPatternType(i),
        pattern: pattern.source,
        matches: matches.slice(0, 3) // Limit to first 3 matches
      });
    }
  }

  return {
    safe: threats.length === 0,
    threats,
    recommendation: threats.length > 0 ? 'Content contains potential XSS vectors and should be sanitized' : 'Content appears safe'
  };
}

/**
 * Content Security Policy helpers
 */
export const CSP = {
  /**
   * Generate a cryptographically secure nonce
   * @returns {string} Base64 encoded nonce
   */
  generateNonce() {
    const array = new Uint8Array(CSP_NONCE_LENGTH);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for environments without crypto
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    
    // Convert to base64
    return btoa(String.fromCharCode.apply(null, array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  },

  /**
   * Create script tag with nonce
   * @param {string} content - Script content
   * @param {string} nonce - CSP nonce
   * @returns {string} Script tag with nonce
   */
  createNonceScript(content, nonce = null) {
    const scriptNonce = nonce || this.generateNonce();
    const escapedContent = escapeJavaScript(content);
    return `<script nonce="${escapeAttribute(scriptNonce)}">${escapedContent}</script>`;
  },

  /**
   * Create style tag with nonce
   * @param {string} content - CSS content
   * @param {string} nonce - CSP nonce
   * @returns {string} Style tag with nonce
   */
  createNonceStyle(content, nonce = null) {
    const styleNonce = nonce || this.generateNonce();
    const sanitizedContent = sanitizeCSSInline(content);
    return `<style nonce="${escapeAttribute(styleNonce)}">${sanitizedContent}</style>`;
  },

  /**
   * Generate CSP header
   * @param {Object} policies - CSP policies
   * @returns {string} CSP header value
   */
  generateHeader(policies = {}) {
    const defaultPolicies = {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'frame-src': ["'none'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"]
    };

    const mergedPolicies = { ...defaultPolicies, ...policies };
    
    return Object.entries(mergedPolicies)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');
  }
};

/**
 * Enhanced JavaScript string escaping
 * @param {string} str - String to escape
 * @param {Object} options - Escaping options
 * @returns {string} Escaped string
 */
export function escapeJavaScript(str, options = {}) {
  if (typeof str !== 'string') {
    return JSON.stringify(str);
  }

  const { quote = '"', escapeHtml: shouldEscapeHtml = false } = options;
  
  let escaped = str.replace(JAVASCRIPT_ESCAPE_REGEX, char => {
    switch (char) {
      case '\\': return '\\\\';
      case '"': return quote === '"' ? '\\"' : '"';
      case "'": return quote === "'" ? "\\'" : "'";
      case '/': return '\\/';
      case '\r': return '\\r';
      case '\n': return '\\n';
      case '\t': return '\\t';
      case '\b': return '\\b';
      case '\f': return '\\f';
      default: return char;
    }
  });

  // Additional HTML escaping if requested
  if (shouldEscapeHtml) {
    escaped = escapeHtml(escaped);
  }

  return escaped;
}

/**
 * Utility functions (implementation)
 */

function isUrlAttribute(attrName, tagName) {
  const urlAttributes = {
    'a': ['href'],
    'img': ['src', 'srcset'],
    'link': ['href'],
    'script': ['src'],
    'iframe': ['src'],
    'form': ['action'],
    'input': ['formaction'],
    'video': ['src', 'poster'],
    'audio': ['src'],
    'source': ['src', 'srcset'],
    'object': ['data'],
    'embed': ['src']
  };
  
  return urlAttributes[tagName]?.includes(attrName) || 
         ['href', 'src', 'action', 'formaction', 'data'].includes(attrName);
}

function sanitizeClassName(value) {
  // Allow alphanumeric, hyphens, underscores, and spaces
  return value.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim();
}

function sanitizeId(value) {
  // Allow alphanumeric, hyphens, underscores (HTML5 ID rules)
  return value.replace(/[^a-zA-Z0-9\-_]/g, '').replace(/^[^a-zA-Z]/, '');
}

function sanitizeDataAttribute(value) {
  // Data attributes can contain most characters, but escape dangerous ones
  return escapeHtml(value);
}

function sanitizeSrcset(value) {
  // Simplified srcset sanitization
  return value
    .split(',')
    .map(src => {
      const [url, descriptor] = src.trim().split(/\s+/);
      const sanitizedUrl = sanitizeUrl(url);
      return sanitizedUrl ? `${sanitizedUrl} ${descriptor || ''}`.trim() : '';
    })
    .filter(Boolean)
    .join(', ');
}

function sanitizeContentAttribute(value) {
  // Basic text content - remove dangerous characters
  return value.replace(/[<>]/g, '');
}

function sanitizeGenericAttribute(value) {
  // Basic escaping for unknown attributes
  return escapeHtml(value);
}

function sanitizeColorValue(value) {
  // Allow hex colors, rgb(), rgba(), hsl(), hsla(), and named colors
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/i.test(value)) return value;
  if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+)?\s*\)$/i.test(value)) return value;
  if (/^[a-z]+$/i.test(value)) return value; // Named colors
  return '';
}

function sanitizeFontFamily(value) {
  // Allow quoted and unquoted font names
  return value.replace(/[<>]/g, '');
}

function sanitizeBackgroundImage(value) {
  // Very restrictive - only allow simple gradients
  if (/^(linear|radial)-gradient\(/i.test(value)) {
    return sanitizeGenericCSSValue(value);
  }
  return '';
}

function sanitizeGenericCSSValue(value) {
  // Basic CSS value sanitization
  return value.replace(/[<>"'\\]/g, '');
}

function sanitizeDataUrl(url) {
  // Basic data URL validation
  if (!/^data:[a-z]+\/[a-z0-9\-\+]+;base64,/i.test(url)) {
    return '';
  }
  return url;
}

function containsXSSPatterns(content) {
  return XSS_PATTERNS.some(pattern => pattern.test(content));
}

function isRelativeUrl(url) {
  return URL_PROTOCOLS.RELATIVE.some(prefix => url.startsWith(prefix));
}

function getXSSPatternType(index) {
  const types = [
    'script-tag', 'iframe-tag', 'object-tag', 'embed-tag',
    'link-tag', 'meta-tag', 'javascript-protocol', 'vbscript-protocol',
    'data-html', 'event-handler', 'svg-tag', 'math-tag',
    'css-expression', 'css-import', 'javascript-url'
  ];
  return types[index] || 'unknown';
}

// Legacy compatibility exports
export {
  escapeHtml as escapeHTML,
  escapeAttribute as escapeAttr,
  sanitizeUrl as sanitizeURL
};

// Enhanced utility exports — CSP already exported above, no need to re-export

// Keep existing exports for compatibility
export function isSafeString(str) {
  if (typeof str !== 'string') return false;
  return /^[a-zA-Z0-9\s\-_.,!?()]+$/.test(str);
}

export function sanitizeComponentName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[^a-zA-Z0-9_]/g, '').replace(/^[^A-Z].*/, '');
}

export function sanitizeTagName(tagName) {
  if (typeof tagName !== 'string') return '';
  return tagName.toLowerCase().replace(/[^a-z0-9\-]/g, '');
}

export function createSafeHTML(html) {
  return {
    __html: html,
    __safe: true
  };
}

export function isSafeHTML(value) {
  return value && 
         typeof value === 'object' && 
         value.__safe === true && 
         typeof value.__html === 'string';
}

export function renderSafeContent(content) {
  if (isSafeHTML(content)) {
    return content.__html;
  }
  return escapeHtml(content);
}

export function createUrlSafeId(str) {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default {
  escapeHtml,
  escapeAttribute,
  sanitizeUrl,
  sanitizeCSSValue,
  sanitizeCSSInline,
  escapeJavaScript,
  testXSSProtection,
  CSP, 
  sanitizeAttributeByType,
  isSafeString,
  sanitizeComponentName,
  sanitizeTagName,
  createSafeHTML,
  isSafeHTML,
  renderSafeContent,
  createUrlSafeId
};