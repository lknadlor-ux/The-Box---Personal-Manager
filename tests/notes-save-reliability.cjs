/* Notes 7O.18.6 save reliability regression.
   Run: node tests/notes-save-reliability.cjs
   Uses only Node.js built-in modules; no network, browser or database required. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
new Function(app); // The complete app must remain valid JavaScript.
const begin = app.indexOf("function updateNotesSaveStatus() {");
const end = app.indexOf("function deleteSelectedNoteItem() {", begin);
assert.ok(begin > 0 && end > begin, "Save functions present");
const saved = {};
const fields = {
  noteTitle: { value: "Safe title" },
  noteContent: { value: "- [x] Check this" },
  noteSticky: { checked: false },
  noteEditorMode: { textContent: "" },
  noteEditorHeading: { textContent: "" },
  noteStatus: { textContent: "" },
  notesInlineChecklist: { contains: () => false }
};
const note = { id: "n1", title: "Old", content: "Old body", sticky: false, updatedAt: "" };
let ready = true;
let failSave = false;
let saveCount = 0;
let refreshCount = 0;
let queuedUI = null;
const fakeStorage = {
  getItem(key) { return saved[key] ?? null; },
  setItem(key, value) { saved[key] = String(value); },
  removeItem(key) { delete saved[key]; }
};
const deps = {
  $: id => fields[id],
  getSelectedNoteItem: () => note,
  isStickyNoteLockedForCurrentMode: () => false,
  localStorage: fakeStorage,
  STORAGE: { notes: "notes", notesPendingSync: "pending" },
  window: { BoxCloud: { isReady: () => ready } },
  persistNoteItems: () => {
    if (failSave) throw new Error("quota exceeded");
    saveCount++;
    saved.notes = JSON.stringify(note);
    saved.pending = "1";
  },
  updateNoteEditorMeta: () => {},
  renderNotesInlineChecklist: () => {},
  document: { activeElement: null },
  clearTimeout: () => {},
  setTimeout: cb => { queuedUI = cb; return 1; },
  renderNotesList: () => { refreshCount++; },
  renderDesktopStickyNotes: () => {},
  renderDashboard: () => {},
  renderIfAppOpen: () => {},
  renderFavoritesHub: () => {},
  renderActivityTimeline: () => {},
  renderNotesEditor: () => {},
  timer: null
};
const keys = Object.keys(deps).filter(x => x !== "timer");
const module = new Function(...keys, "let noteSaveTimer = null;\n" + app.slice(begin, end) +
  "\nreturn { updateSelectedNoteFromEditor, updateNotesSaveStatus };");
const actions = module(...keys.map(key => deps[key]));

// The user's text is durable even when the delayed UI timer has not run.
actions.updateSelectedNoteFromEditor();
assert.equal(saveCount, 1, "Stored synchronously");
assert.equal(JSON.parse(saved.notes).content, "- [x] Check this");
assert.equal(JSON.parse(saved.notes).title, "Safe title");
assert.equal(refreshCount, 0, "UI refresh remains deferred");
assert.equal(fields.noteStatus.textContent, "Saved locally · cloud sync pending");
assert.equal(typeof queuedUI, "function");
queuedUI();
assert.equal(refreshCount, 1, "Deferred list refresh still works");

// Cloud acknowledgment should be reflected accurately.
fakeStorage.removeItem("pending");
actions.updateNotesSaveStatus();
assert.equal(fields.noteStatus.textContent, "Synced");

// The app must not claim a cloud sync when offline.
ready = false;
actions.updateNotesSaveStatus();
assert.equal(fields.noteStatus.textContent, "Saved locally");

// Storage failure stays visible and cannot be mislabeled as saved.
queuedUI = null;
failSave = true;
actions.updateSelectedNoteFromEditor();
assert.equal(fields.noteStatus.textContent, "Save failed · browser storage unavailable");
assert.equal(queuedUI, null);
assert.equal(saveCount, 1, "No successful additional write");
console.log("Notes 7O.18.6 save reliability checks passed.");
