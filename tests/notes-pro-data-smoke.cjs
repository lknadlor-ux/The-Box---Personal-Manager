/* Notes Pro data regression smoke tests. Run: node tests/notes-pro-data-smoke.cjs */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const cloud = fs.readFileSync(path.join(root, "cloud.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
new Function(app); new Function(cloud);
const start = app.indexOf("function normalizeNoteAttachments");
const end = app.indexOf("function getNotePreview(", start);
assert.ok(start >= 0 && end > start, "Notes model source found");
const factory = new Function(
  "createNoteItemId", "normalizeStickyLayouts", "localStorage", "STORAGE", "window",
  'let noteItems=[],noteFolders=[],notesPurgedItems=[],notesLibraryView="all",' +
  'notesSearchTerm="",selectedNotesFolderId="",selectedNoteId=null;\n' +
  app.slice(start, end) + '\nreturn {' +
  'normalizeNoteItem,normalizeNoteAttachments,normalizeNoteFolders,normalizeNotesPurged,' +
  'decodeNotesPayload,decodeNotesFolders,decodeNotesPurged,mergePendingNotesPayload,' +
  'serializeNotesPayload,getFilteredNoteItems,' +
  'set:(items,folders,purged,view)=>{noteItems=items;noteFolders=folders;notesPurgedItems=purged;notesLibraryView=view||"all";}' +
  '};'
);
const storage = {};
const m = factory(
  () => "id-from-test", (value) => value || {},
  { getItem: (key) => storage[key] || "", setItem: (key, value) => { storage[key] = value; } },
  { notes: "notes" }, { BoxCloud: { isReady: () => false } }
);
const legacy = JSON.stringify({
  format: "the-box-notes-v2", version: 2,
  items: [{ id: "n1", title: "Original", content: "- [ ] Task", sticky: true }]
});
const [old] = m.decodeNotesPayload(legacy);
assert.equal(old.id, "n1");
assert.equal(old.content, "- [ ] Task");
assert.equal(old.sticky, true);
assert.deepEqual(old.attachments, []);
assert.equal(old.folderId, "");
const local = JSON.stringify({
  format: "the-box-notes-v2", version: 3,
  folders: [{ id: "f", name: "Updated folder", updatedAt: "2026-10-14T10:00:00Z" }],
  purged: [{ id: "removed", deletedAt: "2026-10-14T10:00:00Z" }],
  items: [
    { id: "n1", title: "Local newer", content: "- [x] Task",
      updatedAt: "2026-10-14T10:00:00Z",
      attachments: [{ id: "doc", name: "Paper.pdf" }] },
    { id: "local", title: "Local only", updatedAt: "2026-10-14T10:00:00Z" }
  ]
});
const remote = JSON.stringify({
  format: "the-box-notes-v2", version: 3,
  folders: [{ id: "f", name: "Old folder", updatedAt: "2026-10-14T09:00:00Z" }],
  items: [
    { id: "n1", title: "Remote older", updatedAt: "2026-10-14T09:00:00Z" },
    { id: "remote", title: "Remote only", updatedAt: "2026-10-14T09:00:00Z" },
    { id: "removed", title: "Deleted elsewhere", updatedAt: "2026-10-14T11:00:00Z" }
  ]
});
const merged = JSON.parse(m.mergePendingNotesPayload(local, remote));
assert.equal(merged.format, "the-box-notes-v2");
assert.equal(merged.version, 3);
assert.equal(merged.items.find((note) => note.id === "n1").title, "Local newer");
assert.ok(merged.items.some((note) => note.id === "local"));
assert.ok(merged.items.some((note) => note.id === "remote"));
assert.ok(!merged.items.some((note) => note.id === "removed"), "Permanently deleted note not resurrected");
assert.equal(merged.folders[0].name, "Updated folder");
assert.equal(merged.items.find((note) => note.id === "n1").attachments[0].id, "doc");
assert.equal(m.normalizeNoteAttachments([{ id: "same" }, { id: "same" }]).length, 1);
m.set(m.decodeNotesPayload(local), m.decodeNotesFolders(local), m.decodeNotesPurged(local), "all");
assert.equal(m.getFilteredNoteItems().length, 2);
m.set([...m.decodeNotesPayload(local), { ...old, archivedAt: "2026-10-14" }],
  m.decodeNotesFolders(local), [], "archive");
assert.ok(m.getFilteredNoteItems().some((note) => note.id === "n1"));
for (const id of [
  "notesLibraryView", "notesFolderFilter", "noteFolderAssign",
  "notesInlineChecklist", "noteRestoreButton", "notesVaultFilePicker",
  "notesAttachmentUploadButton", "notesAttachmentList"
]) assert.ok(html.includes('id="' + id + '"'), "Missing control: " + id);
assert.ok(css.includes("Phase 7O.17.5"), "Previous scrolling fix retained");
assert.ok(cloud.includes("writeNoteInOrder(text, queuedUserId)"), "Sequential notes writes");
assert.ok(cloud.includes("notesUserId: session.user.id"), "Owner-aware sync");
console.log("Notes Pro regression smoke tests passed.");
