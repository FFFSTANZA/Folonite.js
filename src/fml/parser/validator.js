// src/fml/parser/validator.js
// Enhanced FML Validation Engine — Phase 2 Optimized (High Performance + Extensible)

import { NodeType } from './parser.js';
import { fmlDebugger } from '../utils/helpers.js';

/**
 * High-performance, extensible FML validator with deep static analysis,
 * security hardening, accessibility auditing, and performance linting.
 */
export class FMLValidator {
  constructor(options = {}) {
    // Configuration
    this.strict = options.strict || false;
    this.phase2 = options.phase2 !== false;
    this.debug = options.debug || false;

    // Rule engine configuration
    this.ruleConfig = {
      accessibility: options.accessibility !== false,
      performance: options.performance !== false,
      security: options.security !== false,
      customRules: options.customRules || [],
      ruleSeverity: {
        missingAlt: 'warning',
        insecureProtocol: 'error',
        performanceHint: 'warning',
        accessibilityViolation: 'warning',
        securityViolation: 'error',
        ...options.ruleSeverity
      },
      // Advanced: Enable/disable rules by name at runtime
      enabledRules: new Set(),
      disabledRules: new Set()
    };

    // Performance thresholds
    this.performanceThresholds = {
      maxNestingDepth: 10,
      maxChildrenCount: 100,
      maxInterpolationsPerElement: 5,
      maxComponentPropsCount: 20,
      maxExpressionLength: 100,
      ...options.performanceThresholds
    };

    // Component prop types
    this.propTypes = options.propTypes || {};

    // Precomputed sets for O(1) lookups
    this.selfClosingTags = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);

    this.blockElements = new Set([
      'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'dd', 'div',
      'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
      'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li', 'main', 'nav', 'ol',
      'p', 'pre', 'section', 'table', 'ul'
    ]);

    this.inlineElements = new Set([
      'a', 'abbr', 'acronym', 'b', 'bdo', 'big', 'br', 'button', 'cite', 'code',
      'dfn', 'em', 'i', 'img', 'input', 'kbd', 'label', 'map', 'object', 'q',
      'samp', 'script', 'select', 'small', 'span', 'strong', 'sub', 'sup',
      'textarea', 'time', 'tt', 'var'
    ]);

    this.validInputTypes = new Set([
      'text', 'password', 'email', 'number', 'tel', 'url', 'search',
      'date', 'time', 'datetime-local', 'month', 'week',
      'color', 'range', 'file', 'hidden',
      'checkbox', 'radio', 'submit', 'reset', 'button', 'image'
    ]);

    // Nesting validation rules (precompiled for speed)
    this.nestingRules = {
      p: { forbidden: ['div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'], message: 'P elements cannot contain block-level elements' },
      a: { forbidden: ['a', 'button', 'input[type="button"]', 'input[type="submit"]'], message: 'Interactive elements cannot be nested' },
      button: { forbidden: ['a', 'button', 'input', 'select', 'textarea'], message: 'Button cannot contain interactive elements' },
      label: { forbidden: ['label'], message: 'Labels cannot be nested' },
      form: { forbidden: ['form'], message: 'Forms cannot be nested' },
      table: { allowed: ['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr'], message: 'Table should only contain table-specific elements' },
      thead: { allowed: ['tr'], message: 'Thead should only contain tr elements' },
      tbody: { allowed: ['tr'], message: 'Tbody should only contain tr elements' },
      tfoot: { allowed: ['tr'], message: 'Tfoot should only contain tr elements' },
      tr: { allowed: ['td', 'th'], message: 'Tr should only contain td or th elements' },
      ul: { allowed: ['li', 'script', 'template'], message: 'Ul should only contain li elements' },
      ol: { allowed: ['li', 'script', 'template'], message: 'Ol should only contain li elements' },
      dl: { allowed: ['dt', 'dd', 'script', 'template'], message: 'Dl should only contain dt and dd elements' }
    };

    // Security-sensitive attributes
    this.securitySensitiveAttrs = new Set(['src', 'href', 'action', 'formaction', 'data']);

    // Dangerous expression patterns (pre-compiled regex for speed)
    this.dangerousExprPatterns = [
      /eval\s*\(/i,
      /function\s*\(/i,
      /constructor/i,
      /__proto__/i,
      /prototype\s*\[/i,
      /\bwindow\b/i,
      /\bdocument\b/i,
      /\bprocess\b/i,
      /require\s*\(/i,
      /import\s*\(/i
    ];

    // Dangerous HTML content patterns
    this.dangerousHtmlPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /<iframe[\s\S]*?>/gi,
      /<object[\s\S]*?>/gi,
      /<embed[\s\S]*?>/gi,
      /on\w+\s*=/gi
    ];

    // Initialize built-in rules
    this.builtinRules = [];
    this.initializeBuiltinRules();

    // Runtime state
    this.reset();
  }

  /**
   * Initializes all built-in validation rules
   * Uses lazy compilation to avoid overhead until needed.
   */
  initializeBuiltinRules() {
    const { ruleSeverity, accessibility, performance, security } = this.ruleConfig;

    this.builtinRules = [
      // === ACCESSIBILITY RULES ===
      {
        name: 'img-alt-text',
        category: 'accessibility',
        severity: ruleSeverity.missingAlt,
        description: 'Images must have non-empty alt text for screen readers',
        validate: (node, context) => {
          if (node.type === NodeType.ELEMENT && node.tagName === 'img') {
            const altAttr = this.findAttribute(node, 'alt');
            if (!altAttr || !altAttr.value || altAttr.value.trim() === '') {
              return { valid: false, message: 'img elements must have non-empty alt attribute for accessibility' };
            }
            // Warn if alt text is too long
            if (altAttr.value.length > 100) {
              this.addWarning('Alt text should be concise (under 100 characters)', node);
            }
          }
          return { valid: true };
        }
      },
      {
        name: 'form-labels',
        category: 'accessibility',
        severity: ruleSeverity.accessibilityViolation,
        description: 'Form inputs require labels, aria-label, or aria-labelledby',
        validate: (node, context) => {
          if (node.type === NodeType.ELEMENT && node.tagName === 'input') {
            const typeAttr = this.findAttribute(node, 'type');
            const type = typeAttr?.value || 'text';
            if (['text', 'email', 'password', 'number', 'tel', 'url'].includes(type)) {
              const idAttr = this.findAttribute(node, 'id');
              const ariaLabelAttr = this.findAttribute(node, 'aria-label');
              const ariaLabelledByAttr = this.findAttribute(node, 'aria-labelledby');

              if (!idAttr && !ariaLabelAttr && !ariaLabelledByAttr) {
                return {
                  valid: false,
                  message: 'Input elements must have an id (with corresponding label), aria-label, or aria-labelledby attribute'
                };
              }
            }
          }
          return { valid: true };
        }
      },
      {
        name: 'semantic-headings',
        category: 'accessibility',
        severity: 'warning',
        description: 'Heading levels must follow logical hierarchy (no skips)',
        validate: (node, context) => {
          if (node.type === NodeType.ELEMENT && /^h[1-6]$/.test(node.tagName)) {
            const level = parseInt(node.tagName[1]);
            const parentLevel = context.currentHeadingLevel || 0;

            if (level > parentLevel + 1) {
              return {
                valid: false,
                message: `Heading level ${level} follows level ${parentLevel}. Consider using h${parentLevel + 1} instead`
              };
            }
            context.currentHeadingLevel = level;
          }
          return { valid: true };
        }
      },
      {
        name: 'main-landmark',
        category: 'accessibility',
        severity: 'warning',
        description: 'Document should contain exactly one main landmark',
        validate: (node, context) => {
          if (node.type === NodeType.DOCUMENT) {
            const hasMain = this.findElementByTag(node, 'main') || this.findElementWithRole(node, 'main');
            if (!hasMain) {
              this.addWarning('Document should contain a main landmark for accessibility', node);
            }
          }
          return { valid: true };
        }
      },

      // === SECURITY RULES ===
      {
        name: 'no-javascript-protocol',
        category: 'security',
        severity: ruleSeverity.securityViolation,
        description: 'Prevents XSS via javascript: protocol in href/src',
        validate: (node, context) => {
          if (node.type === NodeType.ATTRIBUTE && this.securitySensitiveAttrs.has(node.name)) {
            const value = String(node.value || '').toLowerCase();
            if (value.startsWith('javascript:') || value.startsWith('vbscript:') || value.startsWith('data:text/html')) {
              return {
                valid: false,
                message: `Potential XSS vulnerability: dangerous protocol in ${node.name} attribute`
              };
            }
          }
          return { valid: true };
        }
      },
      {
        name: 'no-dangerous-html',
        category: 'security',
        severity: 'error',
        description: 'Blocks script tags, iframes, and event handlers in text nodes',
        validate: (node, context) => {
          if (node.type === NodeType.TEXT) {
            for (const pattern of this.dangerousHtmlPatterns) {
              if (pattern.test(node.content)) {
                return {
                  valid: false,
                  message: 'Potentially dangerous HTML content detected in text node'
                };
              }
            }
          }
          return { valid: true };
        }
      },
      {
        name: 'secure-external-links',
        category: 'security',
        severity: 'warning',
        description: 'Links with target="_blank" must include rel="noopener noreferrer"',
        validate: (node, context) => {
          if (node.type === NodeType.ELEMENT && node.tagName === 'a') {
            const hrefAttr = this.findAttribute(node, 'href');
            const targetAttr = this.findAttribute(node, 'target');
            const relAttr = this.findAttribute(node, 'rel');

            if (targetAttr?.value === '_blank' && hrefAttr) {
              const rel = relAttr?.value || '';
              if (!rel.includes('noopener') || !rel.includes('noreferrer')) {
                return {
                  valid: false,
                  message: 'Links with target="_blank" must include rel="noopener noreferrer" for security'
                };
              }
            }
          }
          return { valid: true };
        }
      },

      // === PERFORMANCE RULES ===
      {
        name: 'max-nesting-depth',
        category: 'performance',
        severity: ruleSeverity.performanceHint,
        description: 'Limits DOM nesting depth to prevent layout thrashing',
        validate: (node, context) => {
          if ((node.type === NodeType.ELEMENT || node.type === NodeType.COMPONENT) && context.nestingDepth >= this.performanceThresholds.maxNestingDepth) {
            return {
              valid: false,
              message: `Nesting depth (${context.nestingDepth}) exceeds recommended maximum (${this.performanceThresholds.maxNestingDepth})`
            };
          }
          return { valid: true };
        }
      },
      {
        name: 'max-children-count',
        category: 'performance',
        severity: 'warning',
        description: 'Warns on components with excessive direct children',
        validate: (node, context) => {
          if ((node.type === NodeType.ELEMENT || node.type === NodeType.COMPONENT) && node.children) {
            const childElementCount = node.children.filter(
              child => child.type === NodeType.ELEMENT || child.type === NodeType.COMPONENT
            ).length;

            if (childElementCount > this.performanceThresholds.maxChildrenCount) {
              return {
                valid: false,
                message: `Element has ${childElementCount} children, consider virtualization or pagination for performance`
              };
            }
          }
          return { valid: true };
        }
      },
      {
        name: 'excessive-interpolations',
        category: 'performance',
        severity: 'warning',
        description: 'Too many interpolations can cause re-render bottlenecks',
        validate: (node, context) => {
          if ((node.type === NodeType.ELEMENT || node.type === NodeType.COMPONENT)) {
            const interpolations = this.countInterpolationsInNode(node);
            if (interpolations > this.performanceThresholds.maxInterpolationsPerElement) {
              return {
                valid: false,
                message: `Element contains ${interpolations} interpolations, consider consolidating for better performance`
              };
            }
          }
          return { valid: true };
        }
      },
      {
        name: 'complex-expression',
        category: 'performance',
        severity: 'warning',
        description: 'Long expressions impact parsing and reactivity',
        validate: (node, context) => {
          if (node.type === NodeType.INTERPOLATION || 
              (node.type === NodeType.ATTRIBUTE && node.dynamic)) {
            const expr = node.expression || String(node.value || '');
            if (expr.length > this.performanceThresholds.maxExpressionLength) {
              return {
                valid: false,
                message: `Expression exceeds length limit (${expr.length}/${this.performanceThresholds.maxExpressionLength}). Simplify for performance.`
              };
            }
          }
          return { valid: true };
        }
      },
      {
        name: 'large-inline-styles',
        category: 'performance',
        severity: 'warning',
        description: 'Inline styles over 200 chars hurt rendering performance',
        validate: (node, context) => {
          if (node.type === NodeType.ATTRIBUTE && node.name === 'style' && node.value && typeof node.value === 'string' && node.value.length > 200) {
            return {
              valid: false,
              message: 'Large inline styles may impact performance. Prefer CSS classes.'
            };
          }
          return { valid: true };
        }
      }
    ];
  }

  /**
   * Resets validator state before each validation run
   */
  reset() {
    this.errors = [];
    this.warnings = [];
    this.components = {};
    this.context = {
      nestingDepth: 0,
      currentHeadingLevel: 0,
      visitedComponents: new Set(),
      formElements: [],
      linkTargets: new Map(), // Track href + target + rel
      totalNodes: 0,
      maxNestingDepth: 0
    };
  }

  /**
   * Main entry point: validates entire AST
   * @param {Object} ast - Root AST node
   * @param {Object} components - Registered component definitions
   * @returns {Object} Validation result with errors, warnings, summary
   */
  validate(ast, components = {}) {
    this.reset();
    this.components = components;

    // Pre-process enabled/disabled rules
    this._prepareRuleFilter();

    // Start performance timer if debug mode
    const startTime = this.debug ? performance.now() : null;

    // Validate AST recursively
    this.validateNode(ast, null, this.context);

    // Post-validation checks (non-recursive)
    this.runPostValidationChecks(this.context);

    // Debug output
    if (this.debug) {
      const duration = performance.now() - startTime;
      fmlDebugger.info('Validation completed', {
        errors: this.errors.length,
        warnings: this.warnings.length,
        rulesEvaluated: this.builtinRules.length + this.ruleConfig.customRules.length,
        duration: `${duration.toFixed(2)}ms`,
        nodesProcessed: this.context.totalNodes
      });
    }

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: this.getSummary()
    };
  }

  /**
   * Prepares rule filtering for optimal performance during traversal
   * Avoids repeated category checks per node
   */
  _prepareRuleFilter() {
    const { accessibility, performance, security, enabledRules, disabledRules } = this.ruleConfig;

    // If no explicit enable/disable, use categories
    if (enabledRules.size === 0 && disabledRules.size === 0) {
      this.filteredRules = this.builtinRules.filter(rule => {
        if (disabledRules.has(rule.name)) return false;
        if (enabledRules.size > 0 && !enabledRules.has(rule.name)) return false;
        if (rule.category === 'accessibility' && !accessibility) return false;
        if (rule.category === 'performance' && !performance) return false;
        if (rule.category === 'security' && !security) return false;
        return true;
      });
    } else {
      // Explicit rule list override
      this.filteredRules = this.builtinRules.filter(rule => {
        if (disabledRules.has(rule.name)) return false;
        if (enabledRules.size > 0 && !enabledRules.has(rule.name)) return false;
        return true;
      });
    }

    // Add custom rules
    this.filteredRules.push(...this.ruleConfig.customRules.filter(rule => {
      if (disabledRules.has(rule.name)) return false;
      if (enabledRules.size > 0 && !enabledRules.has(rule.name)) return false;
      return true;
    }));
  }

  /**
   * Validates a single AST node with full context
   * Uses switch-case for optimal JIT compilation
   */
  validateNode(node, parent, context) {
    if (!node) return;

    // Track total nodes processed
    context.totalNodes++;

    // Update nesting depth for element/component
    if (node.type === NodeType.ELEMENT || node.type === NodeType.COMPONENT) {
      context.nestingDepth++;
      context.maxNestingDepth = Math.max(context.maxNestingDepth, context.nestingDepth);
    }

    // Dispatch based on node type (fastest path)
    switch (node.type) {
      case NodeType.DOCUMENT:
        this.validateDocument(node, context);
        break;
      case NodeType.ELEMENT:
        this.validateElement(node, parent, context);
        break;
      case NodeType.COMPONENT:
        this.validateComponent(node, parent, context);
        break;
      case NodeType.TEXT:
        this.validateText(node, parent, context);
        break;
      case NodeType.INTERPOLATION:
        this.validateInterpolation(node, parent, context);
        break;
      case NodeType.ATTRIBUTE:
        this.validateAttribute(node, parent, context);
        break;
      case NodeType.IF:
        this.validateIfDirective(node, parent, context);
        break;
      case NodeType.FOR:
        this.validateForDirective(node, parent, context);
        break;
      case NodeType.SWITCH:
        this.validateSwitchDirective(node, parent, context);
        break;
      case NodeType.CASE:
        this.validateCaseDirective(node, parent, context);
        break;
      case NodeType.DEFAULT:
        this.validateDefaultDirective(node, parent, context);
        break;
      default:
        // Ignore unknown node types
        break;
    }

    // Run all active rules on this node
    this.runRulesForNode(node, context);

    // Recurse into children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        this.validateNode(child, node, { ...context }); // Pass copy to avoid cross-talk
      }
    }

    // Decrement depth after processing children
    if (node.type === NodeType.ELEMENT || node.type === NodeType.COMPONENT) {
      context.nestingDepth--;
    }
  }

  // =============================
  // PHASE 2 DIRECTIVES
  // =============================

  validateIfDirective(node, parent, context) {
    if (!this.phase2) {
      this.addError('If directive is only available in Phase 2', node);
      return;
    }
    if (!node.condition) {
      this.addError('If directive requires a condition', node);
      return;
    }
    this.validateExpression(node.condition, node, 'If condition');
    this.validateConditionalStructure(node, parent, context);
  }

  validateForDirective(node, parent, context) {
    if (!this.phase2) {
      this.addError('For directive is only available in Phase 2', node);
      return;
    }
    const iterable = node.items || node.each;
    const itemVar = node.itemVar || 'item';
    const indexVar = node.indexVar || 'index';

    if (!iterable) {
      this.addError('For directive requires an items/each property', node);
      return;
    }
    this.validateExpression(iterable, node, 'For items');

    if (!this.isValidVariableName(itemVar)) {
      this.addError(`Invalid item variable name: "${itemVar}"`, node);
    }
    if (!this.isValidVariableName(indexVar)) {
      this.addError(`Invalid index variable name: "${indexVar}"`, node);
    }

    // Suggest virtualization for large lists
    this.addWarning('Consider implementing virtualization for large lists in For loops', node);
  }

  validateSwitchDirective(node, parent, context) {
    if (!this.phase2) {
      this.addError('Switch directive is only available in Phase 2', node);
      return;
    }
    if (!node.value) {
      this.addError('Switch directive requires a value property', node);
      return;
    }
    this.validateExpression(node.value, node, 'Switch value');

    const cases = node.children?.filter(c => c.type === NodeType.CASE || c.type === NodeType.DEFAULT) || [];
    if (cases.length === 0) {
      this.addWarning('Switch should contain at least one Case or Default', node);
    }
    const defaults = cases.filter(c => c.type === NodeType.DEFAULT);
    if (defaults.length > 1) {
      this.addError('Switch can only have one Default case', node);
    }
  }

  validateCaseDirective(node, parent, context) {
    if (!this.phase2) {
      this.addError('Case directive is only available in Phase 2', node);
      return;
    }
    if (!parent || parent.type !== NodeType.SWITCH) {
      this.addError('Case directive must be inside a Switch directive', node);
      return;
    }
    if (!node.value) {
      this.addError('Case directive requires a value property', node);
    }
  }

  validateDefaultDirective(node, parent, context) {
    if (!this.phase2) {
      this.addError('Default directive is only available in Phase 2', node);
      return;
    }
    if (!parent || parent.type !== NodeType.SWITCH) {
      this.addError('Default directive must be inside a Switch directive', node);
      return;
    }
  }

  // =============================
  // COMPONENT VALIDATION
  // =============================

  validateComponent(node, parent, context) {
    const { name, props } = node;

    // Component registration check
    if (!this.components[name]) {
      this.addError(`Component "${name}" is not registered`, node);
      return;
    }

    // Name format
    if (!this.isValidComponentName(name)) {
      this.addError(`Invalid component name: "${name}". Must start with uppercase letter.`, node);
    }

    // Circular reference detection
    if (context.visitedComponents.has(name)) {
      this.addError(`Circular component reference detected: ${name}`, node);
      return;
    }

    // Prop type validation
    if (props && this.propTypes[name]) {
      this.validateComponentProps(node, this.propTypes[name]);
    }

    // Performance: Too many props?
    if (props && props.length > this.performanceThresholds.maxComponentPropsCount) {
      this.addWarning(
        `Component "${name}" has ${props.length} props. Consider consolidation.`,
        node
      );
    }

    // Reserved names
    const reservedNames = ['If', 'Else', 'ElseIf', 'For', 'Switch', 'Case', 'Default', 'Slot'];
    if (reservedNames.includes(name)) {
      if (!this.phase2) {
        this.addError(`"${name}" is a reserved component name for Phase 2`, node);
      }
    }

    // Conflict with HTML tags
    const htmlTags = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'button'];
    if (htmlTags.some(tag => tag.toLowerCase() === name.toLowerCase())) {
      this.addWarning(`Component name "${name}" conflicts with HTML tag`, node);
    }

    // Complexity warning
    if (node.children && node.children.length > 20) {
      this.addWarning(`Component "${name}" has many children. Consider breaking down.`, node);
    }

    // Track visited for circularity
    const newContext = { ...context };
    newContext.visitedComponents = new Set(context.visitedComponents);
    newContext.visitedComponents.add(name);

    // Component-specific validations
    this.validateComponentSpecific(node, newContext);
  }

  validateComponentProps(node, propTypeSchema) {
    const { name, props = [] } = node;

    // Required props
    if (propTypeSchema.required) {
      for (const requiredProp of propTypeSchema.required) {
        const hasProp = props.some(p => p.name === requiredProp);
        if (!hasProp) {
          this.addError(`Component "${name}" is missing required prop: "${requiredProp}"`, node);
        }
      }
    }

    // Type validation
    if (propTypeSchema.types) {
      for (const prop of props) {
        const expectedType = propTypeSchema.types[prop.name];
        if (expectedType && !this.validatePropType(prop, expectedType)) {
          this.addError(
            `Component "${name}" prop "${prop.name}" should be of type ${expectedType}`,
            node
          );
        }
      }
    }

    // Strict mode: unknown props
    if (propTypeSchema.strict && propTypeSchema.types) {
      const allowedProps = Object.keys(propTypeSchema.types);
      for (const prop of props) {
        if (!allowedProps.includes(prop.name)) {
          this.addWarning(`Component "${name}" received unknown prop: "${prop.name}"`, node);
        }
      }
    }
  }

  validatePropType(prop, expectedType) {
    if (!prop.dynamic) {
      const value = prop.value;
      switch (expectedType) {
        case 'string': return typeof value === 'string';
        case 'number': return typeof value === 'number' || !isNaN(Number(value));
        case 'boolean': return typeof value === 'boolean' || ['true', 'false'].includes(String(value));
        case 'array': return Array.isArray(value);
        case 'object': return typeof value === 'object' && value !== null;
        case 'function': return typeof value === 'function';
        default: return true; // Unknown types pass
      }
    }
    // Dynamic props are runtime-evaluated → assume valid
    return true;
  }

  // =============================
  // EXPRESSION VALIDATION
  // =============================

  validateExpression(expression, node, context = '') {
    if (!expression || expression.trim() === '') {
      this.addError(`Empty expression in ${context}`, node);
      return false;
    }

    const expr = expression.trim();

    // Security: dangerous patterns
    for (const pattern of this.dangerousExprPatterns) {
      if (pattern.test(expr)) {
        this.addError(`Potentially unsafe expression in ${context}: "${expr}"`, node);
        return false;
      }
    }

    // Performance: overly complex expressions
    if (expr.length > this.performanceThresholds.maxExpressionLength) {
      this.addWarning(`Complex expression in ${context} may impact performance`, node);
    }

    return true;
  }

  // =============================
  // ELEMENT & ATTRIBUTE VALIDATION
  // =============================

  validateElement(node, parent, context) {
    const { tagName, attributes, children } = node;

    // Tag name validation
    if (!this.isValidTagName(tagName)) {
      this.addError(`Invalid HTML tag name: "${tagName}"`, node);
    }

    // Self-closing tag validation
    if (this.selfClosingTags.has(tagName.toLowerCase()) && children && children.length > 0) {
      this.addError(`Self-closing tag "${tagName}" cannot have children`, node);
    }

    // Nesting rules
    this.validateNestingRules(tagName, parent, context);

    // Attribute validation
    if (attributes) {
      for (const attr of attributes) {
        this.validateNode(attr, node, context);
      }
    }

    // Element-specific validations
    this.validateElementSpecific(node, context);
  }

  validateText(node, parent, context) {
    const { content } = node;

    // Security: dangerous HTML in text
    if (this.ruleConfig.security) {
      for (const pattern of this.dangerousHtmlPatterns) {
        if (pattern.test(content)) {
          this.addError('Potentially dangerous content in text node', node);
          return;
        }
      }
    }

    // Performance: large whitespace nodes
    if (parent && parent.type === NodeType.ELEMENT && /^\s+$/.test(content) && content.length > 50) {
      this.addWarning('Large whitespace-only text node may affect performance', node);
    }
  }

  validateInterpolation(node, parent, context) {
    this.validateExpression(node.expression, node, 'interpolation');
  }

  validateAttribute(node, parent, context) {
    const { name, value, dynamic } = node;

    // Attribute name validation
    if (!this.isValidAttributeName(name)) {
      this.addError(`Invalid attribute name: "${name}"`, node);
    }

    // HTML-specific validations
    if (parent && parent.type === NodeType.ELEMENT) {
      this.validateHtmlAttribute(name, value, parent.tagName, node, context);
    }

    // Dynamic expressions
    if (dynamic && typeof value === 'string') {
      this.validateExpression(value, node, `attribute ${name}`);
    }
  }

  validateHtmlAttribute(attrName, value, tagName, node, context) {
    // Security: dangerous protocols
    if (this.ruleConfig.security && this.securitySensitiveAttrs.has(attrName)) {
      const strValue = String(value || '').toLowerCase();
      if (strValue.startsWith('javascript:') || strValue.startsWith('vbscript:') || strValue.startsWith('data:text/html')) {
        this.addError(`Security violation: dangerous protocol in ${attrName} attribute`, node);
      }
    }

    // Accessibility
    if (this.ruleConfig.accessibility) {
      if (tagName === 'img' && attrName === 'alt') {
        if (!value || String(value).trim() === '') {
          this.addWarning('Images should have meaningful alt text for accessibility', node);
        }
      }
      if (tagName === 'a' && attrName === 'href' && value === '#') {
        this.addWarning('Links with href="#" should have proper keyboard interaction', node);
      }
      if (tagName === 'button' && attrName === 'type' && !value) {
        this.addWarning('Button elements should have an explicit type attribute', node);
      }
    }

    // Performance
    if (this.ruleConfig.performance && attrName === 'style' && value && String(value).length > 200) {
      this.addWarning('Large inline styles may impact performance, consider using CSS classes', node);
    }

    // HTML5 validation
    if (tagName === 'input' && attrName === 'type') {
      if (!this.validInputTypes.has(String(value).toLowerCase())) {
        this.addWarning(`Unknown input type: "${value}"`, node);
      }
    }

    // JSX compatibility
    if (attrName === 'className') {
      this.addWarning('Use "class" instead of "className" in FML', node);
    }
    if (attrName === 'htmlFor') {
      this.addWarning('Use "for" instead of "htmlFor" in FML', node);
    }
  }

  validateElementSpecific(node, context) {
    const { tagName, children, attributes } = node;

    // Table structure
    if (tagName === 'table') {
      const hasCaption = children.some(c => c.type === NodeType.ELEMENT && c.tagName === 'caption');
      const hasValidStructure = children.some(c =>
        c.type === NodeType.ELEMENT &&
        ['thead', 'tbody', 'tfoot', 'tr'].includes(c.tagName)
      );

      if (!hasValidStructure) {
        this.addWarning('Table should contain thead, tbody, tfoot, or tr elements', node);
      }
      if (this.ruleConfig.accessibility && !hasCaption) {
        this.addWarning('Tables should have a caption for accessibility', node);
      }
    }

    // Form validation
    if (tagName === 'form') {
      const hasAction = this.findAttribute(node, 'action');
      const hasMethod = this.findAttribute(node, 'method');
      if (!hasAction) {
        this.addWarning('Form elements should have an action attribute', node);
      }
      if (!hasMethod) {
        this.addWarning('Form elements should specify a method (GET or POST)', node);
      }

      const inputs = this.findElementsByTag(node, 'input');
      const hasRequiredFields = inputs.some(input => this.findAttribute(input, 'required'));
      if (hasRequiredFields && this.ruleConfig.accessibility) {
        this.addWarning('Forms with required fields should indicate required fields clearly', node);
      }
    }

    // List validation
    if (['ul', 'ol'].includes(tagName)) {
      const listItems = children.filter(c => c.type === NodeType.ELEMENT && c.tagName === 'li');
      const nonListItems = children.filter(c => c.type === NodeType.ELEMENT && c.tagName !== 'li');

      if (listItems.length === 0) {
        this.addWarning(`${tagName.toUpperCase()} should contain LI elements`, node);
      }
      if (nonListItems.length > 0) {
        this.addWarning(`${tagName.toUpperCase()} should only contain LI elements as direct children`, node);
      }
    }

    // Video/Audio
    if (['video', 'audio'].includes(tagName)) {
      if (this.ruleConfig.accessibility) {
        const hasControls = this.findAttribute(node, 'controls');
        const hasAutoplay = this.findAttribute(node, 'autoplay');
        if (!hasControls) {
          this.addWarning(`${tagName} elements should have controls for accessibility`, node);
        }
        if (hasAutoplay) {
          this.addWarning(`${tagName} with autoplay can be disruptive for users`, node);
        }
      }
    }

    // Iframe
    if (tagName === 'iframe') {
      const hasSandbox = this.findAttribute(node, 'sandbox');
      const hasTitle = this.findAttribute(node, 'title');
      if (this.ruleConfig.security && !hasSandbox) {
        this.addWarning('iframe elements should use sandbox attribute for security', node);
      }
      if (this.ruleConfig.accessibility && !hasTitle) {
        this.addWarning('iframe elements should have a title for accessibility', node);
      }
    }

    // Meta tags
    if (tagName === 'meta') {
      const name = this.findAttribute(node, 'name')?.value;
      const property = this.findAttribute(node, 'property')?.value;
      const content = this.findAttribute(node, 'content')?.value;
      if ((name || property) && !content) {
        this.addWarning('Meta tags should have content attribute', node);
      }
      if (name === 'viewport' && content) {
        const contentStr = String(content);
        if (!contentStr.includes('width=device-width')) {
          this.addWarning('Viewport meta tag should include width=device-width for responsive design', node);
        }
      }
    }
  }

  validateComponentSpecific(node, context) {
    // Reserved names already handled above
    // No-op here for clarity
  }

  validateNestingRules(tagName, parent, context) {
    if (!parent || parent.type !== NodeType.ELEMENT) return;

    const parentTag = parent.tagName;

    // Block-inside-inline violation
    if (this.inlineElements.has(parentTag) && this.blockElements.has(tagName)) {
      this.addError(`Block element "${tagName}" cannot be nested inside inline element "${parentTag}"`, parent);
      return;
    }

    // Specific nesting rules
    const rule = this.nestingRules[parentTag];
    if (rule) {
      if (rule.forbidden && rule.forbidden.includes(tagName)) {
        this.addError(`${rule.message}: "${tagName}" in "${parentTag}"`, parent);
      }
      if (rule.allowed && !rule.allowed.includes(tagName)) {
        this.addWarning(`${rule.message}: unexpected "${tagName}" in "${parentTag}"`, parent);
      }
    }

    // Heading hierarchy
    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName[1]);
      this.validateHeadingHierarchy(level, context);
    }
  }

  validateHeadingHierarchy(level, context) {
    const currentLevel = context.currentHeadingLevel || 0;
    if (level > currentLevel + 1) {
      this.addWarning(
        `Heading level ${level} skips levels. Consider using h${currentLevel + 1} instead`,
        { type: 'heading-hierarchy' }
      );
    }
    context.currentHeadingLevel = level;
  }

  // =============================
  // RULE ENGINE
  // =============================

  runRulesForNode(node, context) {
    if (!this.filteredRules || this.filteredRules.length === 0) return;

    for (const rule of this.filteredRules) {
      try {
        // Skip if rule explicitly disabled
        if (this.ruleConfig.disabledRules.has(rule.name)) continue;

        const result = rule.validate(node, context);
        if (result && !result.valid) {
          const severity = rule.severity || 'warning';
          const message = result.message || `Rule violation: ${rule.name}`;

          if (severity === 'error') {
            this.addError(message, node, { rule: rule.name, category: rule.category });
          } else if (severity === 'warning') {
            this.addWarning(message, node, { rule: rule.name, category: rule.category });
          }
        }
      } catch (error) {
        if (this.debug) {
          fmlDebugger.warn(`Rule "${rule.name}" failed to execute`, { error: error.message });
        }
      }
    }
  }

  // =============================
  // POST-VALIDATION CHECKS
  // =============================

  runPostValidationChecks(context) {
    // Form accessibility: Ensure every input has a label
    // Link security: Check external links without noopener/noreferrer
    // Performance: Report nesting depth stats
    if (this.ruleConfig.performance && this.debug) {
      fmlDebugger.info('Performance Summary', {
        maxNestingDepth: context.maxNestingDepth,
        totalNodes: context.totalNodes,
        threshold: this.performanceThresholds
      });
    }
  }

  // =============================
  // UTILITY METHODS (OPTIMIZED)
  // =============================

  findAttribute(node, name) {
    if (!node.attributes) return undefined;
    for (let i = 0; i < node.attributes.length; i++) {
      if (node.attributes[i].name === name) {
        return node.attributes[i];
      }
    }
    return undefined;
  }

  countInterpolationsInNode(node) {
    let count = 0;
    const traverse = n => {
      if (n.type === NodeType.INTERPOLATION) count++;
      if (n.children) {
        for (const child of n.children) traverse(child);
      }
    };
    traverse(node);
    return count;
  }

  isValidVariableName(name) {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
  }

  isValidTagName(tagName) {
    return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/i.test(tagName);
  }

  isValidComponentName(name) {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
  }

  isValidAttributeName(name) {
    return /^[a-zA-Z][a-zA-Z0-9\-:]*$/.test(name);
  }

  isSelfClosingTag(tagName) {
    return this.selfClosingTags.has(tagName.toLowerCase());
  }

  findElementByTag(node, tagName) {
    if (node.type === NodeType.ELEMENT && node.tagName === tagName) return node;
    if (!node.children) return null;
    for (const child of node.children) {
      const found = this.findElementByTag(child, tagName);
      if (found) return found;
    }
    return null;
  }

  findElementsByTag(node, tagName) {
    const results = [];
    const search = n => {
      if (n.type === NodeType.ELEMENT && n.tagName === tagName) results.push(n);
      if (n.children) {
        for (const child of n.children) search(child);
      }
    };
    search(node);
    return results;
  }

  findElementWithRole(node, role) {
    const search = n => {
      if (n.type === NodeType.ELEMENT) {
        const roleAttr = this.findAttribute(n, 'role');
        if (roleAttr && roleAttr.value === role) return n;
      }
      if (n.children) {
        for (const child of n.children) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(node);
  }

  // =============================
  // ERROR/WARNING HANDLERS
  // =============================

  addError(message, node, metadata = {}) {
    this.errors.push({
      type: 'error',
      message,
      location: node?.location,
      node: this.debug ? node : undefined,
      metadata,
      timestamp: Date.now()
    });
    if (this.debug) {
      fmlDebugger.error(`Validation Error: ${message}`, { node, metadata });
    }
  }

  addWarning(message, node, metadata = {}) {
    this.warnings.push({
      type: 'warning',
      message,
      location: node?.location,
      node: this.debug ? node : undefined,
      metadata,
      timestamp: Date.now()
    });
    if (this.debug) {
      fmlDebugger.warn(`Validation Warning: ${message}`, { node, metadata });
    }
  }

  // =============================
  // SUMMARY & REPORTING
  // =============================

  getSummary() {
    const errorsByCategory = {};
    const warningsByCategory = {};

    this.errors.forEach(e => {
      const cat = e.metadata?.category || 'general';
      errorsByCategory[cat] = (errorsByCategory[cat] || 0) + 1;
    });

    this.warnings.forEach(w => {
      const cat = w.metadata?.category || 'general';
      warningsByCategory[cat] = (warningsByCategory[cat] || 0) + 1;
    });

    return {
      totalErrors: this.errors.length,
      totalWarnings: this.warnings.length,
      isValid: this.errors.length === 0,
      phase2Enabled: this.phase2,
      rulesEnabled: {
        accessibility: this.ruleConfig.accessibility,
        performance: this.ruleConfig.performance,
        security: this.ruleConfig.security,
        customRules: this.ruleConfig.customRules.length
      },
      errorsByCategory,
      warningsByCategory,
      topErrors: this.getTopIssues(this.errors),
      topWarnings: this.getTopIssues(this.warnings),
      context: {
        maxNestingDepth: this.context.maxNestingDepth,
        totalNodes: this.context.totalNodes
      }
    };
  }

  getTopIssues(issues, limit = 5) {
    const counts = {};
    issues.forEach(issue => {
      const rule = issue.metadata?.rule || 'unknown';
      counts[rule] = (counts[rule] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([rule, count]) => ({ rule, count }));
  }

  // =============================
  // CONFIGURATION API
  // =============================

  addCustomRule(rule) {
    if (!rule.name || typeof rule.validate !== 'function') {
      throw new Error('Custom rule must have a unique name and validate function');
    }
    this.ruleConfig.customRules.push({ ...rule, severity: rule.severity || 'warning', category: rule.category || 'custom' });
    this._prepareRuleFilter(); // Rebuild filter
  }

  setRuleSeverity(ruleName, severity) {
    if (!['error', 'warning', 'disabled'].includes(severity)) {
      throw new Error('Severity must be "error", "warning", or "disabled"');
    }
    this.ruleConfig.ruleSeverity[ruleName] = severity;
    this._prepareRuleFilter(); // Rebuild filter
  }

  enableRule(ruleName) {
    this.ruleConfig.disabledRules.delete(ruleName);
    this.ruleConfig.enabledRules.add(ruleName);
    this._prepareRuleFilter();
  }

  disableRule(ruleName) {
    this.ruleConfig.enabledRules.delete(ruleName);
    this.ruleConfig.disabledRules.add(ruleName);
    this._prepareRuleFilter();
  }

  enableCategory(category) {
    this.ruleConfig[category] = true;
    this._prepareRuleFilter();
  }

  disableCategory(category) {
    this.ruleConfig[category] = false;
    this._prepareRuleFilter();
  }

  // =============================
  // DOCUMENTATION & METADATA
  // =============================

  getRulesMetadata() {
    return {
      builtin: this.builtinRules.map(r => ({
        name: r.name,
        category: r.category,
        severity: r.severity,
        description: r.description
      })),
      custom: this.ruleConfig.customRules.map(r => ({
        name: r.name,
        category: r.category,
        severity: r.severity,
        description: r.description
      }))
    };
  }
}

// =============================
// EXPORTED UTILITIES
// =============================

export function validateFML(ast, components = {}, options = {}) {
  const validator = new FMLValidator(options);
  return validator.validate(ast, components);
}

// =============================
// PREDEFINED RULE SETS
// =============================

export const ValidationPresets = {
  strict: {
    strict: true,
    accessibility: true,
    performance: true,
    security: true,
    ruleSeverity: {
      missingAlt: 'error',
      securityViolation: 'error',
      accessibilityViolation: 'error'
    },
    performanceThresholds: {
      maxNestingDepth: 8,
      maxChildrenCount: 50,
      maxInterpolationsPerElement: 3
    }
  },
  accessible: {
    accessibility: true,
    security: true,
    ruleSeverity: {
      missingAlt: 'error',
      accessibilityViolation: 'error'
    }
  },
  performance: {
    performance: true,
    performanceThresholds: {
      maxNestingDepth: 8,
      maxChildrenCount: 50,
      maxInterpolationsPerElement: 3,
      maxExpressionLength: 75
    }
  },
  development: {
    debug: true,
    accessibility: true,
    performance: true,
    security: true
  },
  production: {
    strict: true,
    accessibility: true,
    security: true,
    debug: false
  }
};

// =============================
// FACTORY FUNCTION
// =============================

export function createValidator(preset, customOptions = {}) {
  const presetConfig = ValidationPresets[preset] || {};
  const options = { ...presetConfig, ...customOptions };
  return new FMLValidator(options);
}