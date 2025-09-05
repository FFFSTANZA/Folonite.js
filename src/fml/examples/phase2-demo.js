// src/fml/examples/phase2-demo.js
// Complete FML Phase 2 Demo & Integration Guide

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { processFML, getFMLFeatures, benchmarkFML } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;

// Phase 2 Demo Data
const demoData = {
  user: {
    isAuthenticated: true,
    isPremium: false,
    name: 'Alice Developer',
    email: 'alice@example.com',
    status: 'online',
    awayDuration: '5 minutes',
    lastSeen: '2 hours ago',
    points: 850,
    notifications: [
      { id: 1, message: 'New task assigned', read: false, timestamp: Date.now() - 3600000 },
      { id: 2, message: 'Code review approved', read: true, timestamp: Date.now() - 7200000 }
    ],
    profile: {
      firstName: 'Alice',
      lastName: 'Developer',
      joinDate: '2024-01-15',
      address: {
        street: '456 Code Street',
        city: 'Tech City',
        state: 'CA',
        zip: '94107',
        country: 'USA'
      },
      preferences: ['email', 'push', 'dark-mode', 'notifications']
    }
  },
  tasks: [
    { 
      id: 1, 
      title: 'Implement FML Phase 2', 
      description: 'Add control flow and advanced expressions',
      completed: true, 
      priority: 'high',
      category: 'development',
      assignee: 'Alice',
      dueDate: '2024-12-01'
    },
    { 
      id: 2, 
      title: 'Write comprehensive tests', 
      description: 'Cover all Phase 2 features',
      completed: false, 
      priority: 'high',
      category: 'testing',
      assignee: 'Bob',
      dueDate: '2024-12-15'
    },
    { 
      id: 3, 
      title: 'Update documentation', 
      description: 'Document new Phase 2 features',
      completed: false, 
      priority: 'medium',
      category: 'documentation',
      assignee: 'Charlie',
      dueDate: '2024-12-20'
    },
    { 
      id: 4, 
      title: 'Performance optimization', 
      description: 'Optimize rendering performance',
      completed: false, 
      priority: 'low',
      category: 'performance',
      assignee: 'Alice',
      dueDate: '2024-12-30'
    }
  ],
  counter: 42,
  inputValue: 'Hello FML Phase 2!',
  isLoading: false,
  hasError: false,
  isDevelopment: true,
  renderTime: new Date().toISOString(),
  lastUpdate: Date.now(),

  // Computed properties for demo
  get taskCategories() {
    const categories = {};
    this.tasks.forEach(task => {
      categories[task.category] = (categories[task.category] || 0) + 1;
    });
    return categories;
  },

  get priorityStats() {
    const stats = {};
    this.tasks.forEach(task => {
      if (!stats[task.priority]) {
        stats[task.priority] = { total: 0, completed: 0, priority: task.priority };
      }
      stats[task.priority].total++;
      if (task.completed) stats[task.priority].completed++;
    });

    // Add colors
    Object.values(stats).forEach(stat => {
      switch (stat.priority) {
        case 'high': stat.color = '#ef4444'; break;
        case 'medium': stat.color = '#f59e0b'; break;
        case 'low': stat.color = '#22c55e'; break;
        default: stat.color = '#6b7280';
      }
    });

    return Object.values(stats);
  },

  get filteredItems() {
    return this.tasks.filter(task => task.completed === false);
  },

  sortOrder: 'asc',
  componentCount: 15,
  expressionCount: 32,
  loopCount: 8,
  dataItems: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` })),
  loadTime: 245,
  errorMessage: 'Failed to load data from server'
};

// Demo helper functions
const demoHelpers = {
  formatTime: (timestamp) => new Date(timestamp).toLocaleTimeString(),
  formatDate: (dateStr) => new Date(dateStr).toLocaleDateString(),
  Math: Math,
  
  // Mock actions for demo
  actions: {
    showLogin: () => 'showLogin()',
    completeTask: (id) => `completeTask(${id})`,
    deleteTask: (id) => `deleteTask(${id})`,
    createTask: () => 'createTask()',
    increment: () => 'increment()',
    decrement: () => 'decrement()',
    reset: () => 'reset()',
    handleSubmit: (e) => 'handleSubmit(e)',
    updateInput: (value) => `updateInput('${value}')`,
    clearInput: () => 'clearInput()',
    setFilter: (filter) => `setFilter('${filter}')`,
    toggleSort: () => 'toggleSort()',
    retry: () => 'retry()'
  }
};

// Enhanced demo components
const demoComponents = {
  Header: ({ title }) => `
    <header style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 40px 20px; margin-bottom: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <h1 style="margin: 0; font-size: 2.5rem; font-weight: 700;">${title || 'FML Phase 2'}</h1>
      <p style="margin: 10px 0 0 0; font-size: 1.1rem; opacity: 0.9;">Advanced Control Flow & Expressions</p>
    </header>
  `,

  Footer: ({ children }) => `
    <footer style="background: #1f2937; color: #d1d5db; padding: 40px 20px; margin-top: 40px; border-radius: 12px; text-align: center;">
      ${children || '<p>&copy; 2024 Folonite.js - FML Phase 2</p>'}
    </footer>
  `,

  Card: ({ type, children, style }) => {
    const typeStyles = {
      stat: 'border-left: 4px solid #3b82f6; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);',
      info: 'border-left: 4px solid #10b981; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);',
      data: 'border-left: 4px solid #f59e0b; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);',
      pattern: 'border-left: 4px solid #8b5cf6; background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);',
      default: 'border-left: 4px solid #6b7280; background: white;'
    };

    return `
      <div style="
        ${typeStyles[type] || typeStyles.default}
        padding: 24px; 
        margin: 16px 0; 
        border-radius: 12px; 
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); 
        border: 1px solid rgba(0, 0, 0, 0.05);
        ${style || ''}
      ">
        ${children || ''}
      </div>
    `;
  },

  Button: ({ variant = 'primary', size = 'medium', children, type, onClick }) => {
    const variants = {
      primary: 'background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none;',
      secondary: 'background: linear-gradient(135deg, #6b7280, #4b5563); color: white; border: none;',
      danger: 'background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none;',
      small: 'background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;'
    };
    
    const sizes = {
      small: 'padding: 6px 12px; font-size: 0.875rem;',
      medium: 'padding: 10px 20px; font-size: 0.95rem;',
      large: 'padding: 14px 28px; font-size: 1.1rem;'
    };

    return `
      <button 
        ${type ? `type="${type}"` : ''}
        ${onClick ? `data-onclick="${onClick}"` : ''}
        style="
          ${variants[variant] || variants.primary} 
          ${sizes[size] || sizes.medium}
          border-radius: 8px; 
          cursor: pointer; 
          font-weight: 500;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        "
        onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(0, 0, 0, 0.15)';"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.1)';"
      >
        ${children || 'Button'}
      </button>
    `;
  },

  Separator: () => `
    <hr style="border: none; height: 1px; background: linear-gradient(90deg, transparent, #e5e7eb, transparent); margin: 32px 0;">
  `,

  UserCard: ({ name, avatar, status }) => `
    <div style="
      display: flex; 
      align-items: center; 
      gap: 16px; 
      padding: 20px; 
      background: white; 
      border-radius: 12px; 
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border: 1px solid #f0f0f0;
    ">
      <img src="${avatar || 'https://i.pravatar.cc/60?u=' + encodeURIComponent(name)}" 
           alt="${name}" 
           style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 3px solid #e5e7eb;">
      <div style="flex: 1;">
        <h4 style="margin: 0 0 4px 0; color: #1f2937; font-size: 1.1rem;">${name}</h4>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="
            width: 8px; 
            height: 8px; 
            border-radius: 50%; 
            background: ${status === 'online' ? '#10b981' : status === 'away' ? '#f59e0b' : '#6b7280'};
          "></span>
          <span style="color: #6b7280; font-size: 0.9rem; text-transform: capitalize;">${status}</span>
        </div>
      </div>
    </div>
  `
};

// Routes

// Home route - Feature showcase
app.get('/', async (req, res) => {
  const features = getFMLFeatures();
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FML Phase 2 - Complete Demo</title>
      <style>
        body { 
          font-family: system-ui, sans-serif; 
          max-width: 1200px; 
          margin: 0 auto; 
          padding: 20px; 
          background: linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 100%);
          line-height: 1.6;
        }
        .feature-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
          gap: 20px; 
          margin: 20px 0; 
        }
        .card { 
          background: white; 
          padding: 24px; 
          border-radius: 12px; 
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: white; 
          text-decoration: none; 
          border-radius: 8px; 
          margin: 8px 8px 8px 0; 
          font-weight: 500;
          transition: all 0.2s ease;
        }
        .button:hover { 
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .phase2-badge {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
          margin-left: 8px;
        }
        .version-info {
          background: linear-gradient(135deg, #1f2937, #374151);
          color: white;
          padding: 20px;
          border-radius: 12px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="version-info">
        <h1>🚀 FML Phase 2 - Complete Demo Server</h1>
        <p><strong>Version:</strong> ${features.version} <span class="phase2-badge">Phase 2</span></p>
        <p>Featuring advanced control flow, expressions, and client-side capabilities!</p>
      </div>

      <div class="feature-grid">
        <div class="card">
          <h3>✨ Phase 2 Features</h3>
          <ul>
            <li>✅ Conditional Rendering (<code>&lt;If&gt;</code>, <code>&lt;Else&gt;</code>)</li>
            <li>✅ List Rendering (<code>&lt;For&gt;</code>)</li>
            <li>✅ Switch/Case Statements</li>
            <li>✅ Advanced Expressions</li>
            <li>✅ Event Handling</li>
            <li>✅ Client-side Hydration</li>
            <li>✅ Reactive Updates</li>
          </ul>
        </div>

        <div class="card">
          <h3>🎯 Demo Routes</h3>
          <a href="/conditional" class="button">Conditional Rendering</a>
          <a href="/loops" class="button">List Rendering</a>
          <a href="/switch" class="button">Switch/Case</a>
          <a href="/expressions" class="button">Advanced Expressions</a>
          <a href="/complete" class="button">Complete Example</a>
          <a href="/benchmark" class="button">Performance Test</a>
        </div>

        <div class="card">
          <h3>🔧 Developer Tools</h3>
          <a href="/features" class="button">Feature Detection</a>
          <a href="/test" class="button">Run Tests</a>
          <a href="/debug" class="button">Debug Mode</a>
        </div>

        <div class="card">
          <h3>📚 Integration</h3>
          <p>To integrate FML Phase 2 in your Folonite.js project:</p>
          <ol>
            <li>Copy all Phase 2 files to your project</li>
            <li>Update your renderPage.js imports</li>
            <li>Create .fml files with Phase 2 features</li>
            <li>Enjoy advanced templating!</li>
          </ol>
        </div>
      </div>

      <div class="card">
        <h3>🚀 Quick Start</h3>
        <pre><code>import { processFML } from './src/fml/index.js';

const fml = \`
  &lt;If condition={user.isLoggedIn}&gt;
    &lt;h1&gt;Welcome, {user.name}!&lt;/h1&gt;
    &lt;For each={tasks} as="task"&gt;
      &lt;p&gt;{task.title}&lt;/p&gt;
    &lt;/For&gt;
  &lt;Else&gt;
    &lt;p&gt;Please log in&lt;/p&gt;
  &lt;/Else&gt;
  &lt;/If&gt;
\`;

const html = await processFML(fml, {
  props: { user, tasks },
  components: myComponents,
  phase2: true
});</code></pre>
      </div>
    </body>
    </html>
  `);
});

// Conditional rendering demo
app.get('/conditional', async (req, res) => {
  const fml = `
    <div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: system-ui, sans-serif;">
      <Header title="Conditional Rendering Demo" />
      
      <Card type="info">
        <h3>🎯 If/Else Conditions</h3>
        
        <If condition={user.isAuthenticated}>
          <div style="color: #22c55e; margin: 16px 0;">
            ✅ User is authenticated: <strong>{user.name}</strong>
          </div>
          
          <If condition={user.isPremium}>
            <div style="background: #fbbf24; color: #000; padding: 8px 12px; border-radius: 6px; display: inline-block;">
              ⭐ Premium Account
            </div>
          <Else>
            <div style="color: #6b7280;">
              Regular account - <a href="/upgrade">Upgrade to Premium</a>
            </div>
          </Else>
          </If>
          
        <Else>
          <div style="color: #ef4444; margin: 16px 0;">
            ❌ Please log in to continue
          </div>
        </Else>
        </If>
        
        <Separator />
        
        <h4>User Status Check:</h4>
        <If condition={user.status === 'online'}>
          <span style="color: #22c55e;">🟢 Online</span>
        <ElseIf condition={user.status === 'away'}>
          <span style="color: #f59e0b;">🟡 Away</span>
        <ElseIf condition={user.status === 'busy'}>
          <span style="color: #ef4444;">🔴 Busy</span>
        <Else>
          <span style="color: #6b7280;">⚫ Offline</span>
        </Else>
        </If>
        
      </Card>
      
      <Footer />
    </div>
  `;

  const html = await processFML(fml, {
    mode: 'server',
    props: { ...demoData, ...demoHelpers },
    components: demoComponents,
    phase2: true,
    debug: true
  });

  res.send(html);
});

// List rendering demo
app.get('/loops', async (req, res) => {
  const fml = `
    <div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: system-ui, sans-serif;">
      <Header title="List Rendering Demo" />
      
      <Card type="data">
        <h3>🔄 For Loop Examples</h3>
        
        <h4>Task List ({tasks.length} items):</h4>
        <For each={tasks} as="task" index="i">
          <div style="
            padding: 12px; 
            margin: 8px 0; 
            border: 1px solid #e5e7eb; 
            border-radius: 8px; 
            background: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <div>
              <strong>#{i + 1}: {task.title}</strong>
              <div style="font-size: 14px; color: #6b7280;">{task.description}</div>
              <div style="font-size: 12px; color: #9ca3af;">
                Priority: {task.priority} | Category: {task.category}
              </div>
            </div>
            <div style="text-align: right;">
              <If condition={task.completed}>
                <span style="color: #22c55e; font-weight: bold;">✅ Done</span>
              <Else>
                <span style="color: #f59e0b; font-weight: bold;">⏳ Pending</span>
              </Else>
              </If>
            </div>
          </div>
        </For>
        
        <Separator />
        
        <h4>Nested Loop - Categories:</h4>
        <For each={Object.entries(taskCategories)} as="categoryEntry">
          <div style="margin: 12px 0;">
            <h5 style="margin: 0; text-transform: capitalize;">{categoryEntry[0]} ({categoryEntry[1]})</h5>
            <div style="margin-left: 16px;">
              <For each={tasks.filter(t => t.category === categoryEntry[0])} as="task">
                <div style="font-size: 14px; color: #6b7280; margin: 4px 0;">
                  • {task.title} 
                  <If condition={task.completed}>
                    <span style="color: #22c55e;">✓</span>
                  </If>
                </div>
              </For>
            </div>
          </div>
        </For>
        
      </Card>
      
      <Footer />
    </div>
  `;

  const html = await processFML(fml, {
    mode: 'server',
    props: { ...demoData, ...demoHelpers },
    components: demoComponents,
    phase2: true,
    debug: true
  });

  res.send(html);
});

// Switch/Case demo
app.get('/switch', async (req, res) => {
  const fml = `
    <div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: system-ui, sans-serif;">
      <Header title="Switch/Case Demo" />
      
      <Card type="pattern">
        <h3>🔀 Switch Statement Examples</h3>
        
        <h4>User Status:</h4>
        <div style="padding: 16px; border-radius: 8px; background: #f9fafb; margin: 16px 0;">
          <Switch value={user.status}>
            <Case value="online">
              <div style="color: #22c55e; display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; background: #22c55e; border-radius: 50%;"></span>
                <strong>Online</strong> - Available for messages
              </div>
            </Case>
            <Case value="away">
              <div style="color: #f59e0b; display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; background: #f59e0b; border-radius: 50%;"></span>
                <strong>Away</strong> - Back in {user.awayDuration}
              </div>
            </Case>
            <Case value="busy">
              <div style="color: #ef4444; display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; background: #ef4444; border-radius: 50%;"></span>
                <strong>Busy</strong> - Do not disturb
              </div>
            </Case>
            <Default>
              <div style="color: #6b7280; display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; background: #6b7280; border-radius: 50%;"></span>
                <strong>Offline</strong> - Last seen {user.lastSeen}
              </div>
            </Default>
          </Switch>
        </div>
        
        <Separator />
        
        <h4>Task Priority Handling:</h4>
        <For each={tasks} as="task">
          <div style="margin: 8px 0; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb;">
            <strong>{task.title}</strong>
            <div style="margin-top: 8px;">
              <Switch value={task.priority}>
                <Case value="high">
                  <span style="background: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                    🔴 HIGH PRIORITY
                  </span>
                </Case>
                <Case value="medium">
                  <span style="background: #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                    🟡 MEDIUM
                  </span>
                </Case>
                <Case value="low">
                  <span style="background: #dcfce7; color: #16a34a; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                    🟢 LOW
                  </span>
                </Case>
                <Default>
                  <span style="background: #f3f4f6; color: #6b7280; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                    ⚪ UNKNOWN
                  </span>
                </Default>
              </Switch>
            </div>
          </div>
        </For>
        
      </Card>
      
      <Footer />
    </div>
  `;

  const html = await processFML(fml, {
    mode: 'server',
    props: { ...demoData, ...demoHelpers },
    components: demoComponents,
    phase2: true,
    debug: true
  });

  res.send(html);
});

// Advanced expressions demo
app.get('/expressions', async (req, res) => {
  const fml = `
    <div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: system-ui, sans-serif;">
      <Header title="Advanced Expressions Demo" />
      
      <Card type="stat">
        <h3>⚡ Expression Examples</h3>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          
          <div>
            <h4>🧮 Math Operations:</h4>
            <ul style="font-family: monospace; background: #f8fafc; padding: 16px; border-radius: 6px;">
              <li>2 + 3 = <strong>{2 + 3}</strong></li>
              <li>10 * 4 = <strong>{10 * 4}</strong></li>
              <li>100 / 3 = <strong>{Math.round(100 / 3 * 100) / 100}</strong></li>
              <li>2^8 = <strong>{Math.pow(2, 8)}</strong></li>
            </ul>
          </div>
          
          <div>
            <h4>🔍 Comparisons:</h4>
            <ul style="font-family: monospace; background: #f8fafc; padding: 16px; border-radius: 6px;">
              <li>user.points > 500 = <strong>{user.points > 500}</strong></li>
              <li>tasks.length >= 3 = <strong>{tasks.length >= 3}</strong></li>
              <li>user.status === 'online' = <strong>{user.status === 'online'}</strong></li>
              <li>user.isPremium || user.points > 1000 = <strong>{user.isPremium || user.points > 1000}</strong></li>
            </ul>
          </div>
          
        </div>
        
        <Separator />
        
        <h4>🎯 Ternary Operators:</h4>
        <div style="background: #f8fafc; padding: 16px; border-radius: 6px; margin: 12px 0;">
          <div>User Level: <strong>{user.points > 1000 ? 'Expert' : user.points > 100 ? 'Intermediate' : 'Beginner'}</strong></div>
          <div>Account Type: <strong>{user.isPremium ? 'Premium 🌟' : 'Free'}</strong></div>
          <div>Task Status: <strong>{tasks.filter(t => t.completed).length === tasks.length ? 'All Complete! 🎉' : 'In Progress'}</strong></div>
          <div>Availability: <strong>{user.status === 'online' ? '🟢 Available' : user.status === 'away' ? '🟡 Away' : '🔴 Busy'}</strong></div>
        </div>
        
        <Separator />
        
        <h4>📊 Array Methods:</h4>
        <div style="background: #f8fafc; padding: 16px; border-radius: 6px;">
          <div>Total Tasks: <strong>{tasks.length}</strong></div>
          <div>Completed: <strong>{tasks.filter(t => t.completed).length}</strong></div>
          <div>Progress: <strong>{Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)}%</strong></div>
          <div>High Priority: <strong>{tasks.filter(t => t.priority === 'high').length}</strong></div>
          <div>Categories: <strong>{Object.keys(taskCategories).join(', ')}</strong></div>
        </div>
        
        <Separator />
        
        <h4>🔗 String Operations:</h4>
        <div style="background: #f8fafc; padding: 16px; border-radius: 6px;">
          <div>Full Name: <strong>{user.profile.firstName + ' ' + user.profile.lastName}</strong></div>
          <div>Initials: <strong>{user.profile.firstName[0] + user.profile.lastName[0]}</strong></div>
          <div>Email Domain: <strong>{user.email.split('@')[1]}</strong></div>
          <div>Preferences: <strong>{user.profile.preferences.join(' • ')}</strong></div>
        </div>
        
      </Card>
      
      <Footer />
    </div>
  `;

  const html = await processFML(fml, {
    mode: 'server',
    props: { ...demoData, ...demoHelpers },
    components: demoComponents,
    phase2: true,
    debug: true
  });

  res.send(html);
});

// Complete example - load from file if available
app.get('/complete', async (req, res) => {
  try {
    // Try to load the advanced example file
    const examplePath = path.resolve('./src/pages/advanced.fml');
    let fmlContent;
    
    if (fs.existsSync(examplePath)) {
      fmlContent = fs.readFileSync(examplePath, 'utf-8');
    } else {
      // Fallback to embedded example
      fmlContent = `
        <div style="max-width: 1200px; margin: 0 auto; padding: 20px; font-family: system-ui, sans-serif;">
          <Header title="Complete FML Phase 2 Example" />
          
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 30px;">
            
            <!-- Main Content -->
            <div>
              <!-- Welcome Section -->
              <Card type="info">
                <If condition={user.isAuthenticated}>
                  <h3>Welcome back, {user.name}! 👋</h3>
                  <p>You have <strong>{user.notifications.filter(n => !n.read).length}</strong> unread notifications.</p>
                  
                  <If condition={user.isPremium}>
                    <div style="background: #fbbf24; color: #000; padding: 8px 12px; border-radius: 6px; display: inline-block; margin-top: 8px;">
                      ⭐ Premium Member
                    </div>
                  <Else>
                    <Button variant="primary">Upgrade to Premium</Button>
                  </Else>
                  </If>
                  
                <Else>
                  <h3>Welcome to FML Phase 2!</h3>
                  <p>Please log in to access your personalized dashboard.</p>
                  <Button variant="primary">Sign In</Button>
                </Else>
                </If>
              </Card>
              
              <!-- Task Management -->
              <Card type="data">
                <h3>📋 Task Management</h3>
                
                <If condition={tasks.length > 0}>
                  <div style="margin-bottom: 16px;">
                    <strong>Progress:</strong> {tasks.filter(t => t.completed).length}/{tasks.length} completed 
                    ({Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)}%)
                  </div>
                  
                  <div style="background: #f3f4f6; border-radius: 8px; height: 8px; margin: 12px 0;">
                    <div style="
                      background: linear-gradient(90deg, #22c55e, #16a34a);
                      height: 100%;
                      border-radius: 8px;
                      width: {(tasks.filter(t => t.completed).length / tasks.length) * 100}%;
                      transition: width 0.5s ease;
                    "></div>
                  </div>
                  
                  <For each={tasks} as="task" index="i">
                    <div style="
                      padding: 16px;
                      margin: 8px 0;
                      border: 1px solid #e5e7eb;
                      border-radius: 8px;
                      background: white;
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                    ">
                      <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                          <span style="
                            width: 24px;
                            height: 24px;
                            border-radius: 4px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 14px;
                            {task.completed ? 'background: #dcfce7; color: #16a34a;' : 'background: #fef3c7; color: #d97706;'}
                          ">
                            {task.completed ? '✓' : '○'}
                          </span>
                          
                          <div>
                            <strong style="{task.completed ? 'text-decoration: line-through; color: #6b7280;' : ''}">{task.title}</strong>
                            <div style="font-size: 14px; color: #6b7280;">{task.description}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div style="text-align: right;">
                        <Switch value={task.priority}>
                          <Case value="high">
                            <span style="background: #fecaca; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-size: 12px;">HIGH</span>
                          </Case>
                          <Case value="medium">
                            <span style="background: #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 4px; font-size: 12px;">MED</span>
                          </Case>
                          <Case value="low">
                            <span style="background: #dcfce7; color: #16a34a; padding: 4px 8px; border-radius: 4px; font-size: 12px;">LOW</span>
                          </Case>
                        </Switch>
                      </div>
                    </div>
                  </For>
                  
                <Else>
                  <div style="text-align: center; padding: 40px; color: #6b7280;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
                    <p>No tasks yet! Create your first task to get started.</p>
                    <Button variant="primary">Add Task</Button>
                  </div>
                </Else>
                </If>
              </Card>
            </div>
            
            <!-- Sidebar -->
            <div>
              <!-- User Status -->
              <Card type="stat">
                <h4>👤 User Status</h4>
                <UserCard name={user.name} avatar="" status={user.status} />
                
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                  <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span>Points:</span>
                    <strong>{user.points}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span>Level:</span>
                    <strong>{user.points > 1000 ? 'Expert' : user.points > 100 ? 'Intermediate' : 'Beginner'}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span>Member since:</span>
                    <strong>{formatDate(user.profile.joinDate)}</strong>
                  </div>
                </div>
              </Card>
              
              <!-- Quick Stats -->
              <Card type="pattern">
                <h4>📊 Quick Stats</h4>
                
                <For each={priorityStats} as="stat">
                  <div style="margin: 12px 0;">
                    <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
                      <span style="text-transform: capitalize;">{stat.priority}:</span>
                      <span>{stat.completed}/{stat.total}</span>
                    </div>
                    <div style="background: #f3f4f6; border-radius: 4px; height: 6px; overflow: hidden;">
                      <div style="
                        height: 100%;
                        background: {stat.color};
                        width: {stat.total > 0 ? (stat.completed / stat.total) * 100 : 0}%;
                        transition: width 0.3s ease;
                      "></div>
                    </div>
                  </div>
                </For>
                
                <Separator />
                
                <div style="text-align: center;">
                  <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">
                    {Math.round((tasks.filter(t => t.completed).length / (tasks.length || 1)) * 100)}%
                  </div>
                  <div style="font-size: 12px; color: #6b7280;">Overall Progress</div>
                </div>
              </Card>
            </div>
            
          </div>
          
          <Footer>
            <div style="text-align: center;">
              <p>🎉 FML Phase 2 Complete Demo</p>
              <p style="font-size: 14px; color: #9ca3af;">
                Rendered at {formatTime(renderTime)} • 
                {tasks.length} tasks • 
                {componentCount} components • 
                {expressionCount} expressions
              </p>
            </div>
          </Footer>
          
        </div>
      `;
    }

    const html = await processFML(fmlContent, {
      mode: 'server',
      props: { ...demoData, ...demoHelpers },
      components: demoComponents,
      phase2: true,
      debug: true
    });

    res.send(html);

  } catch (error) {
    res.status(500).send(`
      <div style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">❌ Complete Example Error</h1>
        <p><strong>Error:</strong> ${error.message}</p>
        <p>This might happen if the advanced.fml file is not found or contains errors.</p>
        <a href="/" style="color: #3b82f6;">← Back to Home</a>
      </div>
    `);
  }
});

// Performance benchmark
app.get('/benchmark', async (req, res) => {
  try {
    const testFML = `
      <div>
        <For each={items} as="item">
          <div>
            <If condition={item.id % 2 === 0}>
              <Switch value={item.type}>
                <Case value="A">Type A: {item.name}</Case>
                <Case value="B">Type B: {item.name}</Case>
                <Default>Default: {item.name}</Default>
              </Switch>
            <Else>
              <p>Odd item: {item.name}</p>
            </Else>
            </If>
          </div>
        </For>
      </div>
    `;

    const benchmarkData = {
      items: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        type: ['A', 'B', 'C'][i % 3]
      }))
    };

    const results = await benchmarkFML(testFML, benchmarkData, demoComponents, 50);
    
    res.json({
      title: 'FML Phase 2 Benchmark Results',
      testData: {
        items: benchmarkData.items.length,
        components: Object.keys(demoComponents).length,
        features: ['If/Else', 'For loops', 'Switch/Case', 'Complex expressions']
      },
      results,
      analysis: {
        serverPerformance: results.server.opsPerSecond > 100 ? 'Excellent' : 
                          results.server.opsPerSecond > 50 ? 'Good' : 'Needs optimization',
        recommendation: results.server.average < 20 ? 
                       'Performance is excellent for production use' :
                       'Consider optimizing for better performance'
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Benchmark failed',
      message: error.message
    });
  }
});

// Feature detection
app.get('/features', (req, res) => {
  const features = getFMLFeatures();
  res.json(features);
});

// Debug endpoint
app.get('/debug', async (req, res) => {
  const debugFML = `
    <div style="font-family: system-ui; padding: 20px;">
      <h1>🔧 FML Debug Mode</h1>
      
      <h3>Expression Debug:</h3>
      <p>User authenticated: {user.isAuthenticated}</p>
      <p>Math test: {2 + 2}</p>
      <p>String test: {'Hello ' + 'World'}</p>
      
      <h3>Conditional Debug:</h3>
      <If condition={true}>
        <p style="color: green;">✅ True condition works</p>
      </If>
      
      <If condition={false}>
        <p style="color: red;">❌ This should not show</p>
      <Else>
        <p style="color: green;">✅ False condition with else works</p>
      </Else>
      </If>
      
      <h3>Loop Debug:</h3>
      <For each={[1, 2, 3]} as="num">
        <p>Number: {num}</p>
      </For>
      
      <h3>Switch Debug:</h3>
      <Switch value="test">
        <Case value="test">
          <p style="color: green;">✅ Switch/Case works</p>
        </Case>
        <Default>
          <p style="color: red;">❌ This should not show</p>
        </Default>
      </Switch>
    </div>
  `;

  const html = await processFML(debugFML, {
    mode: 'server',
    props: { ...demoData, ...demoHelpers },
    components: demoComponents,
    phase2: true,
    debug: true
  });

  res.send(html);
});

// Test runner endpoint
app.get('/test', async (req, res) => {
  try {
    // Import and run Phase 2 tests
    const { runPhase2Tests } = await import('./test-phase2.js');
    
    // Capture console output
    const originalLog = console.log;
    const originalError = console.error;
    const logs = [];
    
    console.log = (...args) => logs.push(`LOG: ${args.join(' ')}`);
    console.error = (...args) => logs.push(`ERROR: ${args.join(' ')}`);
    
    const success = await runPhase2Tests();
    
    // Restore console
    console.log = originalLog;
    console.error = originalError;
    
    res.json({
      success,
      logs,
      message: success ? 'All tests passed!' : 'Some tests failed',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <div style="font-family: system-ui; padding: 40px; text-align: center; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #dc2626;">404 - Page Not Found</h1>
      <p>The requested page <code>${req.url}</code> was not found.</p>
      <a href="/" style="color: #3b82f6; text-decoration: none; padding: 12px 24px; border: 2px solid #3b82f6; border-radius: 8px; display: inline-block; margin-top: 20px;">
        🏠 Back to Home
      </a>
    </div>
  `);
});

// Start server
async function startServer() {
  app.listen(PORT, () => {
    const features = getFMLFeatures();
    
    console.log('\n🚀 FML Phase 2 Demo Server Started!');
    console.log(`📍 Visit: http://localhost:${PORT}`);
    console.log(`🔥 Version: ${features.version}`);
    console.log('\n📚 Available routes:');
    console.log(`   🏠 http://localhost:${PORT}/           - Feature Overview`);
    console.log(`   🎯 http://localhost:${PORT}/conditional - Conditional Rendering`);
    console.log(`   🔄 http://localhost:${PORT}/loops      - List Rendering`);
    console.log(`   🔀 http://localhost:${PORT}/switch     - Switch/Case`);
    console.log(`   ⚡ http://localhost:${PORT}/expressions - Advanced Expressions`);
    console.log(`   🎨 http://localhost:${PORT}/complete   - Complete Example`);
    console.log(`   📊 http://localhost:${PORT}/benchmark  - Performance Test`);
    console.log(`   🔧 http://localhost:${PORT}/debug      - Debug Mode`);
    console.log(`   🧪 http://localhost:${PORT}/test       - Run Tests`);
    console.log(`   📋 http://localhost:${PORT}/features   - Feature Detection`);
    
    console.log('\n✨ Phase 2 Features Available:');
    console.log('   ✅ Conditional Rendering (<If>, <Else>, <ElseIf>)');
    console.log('   ✅ List Rendering (<For>)');
    console.log('   ✅ Switch/Case Statements');
    console.log('   ✅ Advanced Expressions (math, comparisons, ternary)');
    console.log('   ✅ Client-side Hydration');
    console.log('   ✅ Event Handling');
    console.log('   ✅ Reactive Updates');
    console.log('\n🎉 FML Phase 2 is ready for production!\n');
  });
}

startServer().catch(console.error);

export { demoData, demoHelpers, demoComponents };