# Contributing

Thanks for helping. replica is small on purpose: one server file, one page, one MCP wrapper, no runtime dependencies. Keep it that way.

## How work flows

1. Open an issue first for anything larger than a typo, so we agree on the approach.
2. Fork, branch from `main`, keep the pull request to one subject.
3. Run `npm run check`. If you touched the page, also run `npm test` (needs Chrome and a running server with `examples/exemplo.md` published as `exemplo`).
4. Describe what you tested by hand in the pull request.

Issues and pull requests are triaged with the help of Claude Code. A human maintainer approves every merge.

## Rules that do not change

- **A draft is never lost.** Anything typed in a comment box survives redraws, live updates and reloads. Test it.
- **Nothing is deleted.** Remove hides a block; restore creates a new version.
- **No binaries in JSON.** Attachments are files on disk.
- **Local only.** The server binds to 127.0.0.1. No telemetry, no external calls besides the chart and diagram libraries loaded by the page.
- **No new runtime dependencies** without an issue discussing why.
- **Keyboard first.** Every new control must be reachable and usable without a mouse.

## Good first contributions

- English (and other) translations of the page and CLI messages.
- Windows and Linux testing of `abrir-pasta` and the MCP `abrir` tool.
- Accessibility review (screen readers, focus order, contrast).

## Code of conduct

Be kind and specific. Critique code, not people.
