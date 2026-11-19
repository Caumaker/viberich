# Contributing

Thanks for helping. Vibe Rich UI is small on purpose: one server and CLI file (`bin/vibe-ui`), one page (`bin/vibe-ui.html`), one MCP wrapper (`bin/vibe-ui-mcp`), no runtime dependencies. Please keep it that way.

## How work flows

1. Open an issue first for anything larger than a typo, so we agree on the approach before you write code.
2. Fork, branch from `main`, and keep each pull request to one subject.
3. Run `npm run check` (syntax of the three files) and `npm test` (end-to-end test in headless Chrome; `npm install` first, and set `CHROME` if Chrome is not in the default place). The test runs its own server on port 7799 with a temporary data folder.
4. If you changed something visible, record the demo again with `npm run demo` (needs ffmpeg) or attach a screenshot to the pull request.
5. Describe what you tested by hand in the pull request.

Issues and pull requests are triaged with the help of Claude Code. A human maintainer approves every merge.

## Rules that do not change

- **A draft is never lost.** Anything typed in a comment box survives redraws, live updates and reloads. Test it.
- **Nothing is deleted.** Remove hides a block; restore creates a new version; resolve keeps the thread.
- **No binaries in JSON.** Pasted images and any other file are written to disk; the JSON keeps only the link.
- **Local only.** The server binds to 127.0.0.1 and refuses foreign host names and cross-site calls. No telemetry, no accounts, no external calls besides the chart, diagram and font libraries the page loads.
- **No new runtime dependencies** without an issue that explains why.
- **Keyboard first.** Every new control must be reachable and usable without a mouse, and listed in the shortcut table (`?` on the page and the README).
- **Plain punctuation.** Use commas, colons and plain hyphens in text; no em or en dashes.

## Code style

- Plain Node (18+) and plain browser JavaScript. No build step, no framework.
- Small named functions, English names, comments only where the reason is not obvious.
- New data fields in English, added without breaking documents created by older versions.

## Good first contributions

- Testing on Windows and Linux, especially `Open folder` (the `/reveal` route) and the MCP `open` tool.
- Accessibility review: screen readers, focus order, contrast.
- A dark theme that keeps the cards and the diff readable.

## Code of conduct

Be kind and specific. Critique code, not people.
