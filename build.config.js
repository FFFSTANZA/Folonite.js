/**
 * Folonite.js Build Configuration
 * Filename: build.config.js
 * 
 * Customize your build process by modifying this configuration file.
 */

export default {
  // Source directories
  source: {
    root: './src',
    pages: './src/pages',
    components: './src/components',
    fml: './src/fml',
    views: './src/views',
    api: './src/api',
    public: './public'
  },

  // Output configuration
  output: {
    root: './dist',
    structure: {
      pages: 'pages',
      components: 'components',
      assets: 'assets',
      static: 'static',
      server: '.'
    }
  },

  // Build options
  build: {
    // Minification settings
    minify: {
      enabled: true,
      options: {
        compress: true,
        mangle: true,
        keep_classnames: false,
        keep_fnames: false
      }
    },

    // Source maps
    sourceMaps: {
      enabled: process.env.NODE_ENV !== 'production',
      type: 'external' // 'inline' | 'external' | 'hidden'
    },

    // Code splitting
    splitting: {
      enabled: true,
      chunks: 'async', // 'async' | 'all' | 'initial'
      maxSize: 244000 // 244kb
    },

    // Tree shaking
    treeShaking: {
      enabled: true,
      mode: 'aggressive' // 'conservative' | 'aggressive'
    },

    // Asset optimization
    assets: {
      // Hash filenames for cache busting
      hash: true,
      hashLength: 8,
      
      // Image optimization
      images: {
        enabled: true,
        quality: 85,
        formats: ['webp', 'avif'] // Additional formats to generate
      },
      
      // CSS optimization
      css: {
        minify: true,
        autoprefixer: true,
        purge: false // Remove unused CSS
      },
      
      // JavaScript optimization
      javascript: {
        minify: true,
        transpile: true,
        target: 'es2020'
      }
    },

    // Compression
    compression: {
      enabled: true,
      types: ['gzip', 'brotli'],
      level: 9, // 1-9 (9 = maximum compression)
      threshold: 1024 // Only compress files larger than 1KB
    },

    // External packages to exclude from bundling
    external: [
      'express',
      'compression',
      'fs',
      'path',
      'crypto',
      'http',
      'https'
    ],

    // Environment-specific settings
    env: {
      development: {
        minify: false,
        sourceMaps: true,
        compression: false
      },
      production: {
        minify: true,
        sourceMaps: false,
        compression: true
      }
    }
  },

  // FML-specific settings
  fml: {
    // Pre-compile FML templates
    precompile: true,
    
    // Cache compiled templates
    cache: true,
    
    // Validate FML syntax
    validate: true,
    
    // Extract inline styles/scripts
    extract: {
      styles: true,
      scripts: true
    }
  },

  // Performance budgets
  performance: {
    // Warn if bundle size exceeds these limits
    budgets: [
      {
        type: 'bundle',
        name: 'pages',
        baseline: 170000, // 170KB
        warning: 200000,  // 200KB
        error: 250000     // 250KB
      },
      {
        type: 'bundle',
        name: 'components',
        baseline: 100000,
        warning: 150000,
        error: 200000
      }
    ],
    
    // Maximum allowed initial load time (in ms)
    maxInitialLoadTime: 3000
  },

  // Server build settings
  server: {
    // Include source files
    includeSource: false,
    
    // Bundle server code
    bundle: true,
    
    // Target Node.js version
    target: 'node16',
    
    // Enable hot reload in development
    hotReload: process.env.NODE_ENV === 'development'
  },

  // Plugin system
  plugins: [
    // Add custom plugins here
    // Example: 'folonite-plugin-analytics'
  ],

  // Hooks for custom build steps
  hooks: {
    // Before build starts
    beforeBuild: async (config) => {
      // Custom pre-build logic
    },
    
    // After build completes
    afterBuild: async (stats) => {
      // Custom post-build logic
    },
    
    // On build error
    onError: async (error) => {
      // Custom error handling
    }
  },

  // Advanced options
  advanced: {
    // Parallel processing
    parallel: true,
    workers: 4, // Number of worker threads
    
    // Caching
    cache: {
      enabled: true,
      directory: '.cache/build',
      strategy: 'content' // 'content' | 'timestamp'
    },
    
    // Experimental features
    experimental: {
      swc: false, // Use SWC instead of esbuild
      turbopack: false, // Use Turbopack
      rspack: false // Use Rspack
    }
  },

  // Development server settings (for build preview)
  devServer: {
    port: 3000,
    host: 'localhost',
    https: false,
    proxy: {},
    headers: {
      'X-Powered-By': 'Folonite.js'
    }
  }
};