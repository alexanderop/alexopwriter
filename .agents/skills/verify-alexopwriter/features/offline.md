# Offline writing

After the app is available offline, users can reload, write, and recover their draft with the browser disconnected from the network.

## Sub-features

- `offline-load`: The cached app opens after an offline reload.
- `offline-recovery`: A new offline draft survives a second offline reload.

## How to get to it (user POV)

Open the app while online, let it become available offline, then disconnect. Reload, choose **New document**, write in **Document editor**, wait for **Draft saved in browser**, and reload again.

## Driving it with Playwright

Preconditions: `pnpm writer doctor` succeeds. The CLI serves a production build so service-worker behavior is included.

- **Disconnect and reopen:** `pnpm writer verify offline` waits for offline availability, disconnects the browser context, reloads, and opens the editor.
- **Write and recover:** The same command creates `Written while offline.`, waits for the saved status, reloads while still offline, and checks exact recovered text. Inspect the trace for the offline transition and both reloads.

## Gotchas

- A development server is not this production offline check.
- Each run uses its own origin and context so previous browser caches cannot substitute for initial caching.
- This covers app assets and draft recovery; downloaded model reuse is a separate opt-in model test.
