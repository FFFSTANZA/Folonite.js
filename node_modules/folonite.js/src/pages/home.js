// src/pages/home.js
export default function HomePage() {
  return `
    <Component name="Header" props='{"title":"Welcome to Folonite.js"}' />
    <main>
      <section style="margin-bottom: 30px;">
        <p>
          Folonite.js is a product of <strong>Folonite Labs</strong>, a division under <strong>Folonite</strong>.
          Folonite Labs is dedicated to creating innovative solutions that empower and enrich the developer ecosystem.
        </p>
        <p>
          Our tools and frameworks are not limited to just web development, but extend to the entire developer community.
          The primary goal of Folonite Labs is to build tools and frameworks that help developers build better, faster,
          and smarter projects.
        </p>
      </section>

      <section>
        <h2 style="font-size: 1.5rem; margin-bottom: 15px;">Key Features</h2>
        <ul style="list-style: disc; text-align: left; display: inline-block;">
          <li>Server-Side Rendering (SSR)</li>
          <li>Streaming Content</li>
          <li>Advanced Command-Line Interface (CLI)</li>
          <li>Component Marketplace</li>
          <li>3D Website Creation (Future Version)</li>
        </ul>
      </section>
      
      <section style="margin-top: 20px;">
        <h2 style="font-size: 1.5rem;">Check Out the Documentation</h2>
        <p>For a detailed guide and documentation, visit <a href="https://fffstanza.github.io/Folonite.js-Doc/" target="_blank">Folonite.js Documentation</a>.</p>
      </section>
    </main>
    <Component name="Footer" />
  `;
}

