# The Box OS — Phase 7O.18.7: Notes Sync Safety

A focused **reliability-only** release. No new apps, editor features, paid dependencies, database changes, or visual layout changes.

## Confirmed issues fixed
1. **Stale cloud hydration on account switching:** An in-flight cloud load for account A could apply its response after account B signed in. This was reproduced with a delayed-response mock. Cloud hydration now records the requesting user and a sequence number, discarding responses when the signed-in account changes, the user signs out, or a newer cloud load begins.
2. **Pending Notes never retried automatically after a failed offline write:** Previously, pending Notes synced only after another edit, manual sync, or a new auth event. On browser reconnection, a Notes-only check now fetches the latest remote Notes payload before invoking the existing local/remote merge. It does not blindly overwrite newer cloud changes with the stale local JSON.

## How data is protected
- Existing per-note timestamp, folder, and permanent-deletion tombstone reconciliation remains unchanged.
- Reconnect is skipped if no unsynced Notes exist, no user is signed in, or local Notes belong to another recorded account.
- Reconnect discards stale responses if the account changes or a newer reconnect request begins.
- Network/database errors leave pending Notes intact for a future attempt. No background polling or new paid service is added.
- Notes content format, sticky-note positions, private Vault references, storage schema, and manual backup format are unchanged.

## Changed and included files
- `cloud.js` — guarded cloud hydration and remote-first pending Notes reconciliation on the browser's online event.
- `service-worker.js` — new offline cache ID for deployment of updated sync code.
- `tests/notes-hydration-race.cjs` — regression tests for switching accounts, logout, and overlapping hydrations.
- `tests/notes-reconnect-race.cjs` — regression tests for pending notes, remote-first fetch, user identity, error behavior, and overlapping reconnects.
- `README.md` — these changes, test instructions, and installation instructions.

Existing `app.js`, `index.html`, `style.css`, `tests/notes-pro-data-smoke.cjs`, and `tests/notes-save-reliability.cjs` remain unchanged.

## Installation / replacement
1. Review the Phase 7O.18.7 pull request on GitHub and merge to `main` only after checks pass.
2. Let the normal GitHub Pages build/deployment complete if the app is hosted there.
3. Refresh The Box on Windows, Honor Pad, and iPhone. Reopen the installed PWA if needed so the service worker updates its cached scripts.
4. Create a noncritical note, disconnect the device, edit it, and reconnect. Confirm that the latest note remains present and the sync status eventually updates.
5. When testing multiple accounts, verify that one account never displays another account's Notes.

## Regression tests
Run with Node.js from repository root:

```bash
node tests/notes-pro-data-smoke.cjs
node tests/notes-save-reliability.cjs
node tests/notes-hydration-race.cjs
node tests/notes-reconnect-race.cjs
```

The tests use mocks and require no credentials. **They are not a substitute for live cross-device or Supabase end-to-end testing.** Keep a backup before testing with important Notes. Files linked in Notes remain in the private Documents Vault; the JSON Notes backup saves attachment references, not the Vault file bytes.

**Cost:** No paid APIs or additional service dependencies. Existing Supabase free-tier usage limits continue to apply.
