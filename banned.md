# Banned Browser Methods

These methods are permanently banned in `coder-SIN-Qwen`:

- direct browser startup on the main profile
- any `about:blank` or `about:default` startup flow
- any `open -na` / LaunchServices launch path
- any browser-start method that opens a second session after one is already prepared
- any flow that closes the browser before a real assistant response arrives
- any fallback to Google login
- any automatic switch away from the working fallback sidecar path

Allowed only:

- the fallback sidecar browser path on the debug port
- direct email/password Qwen login
- keep the browser open until the response is received
