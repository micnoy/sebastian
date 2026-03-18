#!/usr/bin/env bash
# SessionStart hook — write a launcher script with the plugin path hardcoded so
# slash commands can call it without any $() substitution (which triggers prompts).
mkdir -p "$HOME/.claude/sebastian"

cat > "$HOME/.claude/sebastian/run.sh" << SCRIPT
#!/usr/bin/env bash
exec node "${CLAUDE_PLUGIN_ROOT}/server/index.js" "\$@"
SCRIPT
chmod +x "$HOME/.claude/sebastian/run.sh"
