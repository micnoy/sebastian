---
description: Preview and annotate a Mermaid diagram in the browser, then revise based on feedback
allowed-tools: Bash(~/.claude/sebastian/run.sh:*), Read, Write(~/.claude/sebastian/*)
---

## Your task

1. Identify the Mermaid diagram to preview:
   - If $ARGUMENTS is a file path ending in `.mmd`, use it directly
   - Otherwise, extract the most recent Mermaid code block from the conversation
   - If no diagram exists yet, ask the user to describe what they want

2. Derive a short, descriptive filename from the diagram content or the argument path (e.g. `jwt-auth-flow`, `order-state-machine`) — lowercase, hyphens only. If $ARGUMENTS is a `.mmd` path use its basename. Otherwise infer from the diagram type and key elements. The full path is `~/.claude/sebastian/<name>.mmd`. Read that file if it exists (ignore errors if it doesn't), then write the Mermaid code to it

3. Run the preview and collect annotations:
   ```
   ~/.claude/sebastian/run.sh preview ~/.claude/sebastian/<name>.mmd
   ```

4. Address ALL feedback returned above:
   - Revise the diagram to incorporate every annotation and comment
   - Write the updated diagram back to the same `~/.claude/sebastian/<name>.mmd` path
   - Show the revised Mermaid code in your response

5. If the user wants to continue iterating, run `/sebastian:preview` again.

6. Ask the user: "Would you like to save this diagram to `diagrams/<name>.mmd` in your project?" — if yes, copy the file there; if no, do nothing.
