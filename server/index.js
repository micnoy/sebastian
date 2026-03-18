#!/usr/bin/env node
'use strict';

/**
 * Sebastian — Node.js HTTP server
 *
 * Modes:
 *   node index.js preview <file.mmd>
 *     Renders diagram in browser, collects annotations, returns feedback to stdout.
 *
 *   node index.js folder <directory>
 *     Opens a folder of .mmd files for batch review. User can navigate between
 *     files in a left pane, annotate each, then submit all feedback at once.
 *
 *   node index.js auto-detect
 *     Called by PostToolUse hook. Reads Write event from stdin.
 *     Triggers preview only for .mmd file writes; exits silently otherwise.
 */

const http = require('http');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execFile } = require('child_process');
const { validateMermaid, formatValidationFailure } = require('./validate');

const HTML_FILE = path.join(__dirname, 'ui.html');
const LOCK_FILE = path.join(os.tmpdir(), '.sebastian.lock');

const htmlContent = fs.readFileSync(HTML_FILE, 'utf-8');
const args = process.argv.slice(2);

// ================================================================
// Entry
// ================================================================
async function main() {
  if (args[0] === 'preview') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: sebastian preview <file.mmd>');
      process.exit(1);
    }

    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found: ${absolutePath}`);
      process.exit(1);
    }

    const code = fs.readFileSync(absolutePath, 'utf-8').trim();
    if (!code) {
      console.error('File is empty');
      process.exit(1);
    }

    const validation = validateMermaid(code);
    if (!validation.valid) {
      console.log(formatValidationFailure(absolutePath, validation));
      process.exit(1);
    }

    const feedback = await runPreviewServer(code);
    console.log(feedback);
    process.exit(0);

  } else if (args[0] === 'auto-detect') {
    // Skip if a preview is already open
    if (fs.existsSync(LOCK_FILE)) {
      process.exit(0);
    }

    const eventJson = await readStdin();
    try {
      const event    = JSON.parse(eventJson);
      const filePath = (event.tool_input && event.tool_input.file_path) || '';
      const content  = (event.tool_input && event.tool_input.content)   || '';

      if (filePath.endsWith('.mmd')) {
        const validation = validateMermaid(content);
        if (!validation.valid) {
          console.log(formatValidationFailure(filePath, validation));
        } else {
          const feedback = await runPreviewServer(content);
          console.log(feedback);
        }
      }
      // Otherwise exit silently — don't interrupt Claude
    } catch (_) { /* ignore parse errors */ }

    process.exit(0);

  } else if (args[0] === 'folder') {
    const folderArg = args[1];
    if (!folderArg) {
      console.error('Usage: sebastian folder <directory>');
      process.exit(1);
    }

    const absoluteFolder = path.resolve(folderArg);
    if (!fs.existsSync(absoluteFolder) || !fs.statSync(absoluteFolder).isDirectory()) {
      console.error(`Directory not found: ${absoluteFolder}`);
      process.exit(1);
    }

    const mmdFiles = fs.readdirSync(absoluteFolder)
      .filter(f => f.endsWith('.mmd'))
      .sort();

    if (mmdFiles.length === 0) {
      console.error(`No .mmd files found in: ${absoluteFolder}`);
      process.exit(1);
    }

    const feedback = await runFolderServer(absoluteFolder, mmdFiles);
    console.log(feedback);
    process.exit(0);

  } else {
    console.error('Usage:');
    console.error('  sebastian preview <file.mmd>');
    console.error('  sebastian folder <directory>');
    console.error('  sebastian auto-detect   (PostToolUse hook mode)');
    process.exit(1);
  }
}

// ================================================================
// Preview server
// ================================================================
function runPreviewServer(mermaidCode) {
  return new Promise((resolve) => {
    // Lock: prevent hook from opening a second window while we're running
    try { fs.writeFileSync(LOCK_FILE, '1'); } catch (_) {}

    let settled = false;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
        return;
      }

      if (url.pathname === '/api/diagram') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: mermaidCode, title: extractFrontmatterTitle(mermaidCode) }));
        return;
      }

      if (url.pathname === '/api/close' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        if (!settled) {
          settled = true;
          server.close();
          cleanup();
          resolve('Sebastian: Browser closed without submitting — hook released.');
        }
        return;
      }

      if (url.pathname === '/api/feedback' && req.method === 'POST') {
        let raw = '';
        try { raw = await readBody(req); } catch (_) {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        try {
          const data     = JSON.parse(raw);
          const feedback = formatFeedback(
            data.annotations    || [],
            data.generalComment || '',
            mermaidCode
          );

          // Give the browser 1.5s to receive the success response before stopping
          setTimeout(() => {
            if (!settled) {
              settled = true;
              server.close();
              cleanup();
              resolve(feedback);
            }
          }, 1500);
        } catch (_) {
          if (!settled) {
            settled = true;
            server.close();
            cleanup();
            resolve('Feedback received (could not parse details).');
          }
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr ? addr.port : 0;
      const url  = `http://localhost:${port}`;

      console.error(`\nSebastian: ${url}`);
      console.error('Annotate the diagram in your browser, then click "Submit Feedback".\n');

      openBrowser(url);
    });
  });
}

// ================================================================
// Folder server
// ================================================================
function runFolderServer(folderPath, files) {
  return new Promise((resolve) => {
    try { fs.writeFileSync(LOCK_FILE, '1'); } catch (_) {}

    let settled = false;

    function readMmd(filename) {
      return fs.readFileSync(path.join(folderPath, filename), 'utf-8').trim();
    }

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
        return;
      }

      if (url.pathname === '/api/diagram') {
        const requested = url.searchParams.get('file');
        const target    = (requested && files.includes(requested)) ? requested : files[0];
        const code      = readMmd(target);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          code,
          title:       extractFrontmatterTitle(code),
          files,
          currentFile: target,
        }));
        return;
      }

      if (url.pathname === '/api/close' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        if (!settled) {
          settled = true;
          server.close();
          cleanup();
          resolve('Sebastian: Browser closed without submitting — hook released.');
        }
        return;
      }

      if (url.pathname === '/api/feedback' && req.method === 'POST') {
        let raw = '';
        try { raw = await readBody(req); } catch (_) {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        try {
          const data     = JSON.parse(raw);
          const feedback = formatMultiFileFeedback(data.fileAnnotations || {}, folderPath, files);

          setTimeout(() => {
            if (!settled) {
              settled = true;
              server.close();
              cleanup();
              resolve(feedback);
            }
          }, 1500);
        } catch (_) {
          if (!settled) {
            settled = true;
            server.close();
            cleanup();
            resolve('Feedback received (could not parse details).');
          }
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url  = `http://localhost:${port}`;
      console.error(`\nSebastian — Folder Review: ${url}`);
      console.error(`Reviewing ${files.length} diagram(s) in: ${folderPath}`);
      console.error('Annotate each diagram, then click "Submit All Feedback".\n');
      openBrowser(url);
    });
  });
}

// ================================================================
// Helpers
// ================================================================
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.resume();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end',  () => resolve(body));
    req.on('error', reject);
  });
}

function cleanup() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

/**
 * Open a URL in the system browser using execFile (no shell injection risk).
 * Respects SEBASTIAN_BROWSER or BROWSER env vars for custom browsers.
 */
function openBrowser(url) {
  const custom   = process.env.SEBASTIAN_BROWSER || process.env.BROWSER;
  const platform = process.platform;
  const cb = () => {}; // fire and forget

  if (custom) {
    // Custom browser specified via env var
    if (platform === 'darwin') {
      execFile('open', ['-a', custom, url], cb);
    } else if (platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', custom, url], cb);
    } else {
      execFile(custom, [url], cb);
    }
  } else {
    // System default browser
    if (platform === 'darwin') {
      execFile('open', [url], cb);
    } else if (platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', url], cb);
    } else {
      execFile('xdg-open', [url], cb);
    }
  }
}

// ================================================================
// Frontmatter helpers
// ================================================================
function extractFrontmatterTitle(code) {
  const trimmed = code.trimStart();
  if (!trimmed.startsWith('---')) return null;
  const rest  = trimmed.slice(3);
  const end   = rest.search(/\n---\s*(\n|$)/);
  if (end === -1) return null;
  const fm    = rest.slice(0, end);
  const match = fm.match(/^title:\s*["']?(.*?)["']?\s*$/m);
  return match ? match[1].trim() : null;
}

// ================================================================
// Feedback formatting
// ================================================================
function formatFeedback(annotations, generalComment, code) {
  const title     = extractFrontmatterTitle(code);
  const firstLine = title || (code.trim().split('\n')[0] || '').trim();

  const lines = [
    'Mermaid Diagram Feedback',
    '========================',
    `Diagram: ${firstLine}`,
    '',
  ];

  if (annotations.length > 0) {
    lines.push('Element Annotations:');
    for (const a of annotations) {
      lines.push(`• [${a.label}] "${a.comment}"`);
    }
    lines.push('');
  }

  if (generalComment) {
    lines.push('General Comments:');
    lines.push(generalComment);
    lines.push('');
  }

  if (annotations.length === 0 && !generalComment) {
    lines.push('The diagram looks good — no changes requested.');
  } else {
    lines.push('---');
    lines.push('Before making any changes, write a brief summary to the user of the feedback received.');
    lines.push('Then revise the diagram to address all feedback above.');
    lines.push('Run /sebastian:preview again after updating if further review is needed.');
  }

  return lines.join('\n');
}

// ================================================================
// Multi-file feedback formatting
// ================================================================
function formatMultiFileFeedback(fileAnnotations, folderPath, files) {
  const lines = [
    'Mermaid Folder Review',
    '=====================',
    `Folder: ${folderPath}`,
    `Files:  ${files.length}`,
    '',
  ];

  let anyChanges = false;

  for (const filename of files) {
    const entry       = fileAnnotations[filename] || {};
    const anns        = entry.annotations    || [];
    const comment     = (entry.generalComment || '').trim();
    const approved    = entry.approved        || false;
    const hasChanges  = anns.length > 0 || comment;

    if (hasChanges) anyChanges = true;

    lines.push(`── ${filename} ──`);

    if (approved || !hasChanges) {
      lines.push('Looks good — no changes requested.');
    } else {
      if (anns.length > 0) {
        lines.push('Element Annotations:');
        for (const a of anns) {
          lines.push(`• [${a.label}] "${a.comment}"`);
        }
      }
      if (comment) {
        lines.push('General Comments:');
        lines.push(comment);
      }
    }
    lines.push('');
  }

  if (anyChanges) {
    lines.push('---');
    lines.push('Before making any changes, write a brief summary to the user of the feedback received.');
    lines.push('Then revise each diagram file as needed to address the feedback above.');
    lines.push('Run /sebastian:folder again after updating if further review is needed.');
  }

  return lines.join('\n');
}

// ================================================================
// Run
// ================================================================
main().catch((err) => {
  console.error('Error:', err && err.message ? err.message : String(err));
  process.exit(1);
});
