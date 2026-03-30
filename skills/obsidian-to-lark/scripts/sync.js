#!/usr/bin/env node
'use strict';
/**
 * obsidian-to-lark sync script
 * Usage: node sync.js <obsidian-file-path> [feishu-doc-url-or-token]
 *
 * Single-script sync: parses Markdown, uploads images, creates/updates Feishu doc.
 * Only one shell invocation needed from Claude Code.
 */

const { spawnSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync, unlinkSync } = require('fs');
const { join, dirname, basename, extname, resolve } = require('path');
const { tmpdir } = require('os');
const { randomBytes } = require('crypto');

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(msg) { process.stderr.write(msg + '\n'); }
function die(msg) { process.stderr.write('\n❌ ' + msg + '\n'); process.exit(1); }

// ─── Temp file management ─────────────────────────────────────────────────────

const tempFiles = new Set();

function makeTmp(ext = '.png') {
  const p = join(tmpdir(), `lark-sync-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`);
  tempFiles.add(p);
  return p;
}

function cleanupAll() {
  for (const p of tempFiles) {
    try { if (existsSync(p)) unlinkSync(p); } catch {}
  }
}

process.on('exit', cleanupAll);
process.on('SIGINT', () => { cleanupAll(); process.exit(130); });
process.on('uncaughtException', (e) => { log('\n❌ ' + e.message); cleanupAll(); process.exit(1); });

// ─── lark-cli runner ──────────────────────────────────────────────────────────

function lark(args, opts = {}) {
  const r = spawnSync('lark-cli', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
  if (r.error) die(`lark-cli not found: ${r.error.message}\nInstall: npm install -g @larksuite/cli`);
  const output = (r.stdout || '') + (r.stderr || '');
  // Extract JSON from output (lark-cli may prepend progress lines)
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return { ok: r.status === 0, raw: output };
}

// ─── Auth check ───────────────────────────────────────────────────────────────

function checkAuth() {
  log('Checking auth...');
  const r = lark(['auth', 'status']);
  // lark-cli auth status returns flat JSON (no data wrapper)
  const info = r.tokenStatus ? r : r.data;
  if (!info || !info.tokenStatus) {
    die('Cannot read auth status. Run:\n  lark-cli config init\n  lark-cli auth login --recommend');
  }
  if (info.tokenStatus === 'expired') {
    die('Token expired. Re-authenticate:\n  lark-cli auth login --recommend');
  }
  // needs_refresh = auto-refresh, ok to proceed
  log(`Auth OK · ${info.userName} · token: ${info.tokenStatus}`);
  return info;
}

// ─── Frontmatter ──────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: content, raw: '' };
  const raw = m[0];
  const body = content.slice(raw.length);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["'](.*)["']$/, '$1').trim();
  }
  return { meta, body, raw };
}

function writeback(filePath, raw, docUrl) {
  const content = readFileSync(filePath, 'utf8');
  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
    .replace(' ', 'T') + '+08:00';

  if (!raw) {
    // No frontmatter — prepend
    writeFileSync(filePath, `---\nfeishu_doc_url: ${docUrl}\nfeishu_synced_at: ${now}\n---\n` + content);
    return;
  }

  const inner = raw.replace(/^---\r?\n/, '').replace(/\r?\n---\r?\n?$/, '');
  const lines = inner.split('\n');
  let hasUrl = false, hasSynced = false;

  const updated = lines
    .map(line => {
      if (/^feishu_doc_url:/.test(line))   { hasUrl    = true; return `feishu_doc_url: ${docUrl}`; }
      if (/^feishu_synced_at:/.test(line)) { hasSynced = true; return `feishu_synced_at: ${now}`; }
      if (/^feishu_doc_id:/.test(line))    return null; // migrate old field
      return line;
    })
    .filter(l => l !== null);

  if (!hasUrl)    updated.push(`feishu_doc_url: ${docUrl}`);
  if (!hasSynced) updated.push(`feishu_synced_at: ${now}`);

  writeFileSync(filePath, content.replace(raw, `---\n${updated.join('\n')}\n---\n`));
  log(`Frontmatter updated → feishu_doc_url: ${docUrl}`);
}

// ─── Obsidian syntax conversion ───────────────────────────────────────────────

function convertObsidian(text) {
  return text
    .replace(/%%[\s\S]*?%%/g, '')                       // Remove %%comments%%
    .replace(/==([^=\n]+)==/g, '**$1**')                // ==highlight== → bold
    .replace(/^(> *)\[!(\w+)\](.*)/gm, '$1**$2**$3')   // Callout headers
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')     // [[Page|Display]] → Display
    .replace(/\[\[([^\]]+)\]\]/g, '$1')                 // [[Page]] → Page
    .trim();
}

// ─── Vault root detection ─────────────────────────────────────────────────────

function findVaultRoot(startDir) {
  let cur = startDir;
  for (let i = 0; i < 15; i++) {
    if (existsSync(join(cur, '.obsidian'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return startDir; // fallback
}

// ─── Local image search ───────────────────────────────────────────────────────

function findLocalImage(imgName, noteDir, noteName, vaultRoot) {
  // Priority order matching Obsidian's custom attachment location config
  const candidates = [
    join(noteDir, 'assets', noteName, imgName),  // ./assets/${noteFileName}/ (default config)
    join(noteDir, imgName),                       // Same directory as note
    join(noteDir, 'attachments', imgName),        // attachments/ sibling
    join(noteDir, 'assets', imgName),             // assets/ sibling
    join(vaultRoot, 'attachments', imgName),      // Vault-level attachments
    join(vaultRoot, 'assets', imgName),           // Vault-level assets
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Last resort: recursive vault search
  const r = spawnSync('find', [
    vaultRoot, '-name', imgName,
    '-not', '-path', '*/.obsidian/*',
    '-not', '-path', '*/node_modules/*',
    '-not', '-path', '*/.git/*',
    '-not', '-path', '*/.Trash/*',
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  const found = (r.stdout || '').trim().split('\n').filter(Boolean);
  return found.length > 0 ? found[0] : null;
}

// ─── Segment parsing ──────────────────────────────────────────────────────────

/**
 * Splits document body into interleaved text/image segments.
 * lark-cli +media-insert only appends to the end, so images must be
 * strictly interleaved with text rather than uploaded in batch.
 */
function parseSegments(body, noteDir, noteName, vaultRoot) {
  const segments = [];
  const lines = body.split('\n');
  let textBuf = [];

  const flushText = () => {
    const text = convertObsidian(textBuf.join('\n'));
    if (text) segments.push({ type: 'text', content: text });
    textBuf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Obsidian wikilink image: ![[filename.png]] or ![[filename.png|alt]]
    const wikiImg = trimmed.match(/^!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]$/);
    // Standard Markdown image on its own line: ![alt](src)
    const mdImg = !wikiImg && trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

    if (wikiImg) {
      flushText();
      const imgName = wikiImg[1].trim();
      const local = findLocalImage(imgName, noteDir, noteName, vaultRoot);
      if (local) {
        segments.push({ type: 'image', local, label: imgName });
      } else {
        log(`  ⚠️  Image not found, skipping: ${imgName}`);
      }
    } else if (mdImg) {
      const src = mdImg[2].trim();
      flushText();
      if (/^https?:\/\//.test(src)) {
        segments.push({ type: 'image', url: src, label: src.split('/').pop().substring(0, 40) });
      } else {
        const abs = resolve(noteDir, decodeURIComponent(src));
        if (existsSync(abs)) {
          segments.push({ type: 'image', local: abs, label: basename(abs) });
        } else {
          // Try vault-relative path
          const vaultRel = resolve(vaultRoot, decodeURIComponent(src));
          if (existsSync(vaultRel)) {
            segments.push({ type: 'image', local: vaultRel, label: basename(vaultRel) });
          } else {
            log(`  ⚠️  Image not found, skipping: ${src}`);
          }
        }
      }
    } else {
      textBuf.push(line);
    }
  }

  flushText();
  return segments;
}

// ─── Image upload ─────────────────────────────────────────────────────────────

function uploadLocalImage(docId, localPath) {
  const dir = dirname(localPath);
  const file = basename(localPath);
  const r = spawnSync('lark-cli', ['docs', '+media-insert', '--doc', docId, '--file', `./${file}`], {
    encoding: 'utf8',
    cwd: dir,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    throw new Error(r.stderr?.trim() || r.error?.message || 'Upload failed');
  }
}

function uploadCdnImage(docId, url) {
  let ext = '.png';
  try { ext = extname(new URL(url).pathname) || '.png'; } catch {}
  const tmp = makeTmp(ext);

  const dl = spawnSync('curl', ['-s', '-L', '--max-time', '45', '--fail', url, '-o', tmp], {
    encoding: 'utf8',
  });
  if (dl.status !== 0 || !existsSync(tmp)) {
    throw new Error(`Download failed (HTTP ${dl.status}): ${dl.stderr?.trim()}`);
  }

  const r = spawnSync('lark-cli', ['docs', '+media-insert', '--doc', docId, '--file', `./${basename(tmp)}`], {
    encoding: 'utf8',
    cwd: tmpdir(),
    maxBuffer: 50 * 1024 * 1024,
  });

  // Always clean up — don't wait for process.exit
  try { if (existsSync(tmp)) { unlinkSync(tmp); tempFiles.delete(tmp); } } catch {}

  if (r.error || r.status !== 0) {
    throw new Error(r.stderr?.trim() || r.error?.message || 'Upload failed');
  }
}

// ─── Text chunking ────────────────────────────────────────────────────────────

// lark-cli has limits on markdown payload size; split large blocks
const MAX_CHUNK = 6000;

function chunkText(text) {
  if (text.length <= MAX_CHUNK) return [text];
  const chunks = [];
  const paragraphs = text.split(/\n{2,}/);
  let buf = '';
  for (const para of paragraphs) {
    if ((buf + '\n\n' + para).length > MAX_CHUNK && buf) {
      chunks.push(buf.trim());
      buf = para;
    } else {
      buf = buf ? buf + '\n\n' + para : para;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const [,, filePath, docArg] = process.argv;
  if (!filePath) die('Usage: node sync.js <obsidian-file-path> [feishu-doc-url-or-token]');

  const absPath = resolve(filePath);
  if (!existsSync(absPath)) die(`File not found: ${absPath}`);

  // Verify lark-cli exists
  const which = spawnSync('which', ['lark-cli'], { encoding: 'utf8' });
  if (which.status !== 0) die('lark-cli not found.\nInstall: npm install -g @larksuite/cli');

  checkAuth();

  // Parse file
  const content = readFileSync(absPath, 'utf8');
  const { meta, body, raw } = parseFrontmatter(content);
  const title = (meta.title || basename(absPath, '.md')).replace(/^["']|["']$/g, '');
  const noteDir = dirname(absPath);
  const noteName = basename(absPath, '.md');
  const vaultRoot = findVaultRoot(noteDir);

  log(`File:  ${absPath}`);
  log(`Title: ${title}`);
  log(`Vault: ${vaultRoot}`);

  // Resolve target doc
  const existing = docArg || meta.feishu_doc_url || meta.feishu_doc_id;
  let docId = null;
  let isUpdate = false;

  if (existing) {
    const m = existing.match(/\/docx\/([A-Za-z0-9]+)/);
    docId = m ? m[1] : existing.trim();
    isUpdate = true;
    log(`Mode:  UPDATE ${docId}`);
  } else {
    log(`Mode:  CREATE new doc`);
  }

  // Parse document into interleaved segments
  log('\nParsing segments...');
  const segments = parseSegments(body, noteDir, noteName, vaultRoot);
  const imgSegs  = segments.filter(s => s.type === 'image');
  const textSegs = segments.filter(s => s.type === 'text');
  log(`→ ${textSegs.length} text blocks, ${imgSegs.length} images\n`);

  // First text segment
  const firstTextIdx = segments.findIndex(s => s.type === 'text');
  const firstText = firstTextIdx >= 0 ? segments[firstTextIdx].content : title;

  // Create or overwrite
  const DEFAULT_FOLDER = 'JFbdfWFbpl36sRdNMThciW1cnBd';

  if (!isUpdate) {
    log(`Creating: "${title}"`);
    const r = lark(['docs', '+create', '--title', title, '--markdown', firstText,
                    '--folder-token', DEFAULT_FOLDER]);
    if (!r.data?.doc_id) die(`Create failed:\n${JSON.stringify(r, null, 2)}`);
    docId = r.data.doc_id;
    log(`✓ Created: ${r.data.doc_url}`);
  } else {
    log(`Overwriting: ${docId}`);
    const r = lark(['docs', '+update', '--doc', docId, '--mode', 'overwrite', '--markdown', firstText]);
    if (!r.data) die(`Overwrite failed:\n${JSON.stringify(r, null, 2)}`);
    log(`✓ Overwritten`);
  }

  // Process remaining segments
  const rest = firstTextIdx >= 0 ? segments.slice(firstTextIdx + 1) : segments;
  let imgDone = 0, imgFailed = 0;
  const failed = [];

  for (let i = 0; i < rest.length; i++) {
    const seg = rest[i];

    if (seg.type === 'text') {
      for (const chunk of chunkText(seg.content)) {
        const r = lark(['docs', '+update', '--doc', docId, '--mode', 'append', '--markdown', chunk]);
        if (!r.data) log(`  ⚠️  Text append failed (segment ${i})`);
      }
    } else if (seg.type === 'image') {
      imgDone++;
      log(`[${imgDone}/${imgSegs.length}] ${seg.label || '(image)'}`);
      try {
        if (seg.local) {
          uploadLocalImage(docId, seg.local);
        } else if (seg.url) {
          uploadCdnImage(docId, seg.url);
        }
        log(`  ✓`);
      } catch (e) {
        imgFailed++;
        failed.push({ label: seg.label, reason: e.message });
        log(`  ⚠️  Skipped: ${e.message}`);
      }
    }
  }

  // Write back frontmatter
  const docUrl = `https://www.feishu.cn/docx/${docId}`;
  writeback(absPath, raw, docUrl);

  // Summary
  const succeeded = imgDone - imgFailed;
  log('\n' + '─'.repeat(55));
  log(`✅ Sync complete`);
  log(`📄 ${docUrl}`);
  log(`🖼  Images: ${succeeded} uploaded${imgFailed ? `, ${imgFailed} skipped` : ''}`);
  if (failed.length > 0) {
    log('\nSkipped images:');
    for (const f of failed) log(`  · ${f.label} — ${f.reason}`);
  }
  log('─'.repeat(55));

  // Output URL to stdout for easy capture
  process.stdout.write(docUrl + '\n');
}

main();
