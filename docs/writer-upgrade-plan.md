# Browser writing upgrade

## Completion gate

Implement audit priorities 1 through 8. Writing supports sentence and paragraph focus, typewriter scrolling, quiet mode, saved typography and spelling preferences, and ordinary find and replace. Documents support search, sorting, folders, favorites, trash, and restore. Markdown has a safe rendered preview and HTML, print/PDF, and DOCX output. Navigation includes a document switcher, headings, and shortcut help. Existing recovery, independent undo, offline writing, and optional assistance still work. Run repository checks, exercise the built app, review independently, and deliver to main.

## Workflow

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame.
- [ ] Phase B: Design the workflow.
- [ ] Phase C: Run the loop.
- [ ] Ground. Trace editor, persistence, and rendering ownership.
- [ ] Sketch. Compare independent designs and select the smallest safe boundary.
- [ ] Agree. Autopilot authorizes the implementation choices.
- [ ] Implement. Build and verify editor, library, and preview/export units.
- [ ] Scrap. Revisit the design if recurring implementation conflicts expose a wrong boundary.
- [ ] Integrate app controls and keyboard navigation.
- [ ] Verify browser journeys, offline behavior, and narrow layouts.
- [ ] Phase D: Keep the audit trail.
- [ ] Phase E: Verify and hand back.
- [ ] Independently review the complete diff, fix findings, and merge to main.

## Throughput checkpoint

Eight product areas share three implementation seams. Editor changes own CodeMirror configuration and undo. Library changes own document metadata and recovery. Preview owns rendering and formatted output. The parent owns app integration, shared controls, end-to-end coverage, and release. Use separate Git worktrees for writers and merge only verified units. All available reviewers inherit the parent model; this is independent review without model-family diversity. Existing tests provide the baseline before feature work.

## Evidence

Baseline commit is `7b5da0c8f6007e0b9cf8c2f9841828c5a13d4d0c`. The checkout was clean. The repository's main branch has no branch-protection configuration. Local evidence lives in `verification-artifacts/writer-upgrade/`. Decisions are recorded in `docs/writer-upgrade-decisions.tsv`.
