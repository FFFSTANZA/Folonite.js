// src/pages/home.js
export default function HomePage() {
  return `
    <Component name="Header" props='{"title":"Welcome to Folonite.js"}' />
    <main>
      
      <!-- Introduction Section -->
      <section>
        <p>
          <strong>Folonite.js</strong> is a product of <strong>Folonite Labs</strong>, a division under <strong>Folonite</strong>.
          Folonite Labs is committed to creating innovative solutions that empower and enrich the developer ecosystem.
        </p>
        <p>
          Our tools and frameworks extend beyond web development to cater to the entire developer community. 
          <strong>Build better, faster, and smarter projects</strong> with Folonite Labs!
        </p>
      </section>

      <!-- Key Features Section -->
      <section>
        <h2>Key Features</h2>
        <ul>
          <li>Dynamic Server-Side Rendering (SSR)</li>
          <li>Streaming Content</li>
          <li>Hot Reloading (Development Mode)</li>
          <li>Component-Based Architecture</li>
          <li>Built-in External Component Marketplace</li>
          <li>Advanced CLI (Command-Line Interface)</li>
          <li>Auto Dependency Management</li>
          <li>API Handling with JSON Parsing and Authentication</li>
          <li>Backend Integration with Express</li>
        </ul>
      </section>
      
      <!-- Documentation Section -->
      <section>
        <h2>Documentation</h2>
        <p>
          Explore our detailed guide and learn more about Folonite.js by visiting our 
          <a href="https://fffstanza.github.io/Folonite.js-Doc/" target="_blank">Documentation</a>.
        </p>
      </section>

      <!-- Contribute Section -->
      <section>
        <h2>Contribute</h2>
        <p>
          We welcome contributions from the developer community. Email us at 
          <a href="mailto:docs@folonite.in">docs@folonite.in</a>
          to contribute, report issues, or suggest new features.
        </p>
        <p>
          Stay updated with the latest news and developments about Folonite.js and take part in shaping its future.
        </p>
      </section>

      <!-- Visit Folonite Section -->
      <section>
        <h2>Visit Folonite</h2>
        <p>
          Learn more about Folonite and explore our other offerings at 
          <a href="https://www.folonite.in" target="_blank">www.folonite.in</a>.
        </p>
      </section>

    </main>
    <Component name="Footer" props='{}'/>
  `;
}
