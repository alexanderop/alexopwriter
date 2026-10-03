# alexopwriter

Standalone Vue 3 / TypeScript / Vite writing app. Use pnpm and preserve unrelated changes.

- CodeMirror owns live text, selection, and undo in `src/components/DocumentEditor.vue`.
- `src/documents` owns document workflows, disk access, and IndexedDB recovery.
- `src/assistance` owns deterministic checks and optional worker-based local models.
- Vue owns the visible UI; do not add Electron, coding-agent, or publication services.
- Test pure rules and connected workflows with Vitest, editor/IndexedDB behavior in Browser Mode, and built journeys with Playwright.
- Run `pnpm verify` before handing off changes. For Pages changes, run `VITE_BASE_PATH=/alexopwriter/ pnpm verify`. Run `pnpm test:compat` for Chromium and Firefox.
- Real model inference is opt-in: build, then `pnpm test:model`. It downloads model weights.
- GitHub Pages deploys `dist` after successful main-branch verification. Preserve base-path and offline behavior.
