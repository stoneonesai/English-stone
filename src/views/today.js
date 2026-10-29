import { TOPICS, topicName } from "../data/topics.js";
import { formatLongDate } from "../lib/dates.js";
import { countStatuses, isDue, STATUS_LABEL } from "../lib/state.js";
import { emphasize, esc, goalLine } from "../ui/format.js";

const CARD_STATUSES = ["hard", "easy", "known", "unsure"];

function cardHtml(word, open, place, total) {
  if (!open) {
    return `
      <button type="button" class="flash" id="flash-card">
        <p class="meta">Karte ${place} von ${total}</p>
        <p class="prompt" lang="en">${esc(word.en)}</p>
        <p class="hint">Tippen, um die Bedeutung zu sehen.</p>
      </button>
    `;
  }
  const marks = CARD_STATUSES.map((status, index) => `
    <button type="button" class="option" data-rate="${status}"><span class="key">${index + 1}</span><span>${STATUS_LABEL[status]}</span></button>
  `).join("");
  return `
    <article class="flash open">
      <p class="meta">Karte ${place} von ${total}</p>
      <p class="prompt" lang="en">${esc(word.en)}</p>
      <p class="meaning" lang="de">${esc(word.de)}</p>
      <p class="meta">${esc(topicName(word.topic))}</p>
      ${word.exampleEn ? `<p class="example" lang="en">${emphasize(word.exampleEn, word.en)}</p>` : ""}
      ${word.exampleDe ? `<p class="example de" lang="de">${esc(word.exampleDe)}</p>` : ""}
    </article>
    <p class="hint">Wie gut kennst du das Wort?</p>
    <div class="options">${marks}</div>
  `;
}

export function renderToday(ctx) {
  const { state, ui, today } = ctx;
  const counts = countStatuses(state.words);
  const due = state.words.filter((word) => isDue(word, today)).length;
  const options = ['<option value="">Alle Themen</option>']
    .concat(TOPICS.map((topic) => `<option value="${topic.id}"${ui.todayTopic === topic.id ? " selected" : ""}>${esc(topic.name)}</option>`))
    .join("");
  const streak = state.streak === 1 ? "Serie: 1 Tag" : state.streak > 1 ? `Serie: ${state.streak} Tage` : "Serie: noch keine";
  const deck = state.deck;
  let cards = `<p>Für heute ist gerade kein Wort vorbereitet.</p>`;
  if (deck && deck.ids.length) {
    if (deck.index >= deck.ids.length) {
      cards = `
        <h2>Karten geschafft</h2>
        <p>Die Wörter für heute sind eingeordnet. Als Nächstes kommen die Übungen.</p>
        <button type="button" class="primary" id="start-practice">Übungen starten</button>
      `;
    } else {
      const word = state.words.find((item) => item.id === deck.ids[deck.index]);
      cards = word
        ? cardHtml(word, ui.cardOpen, deck.index + 1, deck.ids.length)
        : `<p>Diese Karte ist nicht mehr in der Liste.</p><button type="button" class="primary" id="skip-card">Weiter</button>`;
    }
  }
  return `
    <p class="date">${esc(formatLongDate())}</p>
    ${goalLine(state.today.ids.length, state.goal)}
    <p class="streak">${streak}</p>
    <label>Thema
      <select id="today-topic">${options}</select>
    </label>
    ${cards}
    <section class="block">
      <h2>Kurzüberblick</h2>
      <dl class="stats">
        <div><dt>Schwierig</dt><dd>${counts.hard}</dd></div>
        <div><dt>Leicht</dt><dd>${counts.easy}</dd></div>
        <div><dt>Sicher gelernt</dt><dd>${counts.known}</dd></div>
        <div><dt>Unsicher</dt><dd>${counts.unsure}</dd></div>
        <div><dt>Neu</dt><dd>${counts.new}</dd></div>
        <div><dt>Wörter</dt><dd>${state.words.length}</dd></div>
      </dl>
      <p class="meta">${due === 0 ? "Heute ist nichts zur Wiederholung fällig." : `${due} Wörter sind zur Wiederholung fällig.`}</p>
    </section>
  `;
}

export function bindToday(ctx) {
  document.getElementById("today-topic")?.addEventListener("change", (event) => {
    ctx.actions.changeTodayTopic(event.target.value);
  });
  document.getElementById("flash-card")?.addEventListener("click", () => ctx.actions.revealCard());
  document.getElementById("start-practice")?.addEventListener("click", () => ctx.actions.startPractice());
  document.getElementById("skip-card")?.addEventListener("click", () => ctx.actions.skipCard());
  for (const button of document.querySelectorAll("[data-rate]")) {
    button.addEventListener("click", () => ctx.actions.rateCard(button.dataset.rate));
  }
}
