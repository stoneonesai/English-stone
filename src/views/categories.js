import { topicName } from "../data/topics.js";
import { STATUS_LABEL } from "../lib/state.js";
import { esc } from "../ui/format.js";

const ORDER = ["hard", "easy", "known", "unsure", "new"];

export function renderCategories(ctx) {
  const groups = ORDER.map((status) => {
    const words = ctx.state.words.filter((word) => word.status === status);
    const preview = words.slice(0, 8);
    const list = preview.length
      ? `<ul class="plain">${preview.map((word) => `<li><span lang="en">${esc(word.en)}</span> · <span lang="de">${esc(word.de)}</span> <span class="meta">${esc(topicName(word.topic))}</span></li>`).join("")}</ul>`
      : `<p>Keine Wörter mit diesem Status.</p>`;
    const more = words.length > preview.length ? `<p class="meta">${words.length - preview.length} weitere in der Wortliste.</p>` : "";
    return `
      <section class="block">
        <h2>${STATUS_LABEL[status]} <span class="count">${words.length}</span></h2>
        ${list}
        ${more}
        <button type="button" data-open-status="${status}">In der Wortliste öffnen</button>
      </section>
    `;
  }).join("");
  return groups;
}

export function bindCategories(ctx) {
  for (const button of document.querySelectorAll("[data-open-status]")) {
    button.addEventListener("click", () => ctx.actions.openStatus(button.dataset.openStatus));
  }
}
