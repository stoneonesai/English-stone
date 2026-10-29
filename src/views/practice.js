import { gradeTyped } from "../lib/grade.js";
import { STATUS_LABEL } from "../lib/state.js";
import { emphasize, esc, goalLine } from "../ui/format.js";

const TYPE_LABEL = {
  "choose-de": "Übersetzung wählen",
  "type-en": "Wort schreiben",
  "choose-en": "Bedeutung wählen",
  cloze: "Buchstaben ergänzen",
  sentence: "Satz übersetzen",
  self: "Selbstcheck",
};

function exampleBlock(word) {
  if (!word.exampleEn && !word.exampleDe) return `<p class="example">Kein Beispielsatz gespeichert.</p>`;
  return `
    <p class="example" lang="en">${emphasize(word.exampleEn, word.en)}</p>
    ${word.exampleDe ? `<p class="example de" lang="de">${esc(word.exampleDe)}</p>` : ""}
  `;
}

function askHtml(task, word) {
  if (task.type === "type-en" || task.type === "cloze") {
    const prompt = task.type === "cloze"
      ? `<p class="mask" lang="en">${esc(task.mask)}</p><p class="meaning" lang="de">${esc(word.de)}</p><p class="hint">Ergänze das englische Wort.</p>`
      : `<p class="prompt" lang="de">${esc(word.de)}</p><p class="hint">Schreib das englische Wort.</p>`;
    return `
      ${prompt}
      <label>Englisch
        <input id="answer" name="answer" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done">
      </label>
      <p id="answer-hint" class="form-error" hidden></p>
      <div class="practice-actions">
        <button type="button" class="primary" id="check">Prüfen</button>
        <button type="button" id="show-solution">Lösung</button>
      </div>
    `;
  }
  if (task.type === "self") {
    return `
      <p class="prompt" lang="en">${esc(word.en)}</p>
      <p class="meaning" lang="de">${esc(word.de)}</p>
      ${exampleBlock(word)}
      <div class="options">
        <button type="button" class="option" data-self="self-known"><span class="key">1</span><span>Kenne ich sicher</span></button>
        <button type="button" class="option" data-self="self-unsure"><span class="key">2</span><span>Unsicher</span></button>
        <button type="button" class="option" data-self="self-hard"><span class="key">3</span><span>Keine Ahnung</span></button>
      </div>
    `;
  }
  const englishPrompt = task.type !== "choose-en";
  const promptClass = task.type === "sentence" ? "prompt sentence" : "prompt";
  const prompt = task.type === "sentence" ? word.exampleEn : englishPrompt ? word.en : word.de;
  const hint = task.type === "choose-en" ? "Welches englische Wort passt?" : task.type === "sentence" ? "Welche Übersetzung passt?" : "Welche Übersetzung passt?";
  const options = (task.options || []).map((option, index) => `
    <button type="button" class="option" data-choice="${index}"><span class="key">${index + 1}</span><span lang="${task.type === "choose-en" ? "en" : "de"}">${esc(option)}</span></button>
  `).join("");
  return `
    <p class="${promptClass}" lang="${englishPrompt ? "en" : "de"}">${esc(prompt)}</p>
    <p class="hint">${hint}</p>
    <div class="options">${options}</div>
  `;
}

function feedbackHtml(task, word, session) {
  const titles = { correct: "Richtig", almost: "Fast richtig", wrong: "Falsch", reveal: "Lösung", self: "Eingetragen" };
  const kind = session.outcome === "wrong" || session.outcome === "reveal" ? "wrong" : session.outcome === "almost" ? "almost" : "correct";
  const marks = ["hard", "easy", "known", "unsure"].map((status) => `
    <button type="button" data-mark="${status}" aria-pressed="${word.status === status ? "true" : "false"}">${STATUS_LABEL[status]}</button>
  `).join("");
  const typed = (session.outcome === "wrong" || session.outcome === "almost" || session.outcome === "reveal") && session.typed
    ? `<p>Deine Eingabe: ${esc(session.typed)}</p>`
    : "";
  const almost = session.outcome === "almost" ? "<p>Nicht als richtig gewertet.</p>" : "";
  const self = session.outcome === "self" ? `<p>Status: ${esc(STATUS_LABEL[word.status] || "")}.</p>` : `<p class="meta">Status: ${esc(STATUS_LABEL[word.status] || "")}</p>`;
  return `
    <div class="result ${kind}" role="status">
      <h2>${titles[session.outcome] || "Ergebnis"}</h2>
      ${almost}
      ${typed}
      <p class="solution"><span lang="en">${esc(word.en)}</span> · <span lang="de">${esc(word.de)}</span></p>
      ${exampleBlock(word)}
      ${self}
    </div>
    <fieldset class="marks">
      <legend>Status setzen</legend>
      <div class="mark-row">${marks}</div>
    </fieldset>
    <div class="practice-actions">
      <button type="button" class="primary" id="next-task">Weiter</button>
    </div>
  `;
}

function tallyLine(tally) {
  const parts = [];
  if (tally.correct) parts.push(`${tally.correct} richtig`);
  if (tally.almost) parts.push(`${tally.almost} fast richtig`);
  if (tally.wrong) parts.push(`${tally.wrong} falsch`);
  if (tally.reveal) parts.push(`${tally.reveal} Lösung`);
  if (tally.self) parts.push(`${tally.self} eingeschätzt`);
  return parts.length ? parts.join(", ") : "Keine Antwort gespeichert.";
}

export function renderPractice(ctx) {
  const { state, session, today } = ctx;
  const deck = state.deck;
  const cardsLeft = deck && deck.date === today && deck.index < deck.ids.length;
  if (cardsLeft && (!session || session.phase === "empty" || session.phase === "done")) {
    return `
      <p>Zuerst die Karteikarten für heute. Die Übungen kommen danach.</p>
      <button type="button" class="primary" id="back-cards">Zu den Karten</button>
    `;
  }
  if (!session || session.phase === "empty" || !session.tasks?.length) {
    return `
      <p>In dieser Auswahl ist gerade kein Wort zum Üben.</p>
      <button type="button" class="primary" id="start-here">Üben starten</button>
    `;
  }
  if (session.phase === "done") {
    return `
      ${goalLine(state.today.ids.length, state.goal)}
      <h2>Runde beendet</h2>
      <p>Du hast ${session.tasks.length} Wörter bearbeitet.</p>
      <p>${esc(tallyLine(session.tally))}</p>
      <button type="button" class="primary" id="again">Noch eine Runde</button>
    `;
  }
  const task = session.tasks[session.index];
  const word = state.words.find((item) => item.id === task.wordId);
  const head = `
    <div class="practice-head">
      <p class="meta">Aufgabe ${session.index + 1} von ${session.tasks.length} · ${TYPE_LABEL[task.type] || "Übung"}</p>
      <button type="button" class="text" id="end-round">Beenden</button>
    </div>
    ${goalLine(state.today.ids.length, state.goal)}
  `;
  if (!word) {
    return `${head}<p>Dieses Wort ist nicht mehr in der Liste.</p><button type="button" class="primary" id="skip-missing" data-autofocus>Weiter</button>`;
  }
  const body = session.phase === "feedback" ? feedbackHtml(task, word, session) : askHtml(task, word);
  return head + body;
}

export function bindPractice(ctx) {
  const { actions } = ctx;
  document.getElementById("start-here")?.addEventListener("click", () => actions.startPractice());
  document.getElementById("back-cards")?.addEventListener("click", () => { location.hash = "#/heute"; });
  document.getElementById("again")?.addEventListener("click", () => actions.startPractice());
  document.getElementById("next-task")?.addEventListener("click", () => actions.nextTask());
  document.getElementById("skip-missing")?.addEventListener("click", () => actions.nextTask());
  document.getElementById("end-round")?.addEventListener("click", () => actions.endRound());
  document.getElementById("check")?.addEventListener("click", () => submitTyped(ctx));
  document.getElementById("show-solution")?.addEventListener("click", () => actions.showSolution());
  for (const button of document.querySelectorAll("#next-task, #check, #show-solution, .option, [data-mark], #end-round")) {
    button.addEventListener("pointerdown", (event) => event.preventDefault());
  }
  document.getElementById("answer")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitTyped(ctx);
    }
  });
  for (const button of document.querySelectorAll("[data-choice]")) {
    button.addEventListener("click", () => actions.choose(Number(button.dataset.choice)));
  }
  for (const button of document.querySelectorAll("[data-self]")) {
    button.addEventListener("click", () => actions.selfCheck(button.dataset.self));
  }
  for (const button of document.querySelectorAll("[data-mark]")) {
    button.addEventListener("click", () => actions.mark(button.dataset.mark));
  }
}

function submitTyped(ctx) {
  const input = document.getElementById("answer");
  const value = input ? input.value : "";
  const task = ctx.session?.tasks?.[ctx.session.index];
  if (!task) return;
  const grade = gradeTyped(value, task.answer);
  if (grade === "empty") {
    const hint = document.getElementById("answer-hint");
    if (hint) {
      hint.hidden = false;
      hint.textContent = "Schreib das englische Wort.";
    }
    input?.focus();
    return;
  }
  ctx.actions.finishTyped(value, grade);
}
