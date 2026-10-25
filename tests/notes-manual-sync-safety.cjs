/* The Box OS 7O.18.8 — manual Notes sync safety regression.
 * Run: node tests/notes-manual-sync-safety.cjs
 * No network access, accounts, or third-party packages required.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const code = fs.readFileSync(path.join(__dirname, "..", "cloud.js"), "utf8");
new Function(code);
const start = code.indexOf("  async function syncNotesNowSafely() {");
const end = code.indexOf("  async function syncNow() {", start);
const syncStart = end;
const syncEnd = code.indexOf("  async function start()", syncStart);
assert.ok(start > 0 && end > start && syncEnd > syncStart, "Notes safe sync and manual entry found");
assert.ok(code.slice(syncStart, syncEnd).includes("syncNotesNowSafely()"),
  "Manual Sync Now uses guarded Notes path");
assert.ok(!code.slice(syncStart, syncEnd).includes("writeNoteInOrder(localNotes)"),
  "Manual Sync Now does not blindly push local Notes JSON");

const pack = (items) => JSON.stringify({
  format: "the-box-notes-v2", version: 3, folders: [], purged: [], items
});
const entry = (id, content, updatedAt) => ({ id, title: id, content, updatedAt });
const oldLocal = pack([entry("shared", "local old", "2026-10-01T10:00:00Z")]);
const freshRemote = pack([entry("shared", "remote latest", "2026-10-02T10:00:00Z")]);
const pendingLocal = pack([
  entry("shared", "local newer", "2026-10-03T10:00:00Z"),
  entry("local-only", "keep me", "2026-10-03T10:00:00Z")
]);
const remoteWithOther = pack([
  entry("shared", "remote outdated", "2026-10-02T10:00:00Z"),
  entry("remote-only", "keep too", "2026-10-02T10:00:00Z")
]);

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

function harness({ local = oldLocal, remote = freshRemote, pending = "0",
                   owner = "account-A", error = null, defer = false } = {}) {
  const stored = { theBoxOS4Notes: local, theBoxOSNotesPendingSync: pending,
                   theBoxOSNotesOwnerId: owner };
  const calls = { reads: [], writes: [], hydrations: [], cleared: 0 };
  let user = "account-A";
  let signedIn = true;
  const gate = deferred();
  const client = {
    from(table) {
      assert.equal(table, "notes");
      const state = {};
      const query = {
        select(value) { assert.equal(value, "content"); return query; },
        eq(col, id) {
          assert.equal(col, "user_id");
          state.owner = id;
          return query;
        },
        maybeSingle() {
          calls.reads.push(state.owner);
          if (defer) return gate.promise;
          return Promise.resolve({ data: remote === null ? null : { content: remote }, error });
        }
      };
      return query;
    }
  };
  // Emulates the Notes-only scope of the real BoxOSCloudHydrate entrypoint:
  // no pending => hydrate cloud; pending => reconcile note updatedAt and IDs.
  function hydrate(data) {
    calls.hydrations.push(data);
    const old = JSON.parse(stored.theBoxOS4Notes || pack([]));
    const next = JSON.parse(data.notes || pack([]));
    if (stored.theBoxOSNotesPendingSync !== "1") {
      stored.theBoxOS4Notes = data.notes;
    } else {
      const byId = new Map(next.items.map(item => [item.id, item]));
      old.items.forEach(item => {
        const previous = byId.get(item.id);
        if (!previous || item.updatedAt >= previous.updatedAt) byId.set(item.id, item);
      });
      stored.theBoxOS4Notes = pack(Array.from(byId.values()));
    }
  }
  const fn = new Function(
    "client", "localStorage", "isReady", "window", "clearTimeout", "writeNoteInOrder",
    'let session={user:{id:"account-A"}}; let noteTimer=7;\n' +
    code.slice(start, end) +
    '\nreturn {run: syncNotesNowSafely, setUser(id){session=id?{user:{id}}:null;}};'
  );
  const commands = fn(
    client, { getItem: k => stored[k] || null },
    () => signedIn,
    { BoxOSCloudHydrate: hydrate },
    () => { calls.cleared++; },
    async (payload, expectedOwner) => {
      calls.writes.push({ payload, expectedOwner });
      return { error: null };
    }
  );
  return {
    ...commands, calls, stored, gate, setSignedIn: value => { signedIn = value; }
  };
}

(async () => {
  // Confirmed prior bug: clean local data must never overwrite a newer cloud note.
  let t = harness();
  let result = await t.run();
  assert.equal(result.error, null);
  assert.deepEqual(t.calls.reads, ["account-A"]);
  assert.equal(t.calls.writes.length, 0);
  assert.equal(JSON.parse(t.stored.theBoxOS4Notes).items[0].content, "remote latest");

  // Pending local changes merge with newer/other cloud notes before upload.
  t = harness({local: pendingLocal, remote: remoteWithOther, pending: "1"});
  result = await t.run();
  assert.equal(result.error, null);
  assert.equal(t.calls.hydrations.length, 1);
  assert.equal(t.calls.writes.length, 1);
  assert.equal(t.calls.writes[0].expectedOwner, "account-A");
  const merged = JSON.parse(t.calls.writes[0].payload).items;
  assert.equal(merged.find(item => item.id === "shared").content, "local newer");
  assert.ok(merged.some(item => item.id === "local-only"));
  assert.ok(merged.some(item => item.id === "remote-only"));

  // First-time sync with no server note row uploads current local data.
  t = harness({remote:null});
  result = await t.run();
  assert.equal(result.error, null);
  assert.equal(t.calls.writes.length, 1);
  assert.equal(t.calls.writes[0].payload, oldLocal);

  // Unrelated account must never read or write this device's Notes.
  t = harness({owner:"another-user",pending:"1"});
  result = await t.run();
  assert.ok(result.error);
  assert.equal(t.calls.reads.length, 0);
  assert.equal(t.calls.writes.length, 0);

  // Network failure preserves pending local data, without writing.
  t = harness({pending:"1",error:{message:"temporarily offline"}});
  result = await t.run();
  assert.equal(result.error.message, "temporarily offline");
  assert.equal(t.calls.writes.length, 0);
  assert.equal(t.stored.theBoxOSNotesPendingSync, "1");

  // Account-switch mid-fetch must discard outdated results.
  t = harness({defer:true});
  const pendingFetch = t.run();
  t.setUser("account-B");
  t.gate.resolve({data:{content:freshRemote},error:null});
  result = await pendingFetch;
  assert.ok(result.error);
  assert.equal(t.calls.writes.length, 0);
  assert.equal(t.calls.hydrations.length, 0);

  // Sign-out mid-fetch also must not apply the old data.
  t = harness({defer:true});
  const logoutFetch = t.run();
  t.setSignedIn(false);
  t.setUser(null);
  t.gate.resolve({data:{content:freshRemote},error:null});
  result = await logoutFetch;
  assert.ok(result.error);
  assert.equal(t.calls.writes.length, 0);
  assert.equal(t.calls.hydrations.length, 0);

  console.log("Notes 7O.18.8 manual sync safety checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
