# The Box OS — Phase 7O.18.1–2 (Notes Pro: Editor and Folders)

## Changes
- Live, editable checklist rows appear in Edit mode for checklist items already in a note. Check and uncheck items without switching to Preview; text can also be changed in the checklist rows.
- Library views: All active notes, Pinned, Archive and Trash.
- Organize notes into optional folders; create, rename and remove folders. Removing a folder unfiles its notes instead of deleting them.
- Pin notes independently from existing desktop Sticky status.
- Archive and restore individual notes.
- Move notes to Trash and permanently delete only after separate confirmation; Vault files are never removed when a note is deleted.
- Preserves existing Markdown formatting, plain-text editor, collapsible sidebar and desktop sticky notes.
- Extends existing `the-box-notes-v2` JSON payload to version 3 with additional optional fields; old notes normalize with empty defaults, without changing the Supabase notes table.
- Respects the existing 7O.17.5 scrolling fixes for desktop, Honor Pad/tablet, and phone modes.

## Modified files
- `app.js` — additive note metadata, library and folder management, archive/Trash, inline checklist updates, backup release label.
- `index.html` — accessible library/folder controls, editor options, live checklist region, versioned assets.
- `style.css` — scoped responsive Notes Pro styles.
- `service-worker.js` — PWA cache version.
- `README.md` — this changelog and installation instructions.

## Installation / review
1. Review PR targeting `main` from `feature/7o18-1-notes-inline-folders`.
2. Do not merge until legacy note backups and browser/device behavior have been checked.
3. When merged, wait for GitHub Pages deployment, refresh/reopen installed PWAs, then open Notes.
4. Test the new library view, folder creation, archive/restore, Trash/restore, and inline checklist controls.
5. Ensure all devices run Notes Pro before editing notes across devices: older app versions can strip new metadata if they sync.

## Test checklist
- [ ] Existing notes load with titles, contents, sticky layouts and timestamps unchanged.
- [ ] Clickable checkboxes update the text, and checklist text edits save.
- [ ] Create/rename/remove folders without deleting notes.
- [ ] Archive/restore and Trash/restore individual notes, including sticky notes.
- [ ] Existing sticky dashboard and desktop widgets ignore archived/trash notes.
- [ ] Cloud sync roundtrip and backup export/import preserve folder names and status.
- [ ] Windows, tablet, and phone Notes scrolling remains usable.

No paid dependencies or third-party editor packages. No DB migration is needed for this phase.
