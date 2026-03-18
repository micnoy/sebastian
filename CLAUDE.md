# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin that lets users interactively annotate Mermaid diagrams in the browser and return structured feedback for revision. It runs as a local HTTP server that serves a single-page UI, collects click-based annotations on diagram elements, and outputs formatted feedback to stdout.

## Running

```bash
# Preview a specific .mmd file (manual)
node server/index.js preview /path/to/diagram.mmd

# Auto-detect mode (called by the PostToolUse hook via stdin JSON)
echo '{"tool_input":{"file_path":"file.mmd","content":"..."}}' | node server/index.js auto-detect
```

No build step — this is pure Node.js (built-ins only) + a single HTML file. No dependencies to install.

## Architecture

**Two entry points, one server:**

- `server/index.js` — The core. Handles two modes (`preview` and `auto-detect`), creates an ephemeral HTTP server on a random localhost port, opens the browser, waits for feedback via `POST /api/feedback`, then prints structured output and exits.
- `server/ui.html` — The entire frontend: Mermaid rendering (v11 from CDN), pan/zoom, click-to-annotate on nodes/edges, sidebar annotation list, and submit/approve actions.

**HTTP endpoints (all on 127.0.0.1):**
- `GET /` — serves `ui.html`
- `GET /api/diagram` — serves the mermaid code
- `POST /api/feedback` — receives annotations JSON, formats output, shuts down server

**Hook integration:**
- `hooks/hooks.json` registers a `PostToolUse` hook on `Write` tool calls
- `hooks/mmd-filter.sh` → `node server/index.js auto-detect`
- Auto-detect reads the Write event from stdin, ignores non-`.mmd` files, and uses `/tmp/.sebastian.lock` to prevent duplicate windows

**Slash commands** (`commands/*.md`) instruct Claude how to use the tool:
- `/sebastian:diagram` — generate a new diagram and preview it
- `/sebastian:preview` — preview and annotate an existing diagram

## Key Implementation Details

- The server uses a random available port (not hardcoded) to avoid conflicts
- Browser launching is platform-aware: `open` (macOS), `start` (Windows), `xdg-open` (Linux); respects `SEBASTIAN_BROWSER` or `BROWSER` env vars
- The UI auto-detects Mermaid diagram type to apply correct theming
- Element detection in the SVG skips background/grid elements and extracts human-readable labels
- Edge click targets are augmented with invisible hit-area overlays for easier interaction
- After feedback is submitted, the browser tab shows a 3-second countdown then attempts `window.close()`

## Versioning & Releases

Every push that changes plugin behaviour (commands, hooks, server, UI, plugin manifests) must:

1. Bump the **patch version** in both `package.json` and `.claude-plugin/plugin.json` (e.g. `0.1.0` → `0.1.1`)
2. After pushing, create a GitHub release with a tag matching the new version (`v0.1.1`) and release notes summarising what changed:
   ```bash
   gh release create v0.1.1 --title "v0.1.1" --notes "..."
   ```

Purely documentation-only or example-only changes do not require a version bump.

## Environment Variables

| Variable | Purpose |
|---|---|
| `SEBASTIAN_BROWSER` | Override browser command (highest priority) |
| `BROWSER` | Fallback browser override |
| `CLAUDE_PLUGIN_ROOT` | Set by Claude Code plugin system; used in hook scripts |
