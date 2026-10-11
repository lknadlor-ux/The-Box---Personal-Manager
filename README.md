# The Box OS — Phase 7O.17.5

## Notes layout and scroll hotfix

Fixes the Notes window layout after the 7O.17.4 formatting toolbar addition, specifically when the formatting row pushes the writing area below the visible app window.

### Changes
- Make the Notes workspace grow to the actual editor height so the Notes window has a working vertical scrollbar.
- Remove editor-panel clipping, preserving access to the note input box and Delete note footer.
- Compress the top hero/counters and keep New note, Reset sticky layout, and Search compact on one desktop/tablet row.
- Use a two-column actions row plus full-width search on narrow, compact and phone windows.
- Keep the notes list scrollable with a limited height on small devices.
- Respect mobile bottom safe areas, including dock overlap.
- Preserve 7O.17.3 sidebar collapse and 7O.17.4 formatting toolbar, Edit/Preview, checklist and note syncing.
- Refresh CSS version and service-worker cache to load the fix in installed PWAs.

### Files modified
- `style.css` — focused CSS overrides for Notes responsive sizing and scroll ownership.
- `index.html` — updated asset query parameters from 7o17-4 to 7o17-5.
- `service-worker.js` — new offline cache identifier.
- `README.md` — release notes and installation instructions.

### Installation / replacement
1. Merge the `fix/7o17-5-notes-layout-scroll` pull request into `main`.
2. Wait for the GitHub Pages deployment (if configured).
3. Refresh the browser, or close and reopen The Box installed PWA.
4. Open Notes and try scrolling from the header all the way to the writing field and footer.
5. Check compact, maximized, tablet, phone, expanded and collapsed sidebar modes.

### Test checklist
- [ ] Notes editor text field can be reached and scrolled to on a 838×638 window.
- [ ] Notes editor and footer do not overlap or get clipped.
- [ ] Hero/counters and action row no longer use unnecessary vertical space.
- [ ] Notes list and main page remain independently scrollable where needed.
- [ ] Edit/Preview and checklist buttons still work.
- [ ] Sidebar collapsed mode expands editor full width.
- [ ] Phone view remains scrollable with a visible text field and bottom action.
- [ ] Existing notes remain unchanged.

No changes to note data, Supabase, storage schema or paid services.
