export default async function LazyComponent() {
    const HeavyComponent = await import('./HeavyComponent.js');
    return HeavyComponent.default();
  }

  