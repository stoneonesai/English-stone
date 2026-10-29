import { formatShortDate } from "../lib/dates.js";
import { countStatuses, isDue, STATUS_LABEL } from "../lib/state.js";
import { esc, goalLine } from "../ui/format.js";

const ORDER = ["hard", "easy", "known", "unsure", "new"];

export function renderProgress(ctx) {
  const { state } = ctx;
  const counts = countStatuses(state.words);
  const due = state.words.filter((word) => isDue(word, ctx.today)).length;
  const segments = ORDER.map((status) => (
    counts[status] ? `<span class="seg ${status}" style="flex:${counts[status]}"></span>` : ""
  )).join("");
  const legend = ORDER.map((status) => `<li><span class="swatch ${status}"></span>${STATUS_LABEL[status]} ${counts[status]}</li>`).join("");
  const days = [
    ...state.history,
    {
      date: state.today.date,
      count: state.today.ids.length,
      goal: state.goal,
      goalMet: state.today.ids.length >= state.goal,
    },
  ];
  const recent = days.filter((day) => day.count > 0).slice(-14).reverse();
  const dayList = recent.length
    ? `<ul class="days">${recent.map((day) => `<li><span>${esc(formatShortDate(day.date))}</span><span>${day.count} von ${day.goal}${day.goalMet ? " · Ziel erreicht" : ""}</span></li>`).join("")}</ul>`
    : `<p>Noch keine Übungstage.</p>`;
  const streak = state.streak === 1 ? "1 Tag" : `${state.streak} Tage`;
  return `
    ${goalLine(state.today.ids.length, state.goal)}
    <dl class="stats">
      <div><dt>Sicher gelernt</dt><dd>${counts.known}</dd></div>
      <div><dt>Wörter gesamt</dt><dd>${state.words.length}</dd></div>
      <div><dt>Serie</dt><dd>${esc(streak)}</dd></div>
      <div><dt>Heute fällig</dt><dd>${due}</dd></div>
    </dl>
    <section class="block">
      <h2>Lernstatus</h2>
      <div class="dist" aria-hidden="true">${segments}</div>
      <ul class="legend">${legend}</ul>
    </section>
    <section class="block">
      <h2>Letzte Übungstage</h2>
      ${dayList}
    </section>
  `;
}

export function bindProgress() {}
