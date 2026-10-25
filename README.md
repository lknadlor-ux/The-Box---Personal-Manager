# The Box OS — 7O.18.6

Current update: **Notes Pro save reliability**.

## What changed
- Edits to an open note are saved to browser storage immediately, before the existing delayed screen refresh. This reduces the chance of losing the most recent typed text when a tab closes, refreshes, or starts cloud hydration during the former 450 ms gap.
- Cloud writes remain batched using the existing Supabase Notes queue; this update does **not** add write requests for every keypress.
- The Notes status now distinguishes **Saved locally · cloud sync pending**, **Synced**, **Saved locally**, and **Save failed · browser storage unavailable**.
- Notes status is refreshed after a successful cloud acknowledgment for the current data, rather than implying that local timer completion means cloud sync.
- Added a repeatable regression check for immediate local persistence, delayed UI refresh, offline status, cloud acknowledgment, and storage failure.
- No new apps, paid services, dependencies, database tables, or changes to note formatting, attachments, folders, sticky-note positions, or scrolling.

## Files modified / included
- `app.js` — immediate local save and accurate Notes sync status, release label.
- `index.html` — new app.js asset cache-busting version.
- `service-worker.js` — PWA cache version bump.
- `tests/notes-save-reliability.cjs` — new repeatable regression test.
- `README.md` — current release notes and update instructions.
- Existing `tests/notes-pro-data-smoke.cjs` remains unchanged.

## Installation / replacement
1. Review and merge the pull request for `fix/7o18-6-notes-save-feedback` into `main`.
2. Let the existing GitHub Pages deployment publish `main` (if GitHub Pages is enabled).
3. Refresh the website or close/reopen installed PWAs. If an old Notes status persists, reload once to pick up the refreshed service-worker cache.
4. Type in a noncritical note, confirm **Saved locally · cloud sync pending**, and check for **Synced** when Supabase acknowledges the current data.
5. Confirm existing folders, Archive, Trash, private Documents Vault attachments and Windows/tablet/mobile layouts continue to work.

## Tests
Run from the repository root (Node.js required):

```bash
node tests/notes-pro-data-smoke.cjs
node tests/notes-save-reliability.cjs
```

These are local code regression tests, **not** full live-device or Supabase integration tests. Real-world sign-in, upload, cross-device conflict, and offline reconnect behavior should still be checked before relying on Notes for irreplaceable information.

## Existing Notes Pro functionality retained (7O.18.1–5)
- Markdown-style formatting and preview, editable inline checklists.
- Folders and pinned notes, Archive and Trash recovery.
- Private attachment upload/link through the existing Supabase Documents Vault (25 MB app limit/file), using on-demand signed links.
- Notes payload backward compatibility and pending-edit sync safeguards.
- Separate sticky-note arrangements and responsive Notes scroll behavior.

**Cost:** No new paid services. Existing Supabase free-tier limits still apply. JSON backups contain Vault attachment references, not underlying file bytes.
