# Shared browser verification

`pnpm writer verify recovery` selects tagged Gherkin scenarios and runs them with the same Playwright fixtures and page objects as `pnpm test:e2e`. The CLI contains no selectors or application assertions.

Each run has a private production build, generated BDD tests, browser context, preview port, and evidence directory. The CLI owns the preview and command process groups and removes temporary build files after they exit. Reports, traces, screenshots, and downloaded documents remain in `verification-artifacts/`.

## Design decision

Two independent design sketches compared a runner-backed CLI with a standalone browser session and action protocol. A third agent judged the sketches against shared behavior, isolation, interface size, BDD reuse, and implementation cost. All three used the same available model. This was not a cross-model review.

The runner-backed design won because the existing Gherkin scenarios remain the only definition of scenario order and assertions. A standalone session would duplicate browser lifecycle and scenario sequencing. The implementation adopts structured outcomes and image page objects without introducing a second workflow registry or interactive session protocol.

The feature registry contains names and descriptions. Tags in the feature files determine membership. The `all` selection executes the complete ordinary BDD suite once. Model inference remains an opt-in command outside that suite.

## Tradeoffs

Every verification builds current source. This costs more than reusing `dist`, but avoids stale build evidence and allows concurrent runs with different base paths. An available port is released before preview starts. If another process takes it, strict-port startup fails rather than attaching to that process.

A successful CLI result requires at least one passing scenario and no failed, skipped, or flaky scenarios. Existing E2E defaults retain evidence only on failure. CLI runs retain evidence on success as well.

Image paste tests dispatch a synthetic browser paste event containing a real file. They prove the application's paste handler, image rendering, recovery, and exported bytes. They do not prove operating-system clipboard integration.
