// src/fml/utils/escape.js

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;'
};

/**
 * Escape HTML entities in a string
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') {
    return String(text || '');
  }
  
  return text.replace(/[&<>"'\/]/g, char => HTML_ESCAPE_MAP[char]);
}

/**
 * Escape HTML attributes
 * More permissive than text content escaping
 * @param {string} attr - Attribute value to escape
 * @returns {string} Escaped attribute value
 */
export function escapeAttribute(attr) {
  if (typeof attr !== 'string') {
    return String(attr || '');
  }
  
  return attr.replace(/["&]/g, char => HTML_ESCAPE_MAP[char]);
}

/**
 * Check if a string is safe (contains only alphanumeric and safe chars)
 * @param {string} str - String to check
 * @returns {boolean} True if safe
 */
export function isSafeString(str) {
  if (typeof str !== 'string') return false;
  return /^[a-zA-Z0-9\s\-_.,!?()]+$/.test(str);
}

/**
 * Sanitize component name (must be valid identifier)
 * @param {string} name - Component name to sanitize
 * @returns {string} Sanitized name
 */
export function sanitizeComponentName(name) {
  if (typeof name !== 'string') return '';
  
  // Must start with uppercase letter and contain only valid identifier chars
  return name.replace(/[^a-zA-Z0-9_]/g, '').replace(/^[^A-Z].*/, '');
}

/**
 * Sanitize HTML tag name
 * @param {string} tagName - Tag name to sanitize
 * @returns {string} Sanitized tag name
 */
export function sanitizeTagName(tagName) {
  if (typeof tagName !== 'string') return '';
  
  // Only allow valid HTML tag characters
  return tagName.toLowerCase().replace(/[^a-z0-9\-]/g, '');
}

/**
 * Escape JavaScript string for use in inline scripts
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeJavaScript(str) {
  if (typeof str !== 'string') {
    return JSON.stringify(str);
  }
  
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Create a safe HTML string (bypasses escaping)
 * Use with extreme caution and only with trusted content
 * @param {string} html - HTML content
 * @returns {object} Safe HTML object
 */
export function createSafeHTML(html) {
  return {
    __html: html,
    __safe: true
  };
}

/**
 * Check if value is a safe HTML object
 * @param {any} value - Value to check
 * @returns {boolean} True if safe HTML object
 */
export function isSafeHTML(value) {
  return value && 
         typeof value === 'object' && 
         value.__safe === true && 
         typeof value.__html === 'string';
}

/**
 * Render safe HTML or escape regular content
 * @param {any} content - Content to render
 * @returns {string} Rendered content
 */
export function renderSafeContent(content) {
  if (isSafeHTML(content)) {
    return content.__html;
  }
  
  return escapeHtml(content);
}

/**
 * Validate and sanitize CSS property value
 * Basic protection against CSS injection
 * @param {string} property - CSS property name
 * @param {string} value - CSS property value
 * @returns {string} Sanitized value or empty string
 */
export function sanitizeCSSValue(property, value) {
  if (typeof value !== 'string') return '';
  
  // Block dangerous CSS values
  const dangerousPatterns = [
    /javascript:/i,
    /expression\(/i,
    /url\([^)]*javascript:/i,
    /import/i,
    /@import/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(value)) {
      return '';
    }
  }
  
  return value;
}

/**
 * Create a URL-safe identifier
 * @param {string} str - String to convert
 * @returns {string} URL-safe identifier
 */
export function createUrlSafeId(str) {
  if (typeof str !== 'string') return '';
  
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}