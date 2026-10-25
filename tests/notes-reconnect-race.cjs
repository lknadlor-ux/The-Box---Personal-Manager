/* Notes Pro 7O.18.7: pending-sync reconnection regression.
   Run: node tests/notes-reconnect-race.cjs
   Uses only Node.js built-ins. All cloud calls are mocked. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cloud = fs.readFileSync(path.join(__dirname, "..", "cloud.js"), "utf8");
new Function(cloud);
const start = cloud.indexOf("  async function reconcilePendingNotesOnReconnect() {");
const end = cloud.indexOf("  function createUuid()", start);
assert.ok(start >= 0 && end > start, "Notes reconnect implementation present");

function createHarness({ pending = "1", owner = "A" } = {}) {
  const local = { theBoxOSNotesPendingSync: pending, theBoxOSNotesOwnerId: owner };
  const requests = [];
  const hydration = [];
  const emissions = [];
  let account = "A", ready = true, cleared = 0;
  const client = {
    from(table) {
      assert.equal(table, "notes");
      const request = { userId: "", resolve: null };
      const chain = {
        select(column) { assert.equal(column, "content"); return chain; },
        eq(column, value) {
          assert.equal(column, "user_id");
          request.userId = value;
          return chain;
        },
        maybeSingle() {
          requests.push(request);
          return new Promise(resolve => { request.resolve = resolve; });
        }
      };
      return chain;
    }
  };
  const build = new Function(
    "client", "localStorage", "isReady", "emit", "clearTimeout", "window",
    'let session = {user: {id: "A"}}; let noteTimer = 33; let notesReconnectSequence = 0;\n' +
    cloud.slice(start, end) +
    '\nreturn { run: reconcilePendingNotesOnReconnect, switchAccount(value) { session = value ? {user:{id:value}} : null; }};'
  );
  const test = build(
    client,
    { getItem: key => local[key] || null },
    () => ready,
    (state, text) => emissions.push({state, text}),
    () => { cleared++; },
    { BoxOSCloudHydrate: x => hydration.push(x) }
  );
  return {
    ...test, requests, hydration, emissions, local,
    setReady(value) { ready = value; },
    get clears() { return cleared; }
  };
}

(async () => {
  // An online event with no pending changes should not call Supabase.
  let h = createHarness({ pending: "0" });
  assert.equal((await h.run()).skipped, true);
  assert.equal(h.requests.length, 0);

  // Reconnect must fetch remote notes before invoking the merge/hydration path.
  h = createHarness();
  let request = h.run();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].userId, "A");
  assert.equal(h.hydration.length, 0);
  assert.equal(h.clears, 1);
  h.requests[0].resolve({data:{content:"cloud-newer"},error:null});
  await request;
  assert.deepEqual(h.hydration, [{notes:"cloud-newer",notesUserId:"A"}]);

  // No note row yet: the existing app merge path receives an empty remote copy.
  h = createHarness();
  request = h.run();
  h.requests[0].resolve({data:null,error:null});
  await request;
  assert.deepEqual(h.hydration, [{notes:"",notesUserId:"A"}]);

  // Never merge a local snapshot explicitly owned by a different account.
  h = createHarness({ owner: "different-user" });
  assert.equal((await h.run()).skipped, true);
  assert.equal(h.requests.length, 0);

  // Account switch while the request is running discards its result.
  h = createHarness();
  request = h.run();
  h.switchAccount("B");
  h.requests[0].resolve({data:{content:"A-private"},error:null});
  assert.equal((await request).stale, true);
  assert.equal(h.hydration.length, 0);

  // Slower first request cannot overwrite a later completed one.
  h = createHarness();
  const first = h.run();
  const second = h.run();
  h.requests[1].resolve({data:{content:"latest"},error:null});
  await second;
  h.requests[0].resolve({data:{content:"stale"},error:null});
  assert.equal((await first).stale, true);
  assert.deepEqual(h.hydration, [{notes:"latest",notesUserId:"A"}]);

  // Network/database errors preserve pending data for a later attempt.
  h = createHarness();
  request = h.run();
  h.requests[0].resolve({data:null,error:{message:"network unavailable"}});
  assert.equal((await request).error.message, "network unavailable");
  assert.equal(h.local.theBoxOSNotesPendingSync, "1");
  assert.equal(h.hydration.length, 0);
  assert.ok(h.emissions.some(e => e.state === "error"));

  // A user signing out mid-reconnect must not hydrate past account data.
  h = createHarness();
  request = h.run();
  h.switchAccount(null);
  h.setReady(false);
  h.requests[0].resolve({data:{content:"private"},error:null});
  assert.equal((await request).stale, true);
  assert.equal(h.hydration.length, 0);

  assert.ok(cloud.includes('window.addEventListener("online"'), "Browser reconnect hook installed");
  console.log("Notes reconnect race tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
