'use strict';

/**
 * Static Mermaid syntax validator — zero dependencies, pure Node.js built-ins.
 *
 * Catches the most common issues that prevent Mermaid from parsing or rendering:
 *  - Unknown / misspelled diagram type
 *  - ZWJ compound emoji (U+200D) — break Mermaid's PEG parser
 *  - Unbalanced double quotes on a line
 *  - Invalid flowchart direction
 */

const VALID_TYPES = new Set([
  'flowchart', 'graph',
  'sequencediagram',
  'classdiagram',
  'statediagram', 'statediagram-v2',
  'erdiagram',
  'gantt',
  'pie',
  'gitgraph',
  'mindmap',
  'timeline',
  'journey',
  'quadrantchart',
  'requirementdiagram',
  'c4context', 'c4container', 'c4component', 'c4dynamic', 'c4deployment',
  'block-beta',
  'architecture-beta',
  'xychart-beta',
  'sankey-beta',
  'packet-beta',
]);

const VALID_FLOWCHART_DIRECTIONS = new Set(['TD', 'TB', 'LR', 'RL', 'BT']);

// ================================================================
// Public API
// ================================================================

/**
 * Validate Mermaid diagram source code.
 * @param {string} code
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateMermaid(code) {
  const errors   = [];
  const warnings = [];

  if (!code || !code.trim()) {
    return { valid: false, errors: ['File is empty.'], warnings };
  }

  const lines = code.trim().split('\n');

  // ── Locate diagram type line (skip optional YAML frontmatter) ────
  let contentStart = 0;
  if (lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') { contentStart = i + 1; break; }
    }
  }

  const diagramLine = (lines[contentStart] || '').trim();
  const typeRaw     = diagramLine.split(/\s+/)[0] || '';
  const typeLower   = typeRaw.toLowerCase().replace(/-v\d+$/, '');

  if (!typeRaw) {
    errors.push('Cannot detect diagram type — no content found after frontmatter.');
    return { valid: false, errors, warnings };
  }

  if (!VALID_TYPES.has(typeRaw.toLowerCase()) && !VALID_TYPES.has(typeLower)) {
    errors.push(
      `Line ${contentStart + 1}: Unrecognized diagram type "${typeRaw}". ` +
      `Valid types: flowchart, graph, sequenceDiagram, classDiagram, stateDiagram, ` +
      `erDiagram, gantt, pie, gitGraph, mindmap, timeline, journey, quadrantChart.`
    );
    return { valid: false, errors, warnings };
  }

  // ── Per-line checks ──────────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('%%')) continue;

    // \n in node labels renders as literal backslash-n, not a line break.
    // Use <br/> instead. Check only lines that contain a label definition
    // (bracket/paren/brace immediately after a node ID or opening quote).
    if (trimmed.includes('\\n') &&
        /[\[(\{]"/.test(trimmed) &&
        !trimmed.startsWith('%%')) {
      errors.push(
        `Line ${lineNum}: Node label contains \\n which renders as literal text in Mermaid. ` +
        `Use <br/> for line breaks instead (e.g. ["line1<br/>line2"]).`
      );
    }

    // ZWJ compound emoji (U+200D zero-width joiner) break Mermaid's PEG parser.
    // Common culprits: 👨‍💻 👩‍💻 👨‍🔬 family emoji, etc.
    if (trimmed.includes('\u200D')) {
      errors.push(
        `Line ${lineNum}: ZWJ compound emoji detected (e.g. 👨‍💻). ` +
        `These multi-codepoint sequences use a Zero Width Joiner (U+200D) that breaks ` +
        `Mermaid's parser. Replace with a simple single-codepoint emoji (e.g. 💻) or plain text.`
      );
    }

    // Unbalanced double quotes on a single line (catches unclosed node labels).
    // Exclude edge label pipes like -->|"text"| which legitimately pair quotes.
    const quoteCount = (trimmed.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      errors.push(`Line ${lineNum}: Unbalanced double quotes — check node label syntax.`);
    }
  }

  // ── Flowchart-specific checks ────────────────────────────────────
  if (typeLower === 'flowchart' || typeLower === 'graph') {
    const direction = diagramLine.split(/\s+/)[1];
    if (direction && !VALID_FLOWCHART_DIRECTIONS.has(direction.toUpperCase())) {
      errors.push(
        `Line ${contentStart + 1}: Invalid flowchart direction "${direction}". ` +
        `Valid values: TD, TB, LR, RL, BT.`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Format a validation failure as structured text for Claude to read and act on.
 * @param {string|null} filePath  — path shown in the header (optional)
 * @param {{ errors: string[], warnings: string[] }} result
 * @returns {string}
 */
function formatValidationFailure(filePath, result) {
  const out = [
    'Mermaid Validation Failed',
    '=========================',
  ];

  if (filePath) out.push(`File: ${filePath}`, '');

  if (result.errors.length > 0) {
    out.push('Errors (must be fixed before the diagram can be rendered):');
    for (const e of result.errors) out.push(`• ${e}`);
    out.push('');
  }

  if (result.warnings.length > 0) {
    out.push('Warnings:');
    for (const w of result.warnings) out.push(`• ${w}`);
    out.push('');
  }

  out.push('Fix the issues above, then run the preview command again.');
  return out.join('\n');
}

module.exports = { validateMermaid, formatValidationFailure };
