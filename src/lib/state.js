import { addDays, localDate } from "./dates.js";
import { sameEn } from "./grade.js";

export const STATUSES = ["hard", "easy", "known", "unsure", "new"];

export const STATUS_LABEL = {
  hard: "Schwierig",
  easy: "Leicht",
  known: "Sicher gelernt",
  unsure: "Unsicher",
  new: "Neu",
};

export function clampGoal(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 10;
  return Math.min(100, Math.max(1, n));
}

function num(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

export function blankLearning() {
  return {
    status: "new",
    statusLocked: false,
    correctStreak: 0,
    timesSeen: 0,
    timesCorrect: 0,
    timesWrong: 0,
    lastReviewed: null,
    nextReview: null,
  };
}

export function makeId() {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fromBase(entry) {
  return {
    id: entry.id,
    en: entry.en,
    de: entry.de,
    exampleEn: entry.exampleEn || "",
    exampleDe: entry.exampleDe || "",
    topic: entry.topic || "",
    note: "",
    origin: "pdf",
    ...blankLearning(),
  };
}

export function createBaseline(vocab, goal = 10, today = localDate()) {
  return {
    version: 1,
    goal: clampGoal(goal),
    streak: 0,
    lastGoalDate: null,
    today: { date: today, ids: [] },
    deck: null,
    history: [],
    words: vocab.map(fromBase),
    updatedAt: null,
  };
}

function catalogEntries(vocab) {
  return Array.isArray(vocab) ? vocab.filter((entry) => entry && typeof entry.id === "string" && entry.id) : [];
}

// Ohne gespeicherte Katalog-IDs gilt die mitgelieferte Liste als schon bekannt.
// Gelöschte Wörter kommen dadurch nicht zurück. Neue IDs aus späteren Versionen werden ergänzt.
export function absorbVocab(state, vocab, knownIds) {
  const catalog = catalogEntries(vocab);
  if (!Array.isArray(knownIds)) {
    return { added: 0, vocabIds: catalog.map((entry) => entry.id) };
  }
  const known = new Set(knownIds.filter((id) => typeof id === "string" && id));
  const have = new Set(state.words.map((word) => word.id));
  let added = 0;
  for (const entry of catalog) {
    if (known.has(entry.id)) continue;
    if (!have.has(entry.id)) {
      state.words.push(fromBase(entry));
      have.add(entry.id);
      added += 1;
    }
    known.add(entry.id);
  }
  return { added, vocabIds: [...known] };
}

export function openProgress(stored, vocab, today = localDate()) {
  if (!stored) {
    return {
      state: createBaseline(vocab, 10, today),
      vocabIds: catalogEntries(vocab).map((entry) => entry.id),
      changed: true,
    };
  }
  const raw = stored.state && typeof stored.state === "object" && !Array.isArray(stored.state) ? stored.state : stored;
  const state = coerceState(raw, today);
  const knownIds = Array.isArray(stored.vocabIds) ? stored.vocabIds : null;
  const { added, vocabIds } = absorbVocab(state, vocab, knownIds);
  return { state, vocabIds, changed: added > 0 || knownIds == null };
}

function intervalFor(status) {
  if (status === "hard") return 0;
  if (status === "unsure") return 1;
  if (status === "easy") return 4;
  if (status === "known") return 10;
  return null;
}

function schedule(word, today) {
  const days = intervalFor(word.status);
  word.nextReview = days === null ? null : addDays(today, days);
  word.lastReviewed = new Date().toISOString();
}

function promote(status) {
  if (status === "hard") return "unsure";
  if (status === "unsure" || status === "new") return "easy";
  if (status === "easy") return "known";
  return "known";
}

function demote(status) {
  if (status === "known" || status === "easy" || status === "new") return "unsure";
  return "hard";
}

export function rollDay(state, today = localDate()) {
  if (!state.today || !state.today.date) {
    state.today = { date: today, ids: [] };
    return false;
  }
  if (state.today.date === today) return false;
  const previous = state.today;
  state.history = Array.isArray(state.history) ? state.history : [];
  state.history = state.history.filter((item) => item.date !== previous.date);
  state.history.push({
    date: previous.date,
    count: previous.ids.length,
    goal: state.goal,
    goalMet: previous.ids.length >= state.goal,
  });
  state.history.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (state.history.length > 90) state.history = state.history.slice(-90);
  if (state.lastGoalDate !== addDays(today, -1) && state.lastGoalDate !== today) {
    state.streak = 0;
  }
  state.today = { date: today, ids: [] };
  state.deck = null;
  return true;
}

export function syncGoal(state, today) {
  const met = state.today.ids.length >= state.goal;
  if (met && state.lastGoalDate !== today) {
    state.streak = state.lastGoalDate === addDays(today, -1) ? state.streak + 1 : 1;
    state.lastGoalDate = today;
    return;
  }
  if (!met && state.lastGoalDate === today) {
    state.streak = Math.max(0, state.streak - 1);
    state.lastGoalDate = state.streak > 0 ? addDays(today, -1) : null;
  }
}

function markPracticed(state, wordId, today) {
  if (!state.today.ids.includes(wordId)) state.today.ids.push(wordId);
  syncGoal(state, today);
}

export function setGoal(state, value, today = localDate()) {
  rollDay(state, today);
  state.goal = clampGoal(value);
  syncGoal(state, today);
}

export function applyResult(state, wordId, outcome, today = localDate()) {
  rollDay(state, today);
  const word = state.words.find((item) => item.id === wordId);
  if (!word) return;
  word.timesSeen += 1;

  if (outcome === "self-known" || outcome === "self-unsure" || outcome === "self-hard") {
    const next = { "self-known": "known", "self-unsure": "unsure", "self-hard": "hard" }[outcome];
    word.status = next;
    word.statusLocked = true;
    word.correctStreak = 0;
    if (outcome === "self-known") word.timesCorrect += 1;
    else word.timesWrong += 1;
    schedule(word, today);
    markPracticed(state, wordId, today);
    return;
  }

  if (outcome === "correct") {
    word.timesCorrect += 1;
    if (!word.statusLocked) {
      word.correctStreak += 1;
      if (word.correctStreak >= 3) {
        word.status = promote(word.status);
        word.correctStreak = 0;
      }
    }
  } else if (outcome === "wrong") {
    word.timesWrong += 1;
    if (!word.statusLocked) {
      word.correctStreak = 0;
      word.status = demote(word.status);
    }
  } else if (outcome === "almost") {
    if (!word.statusLocked) word.correctStreak = 0;
  }

  schedule(word, today);
  markPracticed(state, wordId, today);
}

export function rateWord(state, wordId, status, today = localDate()) {
  setWordStatus(state, [wordId], status, today);
  const word = state.words.find((item) => item.id === wordId);
  if (!word) return;
  word.timesSeen += 1;
  word.lastReviewed = new Date().toISOString();
  if (!state.today.ids.includes(wordId)) state.today.ids.push(wordId);
  syncGoal(state, today);
}

export function setWordStatus(state, ids, status, today = localDate()) {
  if (!STATUSES.includes(status)) return;
  rollDay(state, today);
  const wanted = new Set(ids);
  for (const word of state.words) {
    if (!wanted.has(word.id)) continue;
    word.status = status;
    word.statusLocked = true;
    word.correctStreak = 0;
    const days = intervalFor(status);
    word.nextReview = days === null ? null : addDays(today, days);
  }
}

export function isDue(word, today) {
  if (word.status === "hard" || word.status === "unsure") return true;
  return Boolean(word.nextReview && word.nextReview <= today);
}

export function countStatuses(words) {
  const counts = { hard: 0, easy: 0, known: 0, unsure: 0, new: 0 };
  for (const word of words) counts[word.status] = (counts[word.status] || 0) + 1;
  return counts;
}

export function hasDuplicate(words, en, exceptId = null) {
  return words.some((word) => word.id !== exceptId && sameEn(word.en, en));
}

function readFields(input) {
  return {
    en: clip(input.en, 300).replace(/\s+/g, " "),
    de: clip(input.de, 600).replace(/\s+/g, " "),
    exampleEn: clip(input.exampleEn, 1000),
    exampleDe: clip(input.exampleDe, 1000),
    topic: clip(input.topic, 40),
    note: clip(input.note, 2000),
  };
}

export function addWord(state, input) {
  const fields = readFields(input);
  if (!fields.en || !fields.de) return "Englisch und Deutsch werden beide gebraucht.";
  if (hasDuplicate(state.words, fields.en)) return "Dieses englische Wort ist schon in der Liste.";
  state.words.push({
    id: makeId(),
    ...fields,
    origin: "user",
    ...blankLearning(),
  });
  return "";
}

export function updateWord(state, id, input) {
  const word = state.words.find((item) => item.id === id);
  if (!word) return "Das Wort wurde nicht gefunden.";
  const fields = readFields(input);
  if (!fields.en || !fields.de) return "Englisch und Deutsch werden beide gebraucht.";
  if (!sameEn(word.en, fields.en) && hasDuplicate(state.words, fields.en, id)) {
    return "Dieses englische Wort ist schon in der Liste.";
  }
  Object.assign(word, fields);
  return "";
}

export function deleteWord(state, id, today = localDate()) {
  rollDay(state, today);
  const before = state.words.length;
  state.words = state.words.filter((word) => word.id !== id);
  state.today.ids = state.today.ids.filter((item) => item !== id);
  syncGoal(state, today);
  return state.words.length < before;
}

export function resetProgress(state, today = localDate()) {
  for (const word of state.words) Object.assign(word, blankLearning());
  state.streak = 0;
  state.lastGoalDate = null;
  state.today = { date: today, ids: [] };
  state.deck = null;
  state.history = [];
}

export function resetAll(state, vocab, today = localDate()) {
  const goal = clampGoal(state.goal);
  const next = createBaseline(vocab, goal, today);
  next.goal = goal;
  return next;
}

export function exportPayload(state) {
  return {
    kind: "alltagsvokabeln",
    version: 1,
    exportedAt: new Date().toISOString(),
    goal: state.goal,
    streak: state.streak,
    lastGoalDate: state.lastGoalDate,
    today: state.today,
    deck: state.deck || null,
    history: state.history,
    words: state.words,
  };
}

export function stateFromImport(data, today = localDate()) {
  if (!data || typeof data !== "object" || !Array.isArray(data.words)) {
    throw new Error("Die Datei enthält keine Wortliste.");
  }
  if (data.kind && data.kind !== "alltagsvokabeln") {
    throw new Error("Diese Datei gehört nicht zu Alltagsvokabeln.");
  }
  if (data.words.length > 8000) throw new Error("Die Datei enthält zu viele Einträge.");
  const seen = new Set();
  const words = data.words.map((word, index) => {
    if (!word || typeof word.en !== "string" || typeof word.de !== "string" || !word.en.trim() || !word.de.trim()) {
      throw new Error(`Eintrag ${index + 1} hat kein englisches Wort oder keine deutsche Übersetzung.`);
    }
    let id = typeof word.id === "string" && word.id.trim() ? word.id.trim().slice(0, 80) : makeId();
    if (seen.has(id)) id = makeId();
    seen.add(id);
    const status = STATUSES.includes(word.status) ? word.status : "new";
    return {
      id,
      en: clip(word.en, 300).replace(/\s+/g, " "),
      de: clip(word.de, 600).replace(/\s+/g, " "),
      exampleEn: clip(word.exampleEn, 1000),
      exampleDe: clip(word.exampleDe, 1000),
      topic: typeof word.topic === "string" ? word.topic.slice(0, 40) : "",
      note: clip(word.note, 2000),
      origin: word.origin === "user" ? "user" : "pdf",
      status,
      statusLocked: Boolean(word.statusLocked),
      correctStreak: num(word.correctStreak),
      timesSeen: num(word.timesSeen),
      timesCorrect: num(word.timesCorrect),
      timesWrong: num(word.timesWrong),
      lastReviewed: typeof word.lastReviewed === "string" ? word.lastReviewed : null,
      nextReview: typeof word.nextReview === "string" ? word.nextReview : null,
    };
  });
  const importedToday = data.today && typeof data.today.date === "string" && Array.isArray(data.today.ids)
    ? {
        date: data.today.date,
        ids: data.today.ids.filter((id) => typeof id === "string" && seen.has(id)),
      }
    : { date: today, ids: [] };
  return {
    version: 1,
    goal: clampGoal(data.goal ?? 10),
    streak: num(data.streak),
    lastGoalDate: typeof data.lastGoalDate === "string" ? data.lastGoalDate : null,
    today: importedToday,
    history: Array.isArray(data.history)
      ? data.history
          .filter((item) => item && typeof item.date === "string")
          .slice(-90)
          .map((item) => ({
            date: item.date,
            count: num(item.count),
            goal: clampGoal(item.goal ?? data.goal ?? 10),
            goalMet: Boolean(item.goalMet),
          }))
      : [],
    words,
    deck: readDeck(data.deck, seen),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

function readDeck(deck, seen) {
  if (!deck || typeof deck !== "object" || typeof deck.date !== "string" || !Array.isArray(deck.ids)) return null;
  const ids = deck.ids.filter((id) => typeof id === "string" && seen.has(id));
  if (!ids.length) return null;
  return {
    date: deck.date,
    topic: typeof deck.topic === "string" ? deck.topic.slice(0, 40) : "",
    ids,
    index: Math.min(num(deck.index), ids.length),
  };
}

export function coerceState(data, today = localDate()) {
  const state = stateFromImport(data, today);
  rollDay(state, today);
  return state;
}

export function filterWords(state, { query = "", status = "all", topic = "all" } = {}, today = localDate()) {
  const needle = query.trim().toLowerCase();
  return state.words.filter((word) => {
    if (topic !== "all" && word.topic !== topic) return false;
    if (status === "due" && !isDue(word, today)) return false;
    if (status === "goal" && !state.today.ids.includes(word.id)) return false;
    if (STATUSES.includes(status) && word.status !== status) return false;
    if (!needle) return true;
    const hay = `${word.en} ${word.de} ${word.exampleEn} ${word.exampleDe} ${word.note}`.toLowerCase();
    return hay.includes(needle);
  });
}
