---
description: Generate a Mermaid diagram from a description, preview it for annotation, and iterate
allowed-tools: Bash(~/.claude/sebastian/run.sh:*), Read, Write(~/.claude/sebastian/*)
---

## Your task

1. Analyze the user's request and choose the most appropriate Mermaid diagram type:
   - `sequenceDiagram` — for flows, interactions, API calls, protocols
   - `classDiagram` — for object models, data structures, relationships
   - `flowchart TD/LR` — for processes, decision trees, pipelines
   - `erDiagram` — for database schemas, entity relationships
   - `stateDiagram-v2` — for state machines, lifecycle flows
   - `gantt` — for timelines, project planning
   - Other types (gitGraph, mindmap, timeline) if appropriate

2. Generate complete, well-structured Mermaid code for the diagram

3. Choose a short, descriptive filename from the user's request (e.g. `jwt-auth-flow`, `order-state-machine`, `user-er-schema`) — lowercase, hyphens only, no spaces. The full path is `~/.claude/sebastian/<name>.mmd`. Read that file if it exists (ignore errors if it doesn't), then write the diagram code to it

4. Open the interactive preview:
   ```
   ~/.claude/sebastian/run.sh preview ~/.claude/sebastian/<name>.mmd
   ```

5. Address ALL feedback from the user's annotations:
   - Revise every annotated element based on its comment
   - Apply any general comments to the overall diagram structure
   - Write the revised diagram back to the same `~/.claude/sebastian/<name>.mmd` path
   - Show the updated Mermaid code in your response

6. Run `/sebastian:diagram` again if the user wants further refinement, or `/sebastian:preview` for another annotation round.

7. Ask the user: "Would you like to save this diagram to `diagrams/<name>.mmd` in your project?" — if yes, copy the file there; if no, do nothing.
