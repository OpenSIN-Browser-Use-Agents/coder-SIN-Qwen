# ADR-0002: Sidecar CDP Attach

**Status:** Accepted (2026-04-23)
**Context:** The browser automation needs a Chrome instance. Options: launch Chrome directly from Playwright, connect to an existing instance via CDP, or use a sidecar process.
**Decision:** Use sidecar CDP attach as the only supported browser path. A separate sidecar process launches Chrome with remote debugging enabled, and the relay attaches via CDP URL. Direct Playwright browser launch is banned (#18).
**Consequences:** + No profile lock conflicts, + Clean process separation, + Easier debugging, - Requires sidecar management
**Enforced by:** preflight.js, browser.js CDP-only path, `CHROME_ATTACH_MODE=1`
