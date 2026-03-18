---
description: Open a folder of Mermaid diagrams for batch review and annotation, then revise all files based on feedback
allowed-tools: Bash(~/.claude/sebastian/run.sh:*), Read, Write(~/.claude/sebastian/*), Write
---

## Your task

1. Identify the folder to review:
   - If $ARGUMENTS is a directory path, use it directly
   - Otherwise ask the user which folder contains the `.mmd` diagrams they want to review

2. Open the folder for batch review:
   ```
   ~/.claude/sebastian/run.sh folder <directory>
   ```
   This opens a browser with a file navigator on the left. The user can click each `.mmd` file to view and annotate it, then submit all feedback at once.

3. Address ALL feedback returned above:
   - For each file that has annotations or comments, revise that diagram file in place
   - For each file marked "Looks good — no changes requested", leave it unchanged
   - Write a brief summary to the user of what was changed in each file

4. If the user wants to continue iterating, run `/sebastian:folder` again on the same directory.
