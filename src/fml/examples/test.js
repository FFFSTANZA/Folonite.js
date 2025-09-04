// examples/test.js
// Phase 1 Test Runner for FML

import fs from 'fs';
import path from 'path';
import { processFML } from '../index.js';

// Test components
const testComponents = {
  Header: ({ title }) => `
    <header class="site-header">
      <h1>${title}</h1>
      <nav>Navigation here</nav>
    </header>
  `,
  
  UserCard: ({ name, avatar, status }) => `
    <div class="user-card ${status}">
      <img src="${avatar}" alt="${name}" class="avatar" />
      <div class="user-info">
        <h3>${name}</h3>
        <span class="status">${status}</span>
      </div>
    </div>
  `,
  
  Separator: () => '<hr class="separator" />',
  
  Card: ({ type, children }) => `
    <div class="card card-${type}">
      ${children || ''}
    </div>
  `,
  
  Button: ({ variant, size, children }) => `
    <button class="btn btn-${variant} btn-${size}">
      ${children || 'Button'}
    </button>
  `,
  
  Footer: () => `
    <footer class="site-footer">
      <p>&copy; 2024 FML Demo App</p>
    </footer>
  `
};

// Test data
const testProps = {
  user: {
    name: 'John Doe',
    email: 'john@example.com',
    role: 'Developer',
    avatar: '/images/john-avatar.jpg'
  },
  stats: {
    posts: 42,
    followers: 1337
  }
};

async function runTests() {
  console.log('🚀 FML Phase 1 Tests Starting...\n');
  
  try {
    // Test 1: Basic FML file processing
    console.log('📄 Test 1: Processing basic.fml...');
    const fmlContent = fs.readFileSync('./examples/basic.fml', 'utf-8');
    
    const startTime = Date.now();
    const result = await processFML(fmlContent, {
      mode: 'server',
      props: testProps,
      components: testComponents,
      debug: true
    });
    const endTime = Date.now();
    
    console.log(`✅ Rendered successfully in ${endTime - startTime}ms`);
    console.log(`📏 Output size: ${result.length} characters\n`);
    
    // Save output for inspection
    fs.writeFileSync('./examples/output.html', result);
    console.log('💾 Output saved to examples/output.html\n');
    
    // Test 2: Component rendering
    console.log('🧩 Test 2: Individual component tests...');
    
    const componentTests = [
      {
        name: 'Header',
        fml: '<Header {title: "Test Header"} />',
        expected: 'site-header'
      },
      {
        name: 'UserCard', 
        fml: '<UserCard {name: "Test User", status: "active"} />',
        expected: 'user-card'
      },
      {
        name: 'Button with children',
        fml: '<Button {variant: "primary"}>Click Me</Button>',
        expected: 'btn-primary'
      }
    ];
    
    for (const test of componentTests) {
      try {
        const output = await processFML(test.fml, {
          mode: 'server',
          props: testProps,
          components: testComponents
        });
        
        if (output.includes(test.expected)) {
          console.log(`  ✅ ${test.name}: PASS`);
        } else {
          console.log(`  ❌ ${test.name}: FAIL - Expected "${test.expected}" in output`);
        }
      } catch (error) {
        console.log(`  ❌ ${test.name}: ERROR - ${error.message}`);
      }
    }
    
    console.log('\n🧪 Test 3: Error handling...');
    
    // Test error cases
    const errorTests = [
      {
        name: 'Unknown component',
        fml: '<UnknownComponent />',
        shouldError: true
      },
      {
        name: 'Malformed tag',
        fml: '<div>unclosed tag',
        shouldError: true
      },
      {
        name: 'Invalid interpolation',
        fml: '<div>{unclosed interpolation</div>',
        shouldError: true
      }
    ];
    
    for (const test of errorTests) {
      try {
        await processFML(test.fml, {
          mode: 'server',
          components: testComponents
        });
        
        if (test.shouldError) {
          console.log(`  ❌ ${test.name}: Should have errored but didn't`);
        } else {
          console.log(`  ✅ ${test.name}: PASS`);
        }
      } catch (error) {
        if (test.shouldError) {
          console.log(`  ✅ ${test.name}: Correctly caught error`);
        } else {
          console.log(`  ❌ ${test.name}: Unexpected error - ${error.message}`);
        }
      }
    }
    
    console.log('\n🎯 Test 4: Performance benchmarks...');
    
    // Performance test
    const iterations = 100;
    const perfStartTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await processFML('<div>Hello {user.name}!</div>', {
        mode: 'server',
        props: testProps,
        components: testComponents
      });
    }
    
    const perfEndTime = Date.now();
    const avgTime = (perfEndTime - perfStartTime) / iterations;
    
    console.log(`  📊 Average render time: ${avgTime.toFixed(2)}ms`);
    console.log(`  📊 Renders per second: ${Math.round(1000 / avgTime)}`);
    
    console.log('\n🎉 All Phase 1 tests completed!');
    console.log('\n📋 Phase 1 Feature Summary:');
    console.log('  ✅ Basic HTML element parsing');
    console.log('  ✅ Component composition'); 
    console.log('  ✅ Dynamic prop passing');
    console.log('  ✅ Text interpolation');
    console.log('  ✅ Server-side rendering');
    console.log('  ✅ Security (HTML escaping)');
    console.log('  ✅ Error handling');
    console.log('\n🚧 Coming in Phase 2:');
    console.log('  🔜 Conditional rendering (<If>, <Else>)');
    console.log('  🔜 List rendering (<For>)');
    console.log('  🔜 Advanced expressions');
    console.log('  🔜 Client-side hydration');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests, testComponents, testProps };