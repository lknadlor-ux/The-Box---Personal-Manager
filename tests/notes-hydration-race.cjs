/* Notes Pro 7O.18.7: cloud hydration race regression.
   Run: node tests/notes-hydration-race.cjs
   No external packages and no Supabase credentials required. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const code = fs.readFileSync(path.join(__dirname, "..", "cloud.js"), "utf8");
new Function(code);
const start = code.indexOf("  async function hydrateFromCloud() {");
const end = code.indexOf("  async function syncNow()", start);
assert.ok(start >= 0 && end > start, "Hydration routine present");
const source = code.slice(start, end);
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function createHarness() {
  const gates = [deferred(), deferred(), deferred()];
  const hydrated = [];
  let batch = -1;
  let loggedIn = true;
  let errors = 0;
  const accountNotes = { A: "notes from A", B: "notes from B" };
  const fetchCollection = table => {
    if (table === "tasks") batch++;
    const chosen = batch;
    return gates[chosen].promise.then(() => ({ data: [], error: null }));
  };
  const client = {
    from(table) {
      let targetUserId = "";
      const chain = {
        select() { return chain; },
        eq(field, val) { if (field === "user_id") targetUserId = val; return chain; },
        order() { const gate = gates[batch]; return gate.promise.then(() => ({ data: [], error: null })); },
        maybeSingle() {
          const gate = gates[batch];
          return gate.promise.then(() => ({
            data: { content: accountNotes[targetUserId] }, error: null
          }));
        }
      };
      return chain;
    }
  };
  const environment = new Function(
    "client", "fetchCollection", "emit", "isReady", "window", "syncNow",
    "TEMPLATE_SELECT", "JOURNAL_SELECT", "OUR_SPACE_SELECT", "localStorage",
    'let session = { user: { id: "A" } }; let cloudHydrationSequence = 0;\n' +
    source + '\nreturn { run: hydrateFromCloud, setUser(id) { session = id ? { user: { id } } : null; } };'
  )(
    client, fetchCollection, (state) => { if (state === "error") errors++; },
    () => loggedIn,
    { BoxOSCloudHydrate(data) { hydrated.push(data); } },
    async () => ({ error: null }), "", "", "",
    { getItem: () => "", setItem: () => {} }
  );
  return {
    ...environment, hydrated, gates,
    logOut() { loggedIn = false; environment.setUser(null); },
    get errors() { return errors; }
  };
}
(async () => {
  // Same account, one valid cloud hydration succeeds.
  let t = createHarness();
  let op = t.run();
  t.gates[0].resolve();
  await op;
  assert.equal(t.hydrated.length, 1);
  assert.equal(t.hydrated[0].notesUserId, "A");
  assert.equal(t.hydrated[0].notes, "notes from A");

  // Old A query must never hydrate the freshly signed-in B account.
  t = createHarness();
  const old = t.run();
  t.setUser("B");
  const newer = t.run();
  t.gates[0].resolve();
  const stale = await old;
  assert.equal(stale.stale, true, "Old-account response identified as stale");
  assert.equal(t.hydrated.length, 0, "Old-account notes not applied");
  t.gates[1].resolve();
  await newer;
  assert.deepEqual(t.hydrated.map(data => data.notesUserId), ["B"]);
  assert.deepEqual(t.hydrated.map(data => data.notes), ["notes from B"]);

  // Same user, slower first response must not overwrite the latest response.
  t = createHarness();
  const first = t.run();
  const second = t.run();
  t.gates[1].resolve();
  await second;
  t.gates[0].resolve();
  assert.equal((await first).stale, true);
  assert.equal(t.hydrated.length, 1);
  assert.equal(t.hydrated[0].notesUserId, "A");

  // Logging out while fetch is in flight must discard the old result.
  t = createHarness();
  op = t.run();
  t.logOut();
  t.gates[0].resolve();
  assert.equal((await op).stale, true);
  assert.equal(t.hydrated.length, 0);
  assert.equal(t.errors, 0);

  console.log("Notes Pro hydration race regression passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
