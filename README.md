# The Box OS — Notes Pro Phase 7O.18.3–5

**Review branch:** `feature/7o18-3-notes-vault-sync`, stacked on `feature/7o18-1-notes-inline-folders`.

## Changes
- Allow signed-in users to upload images, PDF, Word, Excel, text and other documents into the **existing private Supabase Documents Vault**, up to the existing Vault limit of 25 MB per file, maximum five uploads per click.
- Link existing Vault documents to notes without copying file bytes to the Notes JSON payload. Notes store document ID, name, MIME type and size only.
- Open attachments only by looking them up within the current signed-in user's Vault catalog, then requesting a short-lived signed URL. Never store or publish signed URLs.
- Unlinking a file from a note does not delete the source Vault file; archiving/Trash/deleting notes also leaves Vault files intact.
- Cache the current user's Vault catalog briefly and clear it when the authenticated user changes.
- Retain local pending-note edits when offline and merge them by updated timestamp with cloud records when the **same account** reconnects; use folder tombstones and purged-note tombstones so remote copies do not revive deleted records.
- Preserve an additional pre-hydration snapshot locally as a recovery aid before cloud notes replace changed local notes (when browser storage permits).
- Serialize note writes to prevent slow network requests from overtaking later edits, and only clear pending-sync status after the current payload is acknowledged.
- Keep all previous 7O.18.1–2 features (inline checklists, folders, pinned, archive, Trash), prior sticky-note layouts, Markdown support, and 7O.17.5 scroll fixes.
- No new paid APIs, subscription services or Supabase database tables.

## Files in this PR
- `index.html` — private Vault upload and document picker, asset versions.
- `app.js` — link/unlink, upload, attachment management, pending-sync merger, tombstones and snapshot.
- `cloud.js` — ordered notes writes and sync acknowledgment.
- `style.css` — responsive attachment list/actions.
- `service-worker.js` — offline cache bump.
- `README.md` — this changelog and installation instructions.

## Merge / installation sequence
1. **First review PR #4** (`feature/7o18-1-notes-inline-folders`) and this stacked second PR. Do not merge either until you have reviewed them and are ready to update all devices.
2. Merge PR #4 into `main`, then rebase/change this PR's base to `main` and merge it after final CI/manual checks. Do not merge the stacked PR into `main` before the first PR.
3. Make a Notes backup on an existing device before updating, and ensure installed PWAs on Windows/Honor Pad/iPhone all update to the new version. Old clients can strip new metadata if they sync.
4. Allow GitHub Pages to publish, refresh the app, and reopen installed PWAs to update service-worker cached scripts.
5. Sign in to Supabase. Open Notes, choose a note, attach an existing Vault file, upload another file, open it, and unlink it. Confirm both files remain in Documents Vault.
6. Check folder/archiving, sticky notes, inline checklist, backups, and offline reconnection.

## Repeatable automated checks
Run `node tests/notes-pro-data-smoke.cjs` from the repository root. The test uses only built-in Node.js modules and checks backward-compatible note decoding, folder and file references, conflict merging, permanent-deletion tombstones, required controls and cloud sync guard structure.

## Verification checklist
- [ ] Existing legacy notes load and roundtrip correctly, including note IDs, titles, content, sticky positions and timestamps.
- [ ] All Notes views and folders work in Windows/tablet/phone.
- [ ] Live checklist toggles and edits persist through reload.
- [ ] Private Vault attachments open only when signed in, using signed links.
- [ ] Uploading a document saves to private Vault; unlinking does not delete it.
- [ ] Note Trash/permanent deletion does not delete private Vault files.
- [ ] Cloud reconnection reconciles newer pending local notes and newer remote notes.
- [ ] Switching cloud accounts does not merge unsynced notes from an unrelated account.
- [ ] Backups contain notes and their attachment **references**; actual Vault file bytes remain in Supabase storage and are **not** included in JSON backups.
- [ ] View-mode switching, sidebar collapse and window scrolling still work after formatting and attachment expansion.

## Constraints and privacy
All features use existing browser capabilities and the current private Supabase setup. Current Supabase free-plan storage, bandwidth, API quotas and inactivity limits still apply. Attachments require authentication and network access; local-only/offline attachment upload is not enabled.

**Do not treat static tests alone as device-level or end-to-end validation.** Test with a noncritical note and private Vault file before storing irreplaceable data.
