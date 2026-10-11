# The Box OS — Phase 7O.17.3

## Notes sidebar collapse

This release adds a compact collapse button beside **All notes** in the Notes app, and a restore button in the note editor when the sidebar is collapsed.

### Changes
- Hide the notes list to increase writing space without closing the Notes app.
- Restore the notes list with a single button.
- Store the collapsed/expanded preference locally per device using `the-box-notes-list-collapsed`.
- Support Windows/desktop, tablet, mobile, and narrow/compact window layouts.
- Maintain existing note content, selection, scrolling behavior, and Supabase syncing.
- Update app asset query parameters and service-worker cache name to 7O.17.3.

### Files included / modified
- `index.html` — accessible collapse and restore controls; cache-busting asset URLs
- `app.js` — toggle behavior, preference persistence, event listeners, release version
- `style.css` — control styling, responsive layout, accessibility details
- `service-worker.js` — updated offline cache name
- `README.md` — these release notes

### Installation / replacement instructions
1. Review and merge the `feature/7o17-3-notes-sidebar-collapse` pull request into `main`, after confirming the behavior.
2. Allow GitHub Pages to deploy the new commit (if your site is hosted there).
3. Reload The Box; on an installed PWA, close and reopen the app or refresh once to load the new service-worker cache.
4. Open **Notes**, then use **‹** beside **All notes** to collapse and **›** in the editor to expand.

### Testing checklist
- [ ] Desktop/Windows: collapse and expand while editing a selected note
- [ ] Honor tablet layout: repeat in both normal and compact windows
- [ ] iPhone/mobile layout: verify scrolling and the full-width editor
- [ ] Reload: verify the same-device collapsed/expanded preference survives
- [ ] Verify notes, sticky notes, and cloud sync are unchanged

No paid services or APIs are introduced. The notes toggle never deletes or rewrites note data.
