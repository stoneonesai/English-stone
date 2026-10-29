import { TOPICS, topicName } from "../data/topics.js";
import { filterWords, STATUS_LABEL, STATUSES } from "../lib/state.js";
import { esc } from "../ui/format.js";

const FILTERS = [
  ["all", "Alle"],
  ["due", "Heute fällig"],
  ["goal", "Tagesziel"],
  ["hard", "Schwierig"],
  ["easy", "Leicht"],
  ["known", "Sicher gelernt"],
  ["unsure", "Unsicher"],
  ["new", "Neu"],
];

function topicOptions(selected, includeAll) {
  const head = includeAll ? `<option value="all"${selected === "all" ? " selected" : ""}>Alle Themen</option>` : `<option value=""${!selected ? " selected" : ""}>Ohne Thema</option>`;
  const known = new Set(TOPICS.map((topic) => topic.id));
  const extra = selected && !includeAll && !known.has(selected) && selected !== "all"
    ? `<option value="${esc(selected)}" selected>${esc(selected)}</option>`
    : "";
  return head + extra + TOPICS.map((topic) => `<option value="${topic.id}"${selected === topic.id ? " selected" : ""}>${esc(topic.name)}</option>`).join("");
}

function wordArticle(word, selected) {
  const statusOptions = STATUSES.map((status) => `<option value="${status}"${word.status === status ? " selected" : ""}>${STATUS_LABEL[status]}</option>`).join("");
  return `
    <article class="word">
      <label class="pick"><input type="checkbox" data-pick="${esc(word.id)}"${selected ? " checked" : ""} aria-label="${esc(word.en)} auswählen"></label>
      <div>
        <p class="word-en" lang="en">${esc(word.en)}</p>
        <p class="word-de" lang="de">${esc(word.de)}</p>
        <p class="meta">${esc(topicName(word.topic))} · <span class="status ${esc(word.status)}">${esc(STATUS_LABEL[word.status] || "")}</span></p>
        ${word.note ? `<p class="note">${esc(word.note)}</p>` : ""}
        <div class="actions">
          <label class="inline">Status
            <select data-status="${esc(word.id)}" aria-label="Status für ${esc(word.en)}">${statusOptions}</select>
          </label>
          <button type="button" data-edit="${esc(word.id)}">Bearbeiten</button>
          <button type="button" data-delete="${esc(word.id)}">Löschen</button>
        </div>
      </div>
    </article>
  `;
}

function formHtml(word) {
  return `
    <form id="word-form">
      <h2>${word ? "Wort bearbeiten" : "Wort hinzufügen"}</h2>
      <p id="form-error" class="form-error" hidden></p>
      <label>Englisch
        <input name="en" required maxlength="300" value="${esc(word?.en || "")}" autocomplete="off" autocapitalize="none" spellcheck="false" autofocus>
      </label>
      <label>Deutsch
        <input name="de" required maxlength="600" value="${esc(word?.de || "")}" autocomplete="off">
      </label>
      <label>Beispielsatz auf Englisch
        <textarea name="exampleEn" maxlength="1000">${esc(word?.exampleEn || "")}</textarea>
      </label>
      <label>Deutsche Übersetzung des Satzes
        <textarea name="exampleDe" maxlength="1000">${esc(word?.exampleDe || "")}</textarea>
      </label>
      <label>Thema
        <select name="topic">${topicOptions(word?.topic || "", false)}</select>
      </label>
      <label>Notiz
        <textarea name="note" maxlength="2000">${esc(word?.note || "")}</textarea>
      </label>
      <div class="dialog-actions">
        <button type="button" id="form-cancel">Abbrechen</button>
        <button type="submit" class="primary">${word ? "Speichern" : "Hinzufügen"}</button>
      </div>
    </form>
  `;
}

export function renderWords(ctx) {
  const { ui } = ctx;
  const filters = FILTERS.map(([value, label]) => `<option value="${value}"${ui.status === value ? " selected" : ""}>${label}</option>`).join("");
  const marks = ["hard", "easy", "known", "unsure", "new"].map((status) => `<button type="button" data-bulk="${status}">${STATUS_LABEL[status]}</button>`).join("");
  return `
    <div class="toolbar">
      <button type="button" class="primary" id="add-word">Wort hinzufügen</button>
      <label>Suche
        <input id="word-query" type="search" value="${esc(ui.query)}" autocomplete="off">
      </label>
      <label>Anzeige
        <select id="word-status">${filters}</select>
      </label>
      <label>Thema
        <select id="word-topic">${topicOptions(ui.topic, true)}</select>
      </label>
    </div>
    <p id="list-note" class="meta"></p>
    <p id="word-count" class="meta"></p>
    <div class="bulk" id="bulk" hidden>
      <p id="bulk-label"></p>
      <div class="mark-row" id="bulk-marks">${marks}</div>
    </div>
    <label class="choice" id="pick-all-label"><input type="checkbox" id="pick-visible"> <span>Sichtbare auswählen</span></label>
    <div id="word-list"></div>
    <p id="word-empty" class="meta" hidden>Keine Wörter für diese Auswahl.</p>
    <p id="word-more"></p>
    <dialog id="word-dialog"></dialog>
    <dialog id="delete-dialog"></dialog>
  `;
}

export function bindWords(ctx) {
  const { ui, actions } = ctx;
  const list = document.getElementById("word-list");
  const dialog = document.getElementById("word-dialog");
  const deleteDialog = document.getElementById("delete-dialog");
  let deleteId = "";

  const paint = (message) => {
    const filtered = filterWords(ctx.state, ui, ctx.today);
    const slice = filtered.slice(0, ui.limit);
    list.innerHTML = slice.map((word) => wordArticle(word, ui.selected.has(word.id))).join("");
    const count = document.getElementById("word-count");
    count.textContent = filtered.length === 1 ? "1 Wort" : `${filtered.length} Wörter`;
    document.getElementById("word-empty").hidden = filtered.length !== 0;
    const more = document.getElementById("word-more");
    more.innerHTML = filtered.length > ui.limit ? `<button type="button" id="more-words">Weitere Wörter</button>` : "";
    document.getElementById("more-words")?.addEventListener("click", () => {
      ui.limit += 40;
      paint();
    });
    const note = document.getElementById("list-note");
    if (note) note.textContent = message || "";
    const bulk = document.getElementById("bulk");
    const selectedCount = ui.selected.size;
    bulk.hidden = selectedCount === 0;
    document.getElementById("bulk-label").textContent = selectedCount === 1 ? "1 Wort ausgewählt" : `${selectedCount} Wörter ausgewählt`;
    const pick = document.getElementById("pick-visible");
    const visibleIds = slice.map((word) => word.id);
    pick.checked = visibleIds.length > 0 && visibleIds.every((id) => ui.selected.has(id));
    pick.indeterminate = !pick.checked && visibleIds.some((id) => ui.selected.has(id));
    document.getElementById("pick-all-label").hidden = filtered.length === 0;
  };

  document.getElementById("word-query").addEventListener("input", (event) => {
    ui.query = event.target.value;
    ui.limit = 40;
    paint();
  });
  document.getElementById("word-status").addEventListener("change", (event) => {
    ui.status = event.target.value;
    ui.limit = 40;
    paint();
  });
  document.getElementById("word-topic").addEventListener("change", (event) => {
    ui.topic = event.target.value;
    ui.limit = 40;
    paint();
  });
  document.getElementById("pick-visible").addEventListener("change", (event) => {
    const filtered = filterWords(ctx.state, ui, ctx.today).slice(0, ui.limit);
    for (const word of filtered) {
      if (event.target.checked) ui.selected.add(word.id);
      else ui.selected.delete(word.id);
    }
    paint();
  });
  document.getElementById("bulk-marks").addEventListener("click", (event) => {
    const button = event.target.closest("[data-bulk]");
    if (!button || ui.selected.size === 0) return;
    actions.setStatuses([...ui.selected], button.dataset.bulk);
    ui.selected.clear();
    paint("Status gespeichert.");
  });
  list.addEventListener("change", (event) => {
    const pick = event.target.closest("[data-pick]");
    if (pick) {
      if (pick.checked) ui.selected.add(pick.dataset.pick);
      else ui.selected.delete(pick.dataset.pick);
      paint();
      return;
    }
    const status = event.target.closest("[data-status]");
    if (status) {
      actions.setStatuses([status.dataset.status], status.value);
      paint();
    }
  });
  list.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    if (edit) {
      openForm(ctx.state.words.find((word) => word.id === edit.dataset.edit) || null);
      return;
    }
    const remove = event.target.closest("[data-delete]");
    if (remove) openDelete(remove.dataset.delete);
  });
  document.getElementById("add-word").addEventListener("click", () => openForm(null));

  function openForm(word) {
    dialog.innerHTML = formHtml(word);
    const form = dialog.querySelector("#word-form");
    dialog.querySelector("#form-cancel").addEventListener("click", () => dialog.close());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const fields = {
        en: data.get("en"),
        de: data.get("de"),
        exampleEn: data.get("exampleEn"),
        exampleDe: data.get("exampleDe"),
        topic: data.get("topic"),
        note: data.get("note"),
      };
      const error = actions.saveWord(word?.id || "", fields);
      const errorEl = dialog.querySelector("#form-error");
      if (error) {
        errorEl.hidden = false;
        errorEl.textContent = error;
        return;
      }
      dialog.close();
      paint(word ? "Änderung gespeichert." : "Wort hinzugefügt.");
    });
    dialog.showModal();
  }

  function openDelete(id) {
    const word = ctx.state.words.find((item) => item.id === id);
    if (!word) return;
    deleteId = id;
    deleteDialog.innerHTML = `
      <h2>Wort löschen</h2>
      <p>„${esc(word.en)}“ wird aus der Liste entfernt. Andere Computer übernehmen das, sobald der Stand gespeichert ist.</p>
      <div class="dialog-actions">
        <button type="button" id="delete-cancel">Abbrechen</button>
        <button type="button" class="danger" id="delete-confirm">Löschen</button>
      </div>
    `;
    deleteDialog.querySelector("#delete-cancel").addEventListener("click", () => deleteDialog.close());
    deleteDialog.querySelector("#delete-confirm").addEventListener("click", () => {
      actions.deleteWord(deleteId);
      ui.selected.delete(deleteId);
      deleteDialog.close();
      paint("Wort gelöscht.");
    });
    deleteDialog.showModal();
  }

  paint();
}
