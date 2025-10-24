// components/ProjectCard.js

export default function ProjectCard({ title, description, tags, link }) {
  return `
    <div class="project-card">
      <div class="project-content">
        <h3 class="project-title">${title || 'Project Title'}</h3>
        <p class="project-description">${description || 'Project description goes here'}</p>
        <div class="project-tags">
          ${tags ? `<span class="tag">${tags}</span>` : ''}
        </div>
      </div>
      <div class="project-footer">
        <a href="${link || '#'}" class="project-link">View Project →</a>
      </div>
    </div>
  `;
}