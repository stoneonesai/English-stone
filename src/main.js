import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-serif-4/latin-600.css";
import "./styles.css";
import vocab from "./data/vocab.json";
import { localDate } from "./lib/dates.js";
import { ensureDeck, makeTasksFromWords } from "./lib/session.js";
import {
  addWord,
  applyResult,
  coerceState,
  deleteWord as removeWord,
  openProgress,
  rateWord,
  resetAll,
  resetProgress,
  rollDay,
  setGoal as writeGoal,
  setWordStatus,
  updateWord,
} from "./lib/state.js";
import { bindCategories, renderCategories } from "./views/categories.js";
import { bindPractice, renderPractice } from "./views/practice.js";
import { bindProgress, renderProgress } from "./views/progress.js";
import { bindSettings, renderSettings } from "./views/settings.js";
import { bindToday, renderToday } from "./views/today.js";
import { bindTopics, renderTopics } from "./views/topics.js";
import { bindWords, renderWords } from "./views/words.js";

const STORAGE_KEY = "av.progress";
const CACHE_KEY = "av.cache";
const ACCESS_KEY = "av.access";
const ROUTES = {
  heute: "Heute",
  ueben: "Üben",
  woerter: "Wörter",
  kategorien: "Kategorien",
  themen: "Themen",
  fortschritt: "Fortschritt",
  einstellungen: "Einstellungen",
};
const VIEWS = {
  heute: { render: renderToday, bind: bindToday },
  ueben: { render: renderPractice, bind: bindPractice },
  woerter: { render: renderWords, bind: bindWords },
  kategorien: { render: renderCategories, bind: bindCategories },
  themen: { render: renderTopics, bind: bindTopics },
  fortschritt: { render: renderProgress, bind: bindProgress },
  einstellungen: { render: renderSettings, bind: bindSettings },
};
const SAVE_TEXT = {
  saving: "Speichert…",
  saved: "Gespeichert",
  error: "Nicht gespeichert. Wird erneut versucht.",
  offline: "Keine Verbindung. Wird erneut versucht.",
  config: "Auf dem Webspace fehlt das Zugangswort in config.php.",
  idle: "",
};

let state = null;
let vocabIds = null;
let session = null;
let password = "";
let dirty = false;
let saveStatus = "idle";
let rev = 0;
let chain = Promise.resolve();
let retryTimer = 0;
let savedToken = 0;
let current = "heute";

const ui = {
  query: "",
  status: "all",
  topic: "all",
  limit: 40,
  selected: new Set(),
  todayTopic: "",
  notice: "",
  cardOpen: false,
};

const actions = {
  startPractice,
  revealCard,
  rateCard,
  skipCard,
  changeTodayTopic,
  choose,
  finishTyped,
  showSolution,
  selfCheck,
  mark,
  nextTask,
  endRound,
  setStatuses,
  saveWord,
  deleteWord,
  setGoal,
  replaceState,
  reset,
  forgetAccess,
  openStatus,
  openTopic,
};

function ctx() {
  return { state, ui, session, actions, today: localDate() };
}

function routeFromHash() {
  const name = location.hash.replace(/^#\/?/, "");
  return ROUTES[name] ? name : "heute";
}

function practiceBusy() {
  return Boolean(session && (session.phase === "ask" || session.phase === "feedback"));
}

function encodeAccess(word) {
  const bytes = new TextEncoder().encode(word);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function readStored() {
  try {
    const currentValue = localStorage.getItem(STORAGE_KEY);
    const raw = currentValue || localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (currentValue) return parsed;
    if (parsed?.state) return { state: parsed.state, dirty: Boolean(parsed.dirty) };
    return { invalid: true };
  } catch {
    return { invalid: true };
  }
}

function writeLocal(isDirty) {
  dirty = isDirty;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, vocabIds, state, dirty }));
    localStorage.removeItem(CACHE_KEY);
  } catch {
    setSaveStatus("error", "Nicht gespeichert. Der Speicher dieses Browsers ist voll oder blockiert.");
  }
}

async function api(method, body) {
  let response;
  try {
    response = await fetch(new URL("api.php", document.baseURI), {
      method,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-access-word": encodeAccess(password),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const error = new Error("network");
    error.code = "network";
    throw error;
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error("http");
    error.code = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    if (dirty && password) queueSave();
  }, 4000);
}

function queueSave() {
  rev += 1;
  const myRev = rev;
  writeLocal(true);
  setSaveStatus("saving");
  chain = chain.then(() => push(myRev)).catch(() => {});
}

async function push(myRev) {
  if (myRev !== rev || !state) return;
  try {
    const result = await api("PUT", { version: 1, vocabIds, state });
    if (myRev !== rev) return;
    state.updatedAt = result.updatedAt;
    writeLocal(false);
    setSaveStatus("saved");
  } catch (error) {
    if (myRev !== rev) return;
    writeLocal(true);
    if (error.code === 401) {
      handleUnauthorized();
      return;
    }
    if (error.code === 503) {
      setSaveStatus("config");
      return;
    }
    if (error.code === 400 || error.code === 413) {
      setSaveStatus("error", "Nicht gespeichert. Der Webspace hat den Stand abgelehnt.");
      return;
    }
    if (error.code === 404 || error.code === 405) {
      setSaveStatus("error", "Nicht gespeichert. Netlify speichert den Stand bei einem reinen Datei-Upload nicht.");
      return;
    }
    setSaveStatus(error.code === "network" ? "offline" : "error");
    scheduleRetry();
  }
}

function handleUnauthorized() {
  clearTimeout(retryTimer);
  localStorage.removeItem(ACCESS_KEY);
  password = "";
  renderGate("Das Zugangswort stimmt nicht.");
}

function setSaveStatus(next, text) {
  saveStatus = next;
  const el = document.getElementById("save-status");
  if (el) {
    el.dataset.state = next;
    el.textContent = text || SAVE_TEXT[next] || "";
  }
  if (next === "saved") {
    const mine = ++savedToken;
    setTimeout(() => {
      if (mine === savedToken && saveStatus === "saved") setSaveStatus("idle");
    }, 2500);
  }
}

function updateChrome() {
  const place = document.getElementById("place");
  if (place) place.textContent = ROUTES[current];
  document.title = `${ROUTES[current]} · Alltagsvokabeln`;
  for (const link of document.querySelectorAll(".nav a")) {
    if (link.dataset.route === current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function renderMain() {
  const main = document.getElementById("main");
  if (!main || !state) return;
  const practice = current === "ueben";
  if (!practice) syncDeck();
  const scrollY = window.scrollY;
  if (practice) main.style.minHeight = `${main.offsetHeight}px`;
  const view = VIEWS[current] || VIEWS.heute;
  const context = ctx();
  main.innerHTML = view.render(context);
  view.bind(context);
  if (practice) {
    if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
    if (scrollY === 0) main.style.minHeight = "";
    return;
  }
  main.style.minHeight = "";
  window.scrollTo(0, 0);
  const focus = main.querySelector("[data-autofocus]");
  if (focus) focus.focus({ preventScroll: true });
}

function applyHash() {
  current = routeFromHash();
  ui.notice = "";
  updateChrome();
  renderMain();
}

function buildShell() {
  const links = Object.entries(ROUTES)
    .map(([id, label]) => `<a href="#/${id}" data-route="${id}">${label}</a>`)
    .join("");
  document.getElementById("app").innerHTML = `
    <header class="top">
      <div class="top-inner">
        <p class="brand">Alltagsvokabeln</p>
        <h1 id="place" tabindex="-1">Heute</h1>
      </div>
    </header>
    <p id="save-status" class="save" role="status"></p>
    <nav class="nav" aria-label="Bereiche">${links}</nav>
    <main id="main" tabindex="-1"></main>
  `;
  setSaveStatus(saveStatus);
}

function showApp() {
  if (!document.getElementById("main")) buildShell();
  applyHash();
}

function renderGate(message = "") {
  document.getElementById("app").innerHTML = `
    <main class="gate">
      <p class="brand">Alltagsvokabeln</p>
      <h1>Zugang</h1>
      <p>Gib das Zugangswort ein. Danach gilt derselbe Lernstand auf jedem Computer.</p>
      <form id="gate-form">
        <label for="access">Zugangswort
          <input id="access" type="password" autocomplete="current-password" required>
        </label>
        <p id="gate-error" class="form-error"${message ? "" : " hidden"}>${message}</p>
        <button class="primary" type="submit">Weiter</button>
      </form>
    </main>
  `;
  const form = document.getElementById("gate-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const word = document.getElementById("access").value;
    if (word) unlock(word);
  });
  document.getElementById("access").focus();
}

function renderLoading() {
  document.getElementById("app").innerHTML = `
    <main class="gate">
      <p class="brand">Alltagsvokabeln</p>
      <h1>Lernstand wird geladen.</h1>
    </main>
  `;
}

function renderBlocked(title, text, retry) {
  document.getElementById("app").innerHTML = `
    <main class="gate">
      <p class="brand">Alltagsvokabeln</p>
      <h1>${title}</h1>
      <p>${text}</p>
      ${retry ? '<button type="button" class="primary" id="retry-load">Erneut versuchen</button>' : ""}
    </main>
  `;
  document.getElementById("retry-load")?.addEventListener("click", () => boot());
}

function useOpened(opened, upload) {
  state = opened.state;
  vocabIds = opened.vocabIds;
  showApp();
  if (upload || opened.changed) queueSave();
}

function hasProgress(data) {
  if (!data || !Array.isArray(data.words)) return false;
  if (data.streak > 0 || data.goal !== 10) return true;
  if (Array.isArray(data.history) && data.history.length > 0) return true;
  if (data.today?.ids?.length) return true;
  return data.words.some((word) => word.status !== "new" || word.origin === "user" || (word.note || "").trim());
}

async function unlock(word) {
  password = word;
  renderLoading();
  let remote;
  try {
    remote = await api("GET");
  } catch (error) {
    password = "";
    if (error.code === 401) {
      localStorage.removeItem(ACCESS_KEY);
      renderGate("Das Zugangswort stimmt nicht.");
      return;
    }
    if (error.code === 503) {
      renderBlocked("Zugangswort fehlt", "Bei Netlify die Variable ACCESS_PASSWORD setzen. Auf einem PHP-Webspace steht das Wort in config.php.", true);
      return;
    }
    if (error.code === 404 || error.code === 405) {
      renderBlocked("Speichern nicht möglich", "Netlify hat nur die Dateien bekommen. Der Lernstand bleibt erst gespeichert, wenn die Funktion mit veröffentlicht wird.", false);
      return;
    }
    const local = readStored();
    if (local?.state && !local.invalid) {
      try {
        password = word;
        localStorage.setItem(ACCESS_KEY, word);
        const opened = openProgress(local, vocab);
        state = opened.state;
        vocabIds = opened.vocabIds;
        dirty = true;
        showApp();
        setSaveStatus(error.code === "network" ? "offline" : "error");
        scheduleRetry();
        return;
      } catch {
        renderBlocked("Lernstand unlesbar", "Der gespeicherte Stand in diesem Browser konnte nicht gelesen werden. Er wurde nicht überschrieben.", true);
        return;
      }
    }
    renderBlocked("Lernstand nicht erreichbar", "Der Lernstand auf dem Webspace kann gerade nicht geladen werden.", true);
    return;
  }
  localStorage.setItem(ACCESS_KEY, word);
  const local = readStored();
  if (local?.invalid) {
    renderBlocked("Lernstand unlesbar", "Der gespeicherte Stand in diesem Browser konnte nicht gelesen werden. Er wurde nicht überschrieben.", false);
    return;
  }
  try {
    const localHasProgress = Boolean(local?.state && hasProgress(local.state));
    const remoteHasProgress = Boolean(remote?.state && hasProgress(remote.state));
    if ((local?.dirty && local.state) || (localHasProgress && !remoteHasProgress)) {
      useOpened(openProgress(local, vocab), true);
      return;
    }
    if (remote?.state) {
      const opened = openProgress(remote, vocab);
      state = opened.state;
      vocabIds = opened.vocabIds;
      writeLocal(false);
      showApp();
      if (opened.changed) queueSave();
      return;
    }
    useOpened(openProgress(local, vocab), true);
  } catch {
    renderBlocked("Lernstand unlesbar", "Der gespeicherte Stand konnte nicht gelesen werden. Er wurde nicht überschrieben.", true);
  }
}

function boot() {
  password = localStorage.getItem(ACCESS_KEY) || "";
  if (!password) {
    renderGate();
    return;
  }
  unlock(password);
}

function currentTask() {
  if (!session || session.phase === "done" || session.phase === "empty") return null;
  return session.tasks[session.index] || null;
}

function syncDeck() {
  const before = JSON.stringify({ today: state.today, deck: state.deck || null, streak: state.streak, lastGoalDate: state.lastGoalDate });
  rollDay(state);
  ensureDeck(state, ui.todayTopic, localDate());
  const after = JSON.stringify({ today: state.today, deck: state.deck || null, streak: state.streak, lastGoalDate: state.lastGoalDate });
  if (before !== after) queueSave();
}

function revealCard() {
  ui.cardOpen = true;
  renderMain();
}

function rateCard(status) {
  const deck = state.deck;
  if (!deck || deck.index >= deck.ids.length) return;
  rateWord(state, deck.ids[deck.index], status, localDate());
  deck.index += 1;
  ui.cardOpen = false;
  queueSave();
  renderMain();
}

function skipCard() {
  const deck = state.deck;
  if (!deck || deck.index >= deck.ids.length) return;
  deck.index += 1;
  ui.cardOpen = false;
  queueSave();
  renderMain();
}

function changeTodayTopic(topic) {
  ui.todayTopic = topic;
  ui.cardOpen = false;
  state.deck = null;
  ensureDeck(state, topic, localDate());
  queueSave();
  renderMain();
}

function startPractice() {
  const rolled = rollDay(state);
  if (rolled) state.deck = null;
  ensureDeck(state, ui.todayTopic, localDate());
  if (rolled) queueSave();
  if (session && session.phase !== "empty" && session.phase !== "done") {
    if (location.hash === "#/ueben") renderMain();
    else location.hash = "#/ueben";
    return;
  }
  const words = (state.deck?.ids || [])
    .map((id) => state.words.find((word) => word.id === id))
    .filter(Boolean);
  const tasks = makeTasksFromWords(state, words);
  session = {
    tasks,
    index: 0,
    phase: tasks.length ? "ask" : "empty",
    tally: { correct: 0, almost: 0, wrong: 0, reveal: 0, self: 0 },
    outcome: null,
    typed: "",
  };
  if (location.hash === "#/ueben") renderMain();
  else location.hash = "#/ueben";
}

function choose(index) {
  const task = currentTask();
  if (!task || session.phase !== "ask" || !task.options) return;
  const option = task.options[index];
  if (option == null) return;
  holdAdvance();
  session.outcome = option === task.answer ? "correct" : "wrong";
  session.typed = option;
  session.phase = "feedback";
  session.tally[session.outcome] += 1;
  applyResult(state, task.wordId, session.outcome, localDate());
  queueSave();
  renderMain();
}

function finishTyped(value, grade) {
  const task = currentTask();
  if (!task || session.phase !== "ask") return;
  holdAdvance();
  session.typed = value;
  session.outcome = grade;
  session.phase = "feedback";
  session.tally[grade] += 1;
  applyResult(state, task.wordId, grade, localDate());
  queueSave();
  renderMain();
}

function showSolution() {
  const task = currentTask();
  if (!task || session.phase !== "ask") return;
  if (task.type !== "type-en" && task.type !== "cloze") return;
  holdAdvance();
  const input = document.getElementById("answer");
  session.typed = input ? input.value.trim() : "";
  session.outcome = "reveal";
  session.phase = "feedback";
  session.tally.reveal = (session.tally.reveal || 0) + 1;
  applyResult(state, task.wordId, "wrong", localDate());
  queueSave();
  renderMain();
}

function selfCheck(outcome) {
  const task = currentTask();
  if (!task || session.phase !== "ask") return;
  holdAdvance();
  applyResult(state, task.wordId, outcome, localDate());
  session.outcome = "self";
  session.phase = "feedback";
  session.tally.self += 1;
  queueSave();
  renderMain();
}

function mark(status) {
  const task = currentTask();
  if (!task) return;
  setWordStatus(state, [task.wordId], status, localDate());
  queueSave();
  renderMain();
}

let blockAdvance = false;

function holdAdvance() {
  blockAdvance = true;
  setTimeout(() => {
    blockAdvance = false;
  }, 0);
}

function nextTask() {
  if (!session || blockAdvance) return;
  if (session.phase !== "feedback") {
    const task = session.tasks[session.index];
    const exists = task && state.words.some((word) => word.id === task.wordId);
    if (exists) return;
  }
  session.index += 1;
  session.outcome = null;
  session.typed = "";
  session.phase = session.index >= session.tasks.length ? "done" : "ask";
  renderMain();
}

function endRound() {
  session = null;
  if (location.hash === "#/heute") renderMain();
  else location.hash = "#/heute";
}

function setStatuses(ids, status) {
  setWordStatus(state, ids, status, localDate());
  queueSave();
}

function saveWord(id, fields) {
  const error = id ? updateWord(state, id, fields) : addWord(state, fields);
  if (!error) queueSave();
  return error;
}

function deleteWord(id) {
  removeWord(state, id, localDate());
  queueSave();
}

function setGoal(value) {
  writeGoal(state, value, localDate());
  queueSave();
  renderMain();
}

function replaceState(next) {
  state = coerceState(next);
  vocabIds = vocab.map((entry) => entry.id);
  session = null;
  ui.selected.clear();
  ui.notice = "Der importierte Stand wurde gespeichert.";
  queueSave();
  renderMain();
}

function reset(mode) {
  if (mode === "all") {
    state = resetAll(state, vocab, localDate());
    vocabIds = vocab.map((entry) => entry.id);
  } else {
    resetProgress(state, localDate());
  }
  session = null;
  ui.selected.clear();
  ui.notice = mode === "all"
    ? "Der Stand entspricht wieder der ursprünglichen Wortliste."
    : "Der Lernfortschritt wurde zurückgesetzt.";
  queueSave();
  renderMain();
}

function forgetAccess() {
  clearTimeout(retryTimer);
  localStorage.removeItem(ACCESS_KEY);
  password = "";
  session = null;
  state = null;
  location.hash = "#/heute";
  renderGate();
}

function openStatus(status) {
  ui.status = status;
  ui.topic = "all";
  ui.query = "";
  ui.limit = 40;
  if (location.hash === "#/woerter") renderMain();
  else location.hash = "#/woerter";
}

function openTopic(topic) {
  ui.topic = topic;
  ui.status = "all";
  ui.query = "";
  ui.limit = 40;
  if (location.hash === "#/woerter") renderMain();
  else location.hash = "#/woerter";
}

function onKey(event) {
  if (document.querySelector("dialog[open]")) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (current === "heute" && state?.deck && state.deck.index < state.deck.ids.length) {
    if (!ui.cardOpen && (event.key === "Enter" || event.key === " ")) {
      if (event.target?.id === "flash-card") return;
      event.preventDefault();
      revealCard();
      return;
    }
    if (ui.cardOpen && /^[1-4]$/.test(event.key)) {
      const statuses = ["hard", "easy", "known", "unsure"];
      event.preventDefault();
      rateCard(statuses[Number(event.key) - 1]);
    }
    return;
  }
  if (!session || current !== "ueben") return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (session.phase === "feedback" && event.key === "Enter") {
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    nextTask();
    return;
  }
  if (session.phase !== "ask" || !/^[1-4]$/.test(event.key)) return;
  const task = currentTask();
  if (!task) return;
  const index = Number(event.key) - 1;
  if (task.type === "self") {
    const map = ["self-known", "self-unsure", "self-hard"];
    if (map[index]) selfCheck(map[index]);
    return;
  }
  if (task.options) choose(index);
}

document.addEventListener("keydown", onKey);
window.addEventListener("hashchange", () => {
  if (!state || !document.getElementById("main")) return;
  applyHash();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !state || !password) return;
  const rolled = rollDay(state);
  if (rolled) {
    queueSave();
    if (!practiceBusy()) renderMain();
    return;
  }
  if (dirty || practiceBusy()) return;
  api("GET")
    .then((remote) => {
      if (!remote?.state || remote.state.updatedAt === state.updatedAt || dirty || practiceBusy()) return;
      const opened = openProgress(remote, vocab);
      state = opened.state;
      vocabIds = opened.vocabIds;
      writeLocal(false);
      renderMain();
    })
    .catch(() => {});
});

boot();
