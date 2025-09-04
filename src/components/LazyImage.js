export default function LazyImage({ src, alt }) {
    return `<img src="${src}" alt="${alt}" loading="lazy" />`;
  }

  