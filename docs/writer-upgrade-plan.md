# Browser writing upgrade

## Completion gate

Implement audit priorities 1 through 8. Writing supports sentence and paragraph focus, typewriter scrolling, quiet mode, saved typography and spelling preferences, and ordinary find and replace. Documents support search, sorting, folders, favorites, trash, and restore. Markdown has a safe rendered preview and HTML, print/PDF, and DOCX output. Navigation includes a document switcher, headings, and shortcut help. Existing recovery, independent undo, offline writing, and optional assistance still work. Run repository checks, exercise the built app, review independently, and deliver to main.

## Workflow

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Ground. Trace editor, persistence, and rendering ownership.
- [x] Sketch. Compare independent designs and select the smallest safe boundary.
- [x] Agree. Autopilot authorizes the implementation choices.
- [x] Implement. Build and verify editor, library, and preview/export units.
- [x] Scrap. Skipped because focused fixes preserved the selected boundaries.
- [x] Integrate app controls and keyboard navigation.
- [x] Verify browser journeys, offline behavior, and narrow layouts.
- [x] Phase D: Keep the audit trail.
- [ ] Phase E: Verify and hand back.
- [ ] Independently review the complete diff, fix findings, and merge to main.

## Throughput checkpoint

Eight product areas share three implementation seams. Editor changes own CodeMirror configuration and undo. Library changes own document metadata and recovery. Preview owns rendering and formatted output. The parent owns app integration, shared controls, end-to-end coverage, and release. Use separate Git worktrees for writers and merge only verified units. All available reviewers inherit the parent model; this is independent review without model-family diversity. Existing tests provide the baseline before feature work.

## Evidence

Baseline commit is `7b5da0c8f6007e0b9cf8c2f9841828c5a13d4d0c`. The checkout was clean. The repository's main branch has no branch-protection configuration. Local evidence lives in `verification-artifacts/writer-upgrade/`. Decisions are recorded in `docs/writer-upgrade-decisions.tsv`.

## Local verification

The full Pages-path verification passed 195 logic and browser tests plus 25 Chromium journeys. The CLI integration checks passed all three cases after adding the new export scenario to their expected count. Independent review found no remaining P1 or P2 defects after fixes. Desktop preview, quiet writing, and mobile settings screenshots were inspected. Native print-dialog acceptance and browser spelling dictionary accuracy are not asserted by the automated checks.

Firefox could not launch on this Mac. Linux CI will provide the cross-browser delivery gate. No production code was changed to bypass that local infrastructure failure.
