// src/components/Header.js
export default function Header(props) {
  return `
    <header>
      <h1>${props.title || 'Default Title'}</h1>
    </header>
  `;
}
