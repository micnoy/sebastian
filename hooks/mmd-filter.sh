#!/usr/bin/env bash
# PostToolUse hook — auto-detect .mmd file writes and open preview.
# $CLAUDE_PLUGIN_ROOT is set by the Claude Code plugin system.
exec node "$CLAUDE_PLUGIN_ROOT/server/index.js" auto-detect
