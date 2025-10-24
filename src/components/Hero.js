// components/Hero.js
// Hero component for landing page header

export default function Hero({ title, subtitle, ctaText }) {
  return `
    <section class="hero">
      <div class="hero-content">
        <h1 class="hero-title">${title || 'Welcome'}</h1>
        <p class="hero-subtitle">${subtitle || 'Discover amazing things'}</p>
        <button class="hero-cta">${ctaText || 'Get Started'}</button>
      </div>
      <div class="hero-decoration">
        <div class="decoration-circle circle-1"></div>
        <div class="decoration-circle circle-2"></div>
        <div class="decoration-circle circle-3"></div>
      </div>
    </section>
  `;
}