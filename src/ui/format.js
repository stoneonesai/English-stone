export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function emphasize(sentence, word) {
  const base = String(word || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const text = String(sentence || "");
  if (!base || !text) return esc(text);
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(escaped, "i"));
  if (!match || match.index === undefined) return esc(text);
  const start = match.index;
  return `${esc(text.slice(0, start))}<strong>${esc(match[0])}</strong>${esc(text.slice(start + match[0].length))}`;
}

export function meter(current, goal) {
  const safeGoal = goal > 0 ? goal : 1;
  const pct = Math.max(0, Math.min(100, Math.round((current / safeGoal) * 100)));
  return `<div class="meter" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
}

export function goalLine(current, goal) {
  const met = current >= goal;
  return `<p class="goal"><strong>${current}</strong> von ${goal} heute</p>${meter(current, goal)}${met ? '<p class="meta">Tagesziel erreicht.</p>' : ""}`;
}
