import { clozeSuitable, maskWord } from "./grade.js";

const CYCLE = ["choose-de", "type-en", "choose-en", "cloze", "sentence"];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildQueue(state, topicId, today) {
  const pool = topicId ? state.words.filter((word) => word.topic === topicId) : state.words;
  const cap = Math.min(20, Math.max(state.goal, 1));
  const hard = shuffle(pool.filter((word) => word.status === "hard" || word.status === "unsure"));
  const due = shuffle(
    pool.filter(
      (word) =>
        (word.status === "easy" || word.status === "known") &&
        word.nextReview &&
        word.nextReview <= today
    )
  );
  const fresh = shuffle(pool.filter((word) => word.status === "new"));
  const picked = [];
  const seen = new Set();
  const take = (list, max) => {
    for (const word of list) {
      if (picked.length >= max) return;
      if (seen.has(word.id)) continue;
      seen.add(word.id);
      picked.push(word);
    }
  };
  take(hard, cap);
  take(due, cap);
  const helping = picked.filter((word) => !state.today.ids.includes(word.id)).length;
  const needNew = Math.max(0, state.goal - state.today.ids.length - helping);
  if (needNew > 0) take(fresh, Math.min(cap, picked.length + needNew));
  if (picked.length === 0) {
    const rest = pool
      .filter((word) => word.status !== "new")
      .sort((a, b) => String(a.lastReviewed || "").localeCompare(String(b.lastReviewed || "")));
    take(rest, Math.min(8, cap));
    if (!picked.length) take(fresh, Math.min(8, cap));
  }
  return picked;
}

export function makeOptions(word, pool, pick) {
  const correct = String(pick(word) || "").trim();
  if (!correct) return null;
  const used = new Set([correct.toLowerCase()]);
  const same = [];
  const other = [];
  for (const item of pool) {
    if (item.id === word.id) continue;
    const text = String(pick(item) || "").trim();
    if (!text || used.has(text.toLowerCase())) continue;
    (item.topic === word.topic ? same : other).push(text);
  }
  const distractors = [];
  for (const text of [...shuffle(same), ...shuffle(other)]) {
    const key = text.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    distractors.push(text);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) return null;
  return shuffle([correct, ...distractors]);
}

function typeWorks(type, word, pool) {
  if (type === "self") return true;
  if (type === "type-en") return Boolean(word.en && word.de);
  if (type === "cloze") return clozeSuitable(word.en);
  if (type === "choose-de") return Boolean(makeOptions(word, pool, (item) => item.de));
  if (type === "choose-en") return Boolean(makeOptions(word, pool, (item) => item.en));
  if (type === "sentence") {
    return Boolean(word.exampleEn && word.exampleDe && makeOptions(word, pool, (item) => item.exampleDe));
  }
  return false;
}

export function ensureDeck(state, topicId, today) {
  const topic = topicId || "";
  const deck = state.deck;
  if (deck && deck.date === today && (deck.topic || "") === topic && Array.isArray(deck.ids)) {
    const ids = deck.ids.filter((id) => state.words.some((word) => word.id === id));
    if (ids.length !== deck.ids.length) {
      const kept = new Set(ids);
      const lostBefore = deck.ids.slice(0, deck.index || 0).filter((id) => !kept.has(id)).length;
      deck.ids = ids;
      deck.index = Math.max(0, Math.min((deck.index || 0) - lostBefore, ids.length));
    }
    return deck;
  }
  const words = buildQueue(state, topic, today);
  state.deck = { date: today, topic, ids: words.map((word) => word.id), index: 0 };
  return state.deck;
}

export function makeTasksFromWords(state, words) {
  const pool = state.words;
  let cursor = Math.floor(Math.random() * CYCLE.length);
  return words.map((word) => {
    let type = CYCLE[cursor % CYCLE.length];
    cursor += 1;
    let guard = 0;
    while (guard < CYCLE.length && !typeWorks(type, word, pool)) {
      type = CYCLE[cursor % CYCLE.length];
      cursor += 1;
      guard += 1;
    }
    if (!typeWorks(type, word, pool)) type = "self";
    const task = { wordId: word.id, type, answer: word.en };
    if (type === "cloze") task.mask = maskWord(word.en).mask;
    if (type === "choose-de") {
      task.answer = word.de.trim();
      task.options = makeOptions(word, pool, (item) => item.de);
    }
    if (type === "choose-en") {
      task.answer = word.en.trim();
      task.options = makeOptions(word, pool, (item) => item.en);
    }
    if (type === "sentence") {
      task.answer = word.exampleDe.trim();
      task.options = makeOptions(word, pool, (item) => item.exampleDe);
    }
    return task;
  });
}

export function makeTasks(state, topicId, today) {
  return makeTasksFromWords(state, buildQueue(state, topicId, today));
}
