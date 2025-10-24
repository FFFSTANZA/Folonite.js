// components/SkillCard.js
// Card component for displaying skills

export default function SkillCard({ icon, title, description }) {
  return `
    <div class="skill-card">
      <div class="skill-icon">${icon || '✨'}</div>
      <h3 class="skill-title">${title || 'Skill'}</h3>
      <p class="skill-description">${description || 'Description of the skill'}</p>
    </div>
  `;
}