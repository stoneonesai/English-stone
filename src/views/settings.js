import { localDate } from "../lib/dates.js";
import { exportPayload, stateFromImport } from "../lib/state.js";
import { esc } from "../ui/format.js";

export function renderSettings(ctx) {
  const notice = ctx.ui.notice ? `<p class="notice" role="status">${esc(ctx.ui.notice)}</p>` : "";
  return `
    ${notice}
    <section class="block">
      <h2>Tagesziel</h2>
      <label>Wörter pro Tag
        <input id="goal" type="number" min="1" max="100" step="1" value="${ctx.state.goal}">
      </label>
      <button type="button" class="primary" id="save-goal">Ziel speichern</button>
    </section>
    <section class="block">
      <h2>Sicherung</h2>
      <p>Der Lernstand liegt auf der Website. Nach dem Schließen und auf einem anderen Computer ist derselbe Stand da. Export und Import enthalten die Wörter, den Status, die Themen, die Beispielsätze, die Notizen und den Lernfortschritt.</p>
      <div class="actions">
        <button type="button" id="export">Exportieren</button>
        <button type="button" id="import-btn">Importieren</button>
      </div>
      <input id="import-file" type="file" accept="application/json,.json" hidden>
      <p id="import-error" class="form-error" hidden></p>
    </section>
    <section class="block">
      <h2>Zugang auf diesem Gerät</h2>
      <p>Das Zugangswort bleibt auf diesem Computer gespeichert, bis du es hier löschst.</p>
      <button type="button" id="forget">Zugangswort auf diesem Computer löschen</button>
    </section>
    <section class="reset-zone">
      <h2>Zurücksetzen</h2>
      <p>Dieser Bereich löscht den gespeicherten Stand auf der Website. Andere Computer laden danach denselben Stand.</p>
      <button type="button" class="danger" id="open-reset">Zurücksetzen</button>
    </section>
    <dialog id="import-dialog">
      <h2>Importieren</h2>
      <p>Der Import ersetzt den Stand auf der Website. Andere Computer laden danach denselben Stand.</p>
      <div class="dialog-actions">
        <button type="button" id="import-cancel">Abbrechen</button>
        <button type="button" class="primary" id="import-confirm">Importieren</button>
      </div>
    </dialog>
    <dialog id="reset-dialog">
      <form id="reset-form">
        <h2>Zurücksetzen</h2>
        <p>Wenn du fortfährst, wird der Stand auf der Website ersetzt. Andere Computer laden danach denselben Stand. Ohne die Eingabe von ZURÜCKSETZEN bleibt alles, wie es ist.</p>
        <label>Zur Bestätigung ZURÜCKSETZEN eingeben
          <input id="reset-confirm" name="confirm" autocomplete="off" autocapitalize="characters" spellcheck="false">
        </label>
        <fieldset>
          <legend>Was soll zurückgesetzt werden?</legend>
          <label class="choice">
            <input type="radio" name="mode" value="progress">
            <span><strong>Nur den Lernfortschritt zurücksetzen.</strong> Alle Wörter werden auf Neu gesetzt. Serie, heutiger Fortschritt und Übungsverlauf werden gelöscht. Die Wortliste, eigene Wörter und Bearbeitungen bleiben.</span>
          </label>
          <label class="choice">
            <input type="radio" name="mode" value="all">
            <span><strong>Alles auf den PDF-Stand zurücksetzen.</strong> Der Lernfortschritt wird gelöscht. Die Wortliste wird wieder durch die 1397 ursprünglichen Einträge ersetzt. Eigene Wörter und Bearbeitungen gehen dabei verloren.</span>
          </label>
        </fieldset>
        <div class="dialog-actions">
          <button type="button" id="reset-cancel">Abbrechen</button>
          <button type="submit" class="danger" id="reset-confirm-btn" disabled>Zurücksetzen</button>
        </div>
      </form>
    </dialog>
  `;
}

export function bindSettings(ctx) {
  const { actions, state } = ctx;
  let pending = null;
  document.getElementById("save-goal").addEventListener("click", () => {
    actions.setGoal(document.getElementById("goal").value);
  });
  document.getElementById("goal").addEventListener("change", (event) => actions.setGoal(event.target.value));
  document.getElementById("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportPayload(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alltagsvokabeln-${localDate()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
  const fileInput = document.getElementById("import-file");
  const importDialog = document.getElementById("import-dialog");
  const error = document.getElementById("import-error");
  document.getElementById("import-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    error.hidden = true;
    if (!file) return;
    if (file.size > 3_000_000) {
      error.hidden = false;
      error.textContent = "Die Datei ist zu groß.";
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      pending = stateFromImport(data);
    } catch (err) {
      pending = null;
      error.hidden = false;
      error.textContent = err instanceof SyntaxError ? "Die Datei ist kein gültiges JSON." : err.message;
      return;
    }
    importDialog.showModal();
  });
  document.getElementById("import-cancel").addEventListener("click", () => {
    pending = null;
    importDialog.close();
  });
  document.getElementById("import-confirm").addEventListener("click", () => {
    if (!pending) return;
    const next = pending;
    pending = null;
    importDialog.close();
    actions.replaceState(next);
  });
  document.getElementById("forget").addEventListener("click", () => actions.forgetAccess());

  const resetDialog = document.getElementById("reset-dialog");
  const resetForm = document.getElementById("reset-form");
  const confirmInput = document.getElementById("reset-confirm");
  const confirmButton = document.getElementById("reset-confirm-btn");
  const syncReset = () => {
    const mode = resetForm.querySelector("input[name=mode]:checked");
    confirmButton.disabled = confirmInput.value !== "ZURÜCKSETZEN" || !mode;
  };
  document.getElementById("open-reset").addEventListener("click", () => {
    resetForm.reset();
    confirmButton.disabled = true;
    resetDialog.showModal();
    confirmInput.focus();
  });
  document.getElementById("reset-cancel").addEventListener("click", () => resetDialog.close());
  confirmInput.addEventListener("input", syncReset);
  resetForm.addEventListener("change", syncReset);
  resetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const mode = resetForm.querySelector("input[name=mode]:checked")?.value;
    if (confirmInput.value !== "ZURÜCKSETZEN" || (mode !== "progress" && mode !== "all")) return;
    resetDialog.close();
    actions.reset(mode);
  });
}
