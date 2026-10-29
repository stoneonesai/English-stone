import { TOPICS } from "../data/topics.js";
import { esc } from "../ui/format.js";

export function renderTopics(ctx) {
  const counts = {};
  for (const word of ctx.state.words) counts[word.topic] = (counts[word.topic] || 0) + 1;
  const items = TOPICS.map((topic) => `
    <li>
      <button type="button" data-open-topic="${topic.id}">
        <span>${esc(topic.name)}</span>
        <span class="count">${counts[topic.id] || 0}</span>
      </button>
    </li>
  `).join("");
  return `<p>16 Themen aus der Wortliste, unabhängig vom Lernstatus.</p><ul class="index">${items}</ul>`;
}

export function bindTopics(ctx) {
  for (const button of document.querySelectorAll("[data-open-topic]")) {
    button.addEventListener("click", () => ctx.actions.openTopic(button.dataset.openTopic));
  }
}
