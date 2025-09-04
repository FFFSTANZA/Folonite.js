// src/fml/parser/validator.js
// FML Validation Engine - Phase 1

import { NodeType } from './parser.js';

/**
 * Validates FML AST for common errors and best practices
 */
export class FMLValidator {
  constructor(options = {}) {
    this.strict = options.strict || false;
    this.warnings = [];
    this.errors = [];
    this.debug = options.debug || false;
  }

  // Main validation method
  validate(ast, components = {}) {
    this.warnings = [];
    this.errors = [];
    this.components = components;
    
    this.validateNode(ast);
    
    if (this.debug) {
      console.log('Validation Results:', {
        errors: this.errors,
        warnings: this.warnings
      });
    }
    
    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  // Validate individual node
  validateNode(node, parent = null) {
    if (!node) return;

    switch (node.type) {
      case NodeType.DOCUMENT:
        this.validateDocument(node);
        break;
      
      case NodeType.ELEMENT:
        this.validateElement(node, parent);
        break;
      
      case NodeType.COMPONENT:
        this.validateComponent(node, parent);
        break;
      
      case NodeType.TEXT:
        this.validateText(node, parent);
        break;
      
      case NodeType.INTERPOLATION:
        this.validateInterpolation(node, parent);
        break;
      
      case NodeType.ATTRIBUTE:
        this.validateAttribute(node, parent);
        break;
    }

    // Validate children
    if (node.children) {
      node.children.forEach(child => this.validateNode(child, node));
    }
  }

  // Validate document root
  validateDocument(node) {
    if (!node.children || node.children.length === 0) {
      this.addWarning('Empty document', node);
    }

    // Check for multiple root elements (should be wrapped)
    const elementChildren = node.children.filter(
      child => child.type === NodeType.ELEMENT || child.type === NodeType.COMPONENT
    );

    if (elementChildren.length > 1) {
      this.addWarning(
        'Multiple root elements detected. Consider wrapping in a container element.',
        node
      );
    }
  }

  // Validate HTML element
  validateElement(node, parent) {
    const { tagName, attributes, children } = node;

    // Validate tag name
    if (!this.isValidTagName(tagName)) {
      this.addError(`Invalid HTML tag name: "${tagName}"`, node);
    }

    // Validate nesting rules
    this.validateNestingRules(tagName, parent);

    // Validate self-closing tags don't have children
    if (this.isSelfClosingTag(tagName) && children.length > 0) {
      this.addError(`Self-closing tag "${tagName}" cannot have children`, node);
    }

    // Validate attributes
    if (attributes) {
      attributes.forEach(attr => this.validateNode(attr, node));
    }

    // Element-specific validations
    this.validateElementSpecific(node);
  }

  // Validate component
  validateComponent(node, parent) {
    const { name, props } = node;

    // Check if component exists
    if (!this.components[name]) {
      this.addError(`Component "${name}" is not registered`, node);
    }

    // Validate component name
    if (!this.isValidComponentName(name)) {
      this.addError(`Invalid component name: "${name}". Must start with uppercase letter.`, node);
    }

    // Validate props
    if (props) {
      props.forEach(prop => this.validateNode(prop, node));
    }

    // Component-specific validations
    this.validateComponentSpecific(node);
  }

  // Validate text node
  validateText(node, parent) {
    const { content } = node;

    // Check for potentially dangerous content
    if (content.includes('<script')) {
      this.addError('Script tags in text content are not allowed', node);
    }

    // Whitespace-only text warnings
    if (parent && parent.type === NodeType.ELEMENT && 
        /^\s+$/.test(content) && content.length > 10) {
      this.addWarning('Large whitespace-only text node detected', node);
    }
  }

  // Validate interpolation
  validateInterpolation(node, parent) {
    const { expression } = node;

    // Basic expression validation
    if (!expression || expression.trim() === '') {
      this.addError('Empty interpolation expression', node);
      return;
    }

    // Check for potentially dangerous expressions
    const dangerousPatterns = [
      /eval\(/i,
      /function\(/i,
      /=>/,
      /\bdelete\b/i,
      /\bwindow\b/i,
      /\bdocument\b/i,
      /\bprocess\b/i
    ];

    dangerousPatterns.forEach(pattern => {
      if (pattern.test(expression)) {
        this.addError(`Potentially unsafe expression: "${expression}"`, node);
      }
    });

    // Validate property access syntax
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(expression.trim()) &&
        !/^["'].*["']$/.test(expression.trim()) &&
        !/^-?\d+(\.\d+)?$/.test(expression.trim()) &&
        !/^(true|false)$/.test(expression.trim())) {
      this.addWarning(`Complex expression detected: "${expression}". Consider simplifying.`, node);
    }
  }

  // Validate attribute
  validateAttribute(node, parent) {
    const { name, value, dynamic } = node;

    // Validate attribute name
    if (!this.isValidAttributeName(name)) {
      this.addError(`Invalid attribute name: "${name}"`, node);
    }

    // HTML-specific attribute validations
    if (parent && parent.type === NodeType.ELEMENT) {
      this.validateHtmlAttribute(name, value, parent.tagName, node);
    }

    // Dynamic attribute validation
    if (dynamic && typeof value === 'string') {
      // Basic validation for dynamic attribute expressions
      if (value.includes('javascript:')) {
        this.addError(`Potential XSS in attribute "${name}": javascript: protocol detected`, node);
      }
    }
  }

  // Validate HTML-specific attributes
  validateHtmlAttribute(attrName, value, tagName, node) {
    // Required attributes
    const requiredAttrs = {
      'img': ['src', 'alt'],
      'a': ['href'],
      'input': ['type'],
      'label': ['for'],
      'form': ['action']
    };

    // Validate img alt attribute
    if (tagName === 'img' && attrName === 'alt' && !value) {
      this.addWarning('img elements should have meaningful alt text for accessibility', node);
    }

    // Validate href attributes
    if (attrName === 'href' && typeof value === 'string') {
      if (value.startsWith('javascript:')) {
        this.addError('javascript: protocol in href is not allowed', node);
      }
    }

    // Validate class vs className
    if (attrName === 'className') {
      this.addWarning('Use "class" instead of "className" in FML', node);
    }
  }

  // Element-specific validations
  validateElementSpecific(node) {
    const { tagName, children, attributes } = node;
    
    // Table structure validation
    if (tagName === 'table') {
      const hasValidStructure = children.some(child => 
        child.type === NodeType.ELEMENT && 
        ['thead', 'tbody', 'tr'].includes(child.tagName)
      );
      
      if (!hasValidStructure) {
        this.addWarning('Table should contain thead, tbody, or tr elements', node);
      }
    }

    // Form validation
    if (tagName === 'form') {
      const hasAction = attributes && attributes.some(attr => attr.name === 'action');
      if (!hasAction) {
        this.addWarning('Form elements should have an action attribute', node);
      }
    }

    // List validation
    if (['ul', 'ol'].includes(tagName)) {
      const hasListItems = children.some(child =>
        child.type === NodeType.ELEMENT && child.tagName === 'li'
      );
      
      if (!hasListItems) {
        this.addWarning(`${tagName.toUpperCase()} should contain LI elements`, node);
      }
    }
  }

  // Component-specific validations
  validateComponentSpecific(node) {
    // Reserved component names
    const reservedNames = ['If', 'For', 'Switch', 'Case', 'Default', 'Slot'];
    
    if (reservedNames.includes(node.name)) {
      this.addWarning(`"${node.name}" is a reserved component name for Phase 2`, node);
    }
  }

  // Validate HTML nesting rules
  validateNestingRules(tagName, parent) {
    if (!parent || parent.type !== NodeType.ELEMENT) return;

    const parentTag = parent.tagName;
    
    // Block elements in inline elements
    const blockElements = new Set([
      'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'table', 'form', 'section', 'article'
    ]);
    
    const inlineElements = new Set([
      'span', 'a', 'strong', 'em', 'code', 'small'
    ]);

    if (inlineElements.has(parentTag) && blockElements.has(tagName)) {
      this.addError(`Block element "${tagName}" cannot be nested inside inline element "${parentTag}"`, parent);
    }

    // Specific nesting rules
    const nestingRules = {
      'p': ['div', 'section', 'article', 'main'], // p cannot contain block elements
      'a': ['a'], // a cannot contain a
      'button': ['a', 'button'], // button cannot contain interactive elements
    };

    if (nestingRules[parentTag] && nestingRules[parentTag].includes(tagName)) {
      this.addError(`"${tagName}" cannot be nested inside "${parentTag}"`, parent);
    }
  }

  // Validation helper methods
  isValidTagName(tagName) {
    return /^[a-z][a-z0-9]*$/i.test(tagName);
  }

  isValidComponentName(name) {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
  }

  isValidAttributeName(name) {
    return /^[a-zA-Z][a-zA-Z0-9\-:]*$/.test(name);
  }

  isSelfClosingTag(tagName) {
    const selfClosingTags = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);
    
    return selfClosingTags.has(tagName.toLowerCase());
  }

  // Error and warning helpers
  addError(message, node) {
    this.errors.push({
      type: 'error',
      message,
      location: node.location,
      node: this.debug ? node : undefined
    });
  }

  addWarning(message, node) {
    this.warnings.push({
      type: 'warning', 
      message,
      location: node.location,
      node: this.debug ? node : undefined
    });
  }

  // Get validation summary
  getSummary() {
    return {
      totalErrors: this.errors.length,
      totalWarnings: this.warnings.length,
      isValid: this.errors.length === 0
    };
  }
}

// Utility function for quick validation
export function validateFML(ast, components = {}, options = {}) {
  const validator = new FMLValidator(options);
  return validator.validate(ast, components);
}