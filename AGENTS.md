# alexopwriter

Standalone Vue 3 / TypeScript / Vite writing app. Use pnpm and preserve unrelated changes.

- CodeMirror owns live text, selection, and undo in `src/features/editor/ui/DocumentEditor.vue`.
- `src/features/documents` owns document workflows, disk access, and IndexedDB recovery.
- `src/features/assistance` owns deterministic checks and optional worker-based local models.
- Vue owns the visible UI; do not add Electron, coding-agent, or publication services.
- Test pure rules and connected workflows with Vitest, editor/IndexedDB behavior in Browser Mode, and built journeys with Playwright.
- Run `pnpm verify` before handing off changes. For Pages changes, run `VITE_BASE_PATH=/alexopwriter/ pnpm verify`. Run `pnpm test:compat` for Chromium and Firefox.
- Real model inference is opt-in: build, then `pnpm test:model`. It downloads model weights.
- GitHub Pages deploys `dist` after successful main-branch verification. Preserve base-path and offline behavior.

- `src/app/bootstrap.ts` composes production adapters. Feature public APIs are `index.ts` and `ui.ts`; cross-feature workflows live in `src/app/application`.
- Features live in `src/features/<name>`. Shared UI and infrastructure live in `src/shared`; neither imports features or app.
- Use `BaseButton`, `BaseInput`, and `BaseTextarea` from their `src/shared/ui/<component>` public entrypoints. Only shared UI imports Reka UI. Use central tokens and variants; keep business actions in features.
- `pnpm check:architecture` runs Oxlint plus the same boundary rule and template conventions in Vue ESLint. Lint enforces imports and browser-free application/domain code. See `docs/architecture.md` for contracts and verification.
