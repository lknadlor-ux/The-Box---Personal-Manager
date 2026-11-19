# The Box OS — Phase 7O.18.9: Desktop readability

Desktop labels previously used many fixed 7–11px sizes. Small fixed font sizes now respect a 0.875rem (14px at default browser settings) desktop floor. Paragraphs and writing/search fields use a 1rem floor. Existing larger headings retain their size. Muted and secondary text have stronger contrast in both themes.

The floor is disabled in phone and tablet modes, including manual mode selection. Dashboard sections no longer shrink and clip when text takes more space; the window scrolls. The service-worker cache version is updated for installation after merge.

Validation: inspected Dashboard and Notes in a desktop browser preview, checked light and dark themes, confirmed Notes paragraph/search/editor sizes of 16px and labels of 14px, and verified the floor is absent in manual tablet/mobile modes. Physical monitor readability, other screen sizes, and every populated workspace still need hands-on review. No app logic, cloud sync, or data format changed.

---

# The Box OS — Phase 7O.18.8: Stability Audit

**Scope:** Audit existing Notes Pro offline/sync behavior and fix only confirmed defects. No new features, paid APIs, dependencies, storage migrations, or UI redesign.

## Audit results

The existing 7O.18.7 Notes Pro smoke, save reliability, account hydration, and offline reconnect regression suites passed. The audit identified **one reproducible data-loss risk**:

**Manual Sync Now could overwrite a newer cloud Notes copy with stale local data.** The original sync path sent the locally stored Notes JSON to Supabase without reading the current remote Notes row first. A mocked demonstration confirmed an outdated local copy was sent unconditionally even when a newer remote copy existed.

## 7O.18.8 correction

- The manual Notes sync path now **reads the remote Notes row first**, checking the signed-in account throughout.
- With no pending local edits, it hydrates a different cloud copy rather than uploading stale Notes.
- With pending local edits, it invokes the existing Notes Pro per-note updatedAt / deletion-tombstone merger, then writes the merged result through the ordered note-write queue.
- With no remote row, it retains existing first-time upload behavior for the current user's local Notes.
- If the saved Notes belong to another user, the account changes during the fetch, or Supabase reports an error, the Notes write is stopped and the failure is reported.
- Already queued note writes are canceled before a manual remote read, preventing an older queued snapshot from racing the manual reconciliation.
- All other app modules continue to use their existing sync behavior. No changes were made to Notes UI, CSS, documents, storage format, or Supabase schema.

## Modified and included files

- `cloud.js` — remote-first, account-aware **manual** Notes synchronization.
- `tests/notes-manual-sync-safety.cjs` — new repeatable regression tests.
- `service-worker.js` — refresh the offline PWA cache to deliver the changed cloud script.
- `README.md` — this release audit and installation/replacement instructions.

Unchanged: `app.js`, `index.html`, `style.css`, previous `tests/notes-*.cjs`, Supabase configuration/schema, Notes data/attachment formats.

## Installation / replacement instructions

1. Review the 7O.18.8 pull request targeting `main`, then merge it only after regression checks.
2. Wait for GitHub Pages to publish the updated `main`, if configured.
3. Reload The Box, or close and reopen its installed PWA on Windows, Honor Pad, and iPhone to refresh its service-worker cache.
4. Back up Notes, then test using a disposable note. On one signed-in device, update that note and synchronize it. On another device, start with an older local copy and use **Sync Now**; confirm the latest note remains intact.
5. Test manual Sync Now after making a separate offline edit on each device, and verify the merged notes and archive/trash status. Do not deliberately corrupt irreplaceable Notes during testing.

## Automated regression checks

Run from repository root with Node.js:

```bash
node tests/notes-pro-data-smoke.cjs
node tests/notes-save-reliability.cjs
node tests/notes-hydration-race.cjs
node tests/notes-reconnect-race.cjs
node tests/notes-manual-sync-safety.cjs
```

All five suites passed in a JavaScript mocked runtime (**145 assertions**). These tests cannot verify physical-device UI, a real Supabase account, or live GitHub Pages deployment.

**Remaining limitations:** Notes are still stored as one Supabase JSON payload and resolve concurrent changes by per-note timestamps rather than a transactional multi-device server merge. Simultaneous edits to the *same* note from two devices can therefore still require care. Manual synchronization for other collections retains its prior behavior and should be audited separately if data-loss reports arise.

**Cost:** No new paid dependencies; existing Supabase free-tier limits still apply.
