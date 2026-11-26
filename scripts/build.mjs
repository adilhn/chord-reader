// Build dist/ for GitHub Pages: one self-contained index.html (CSS and JS inlined and minified),
// plus the PWA files (manifest, service worker, icons) when they exist in src/.
// Usage: node scripts/build.mjs   (or npm run build)
import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// The two tags in src/index.html that get replaced by inline code.
const LINK_RE = /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?>/;
const SCRIPT_RE = /<script\s+type="module"\s+src="js\/main\.js"\s*>\s*<\/script>/;

function fail(msg) {
  console.error('build failed: ' + msg);
  process.exit(1);
}

// Light HTML minification. Inside text, any run of whitespace that contains a line break becomes a
// single line break, which strips indentation and blank lines but renders the same. Tags (and so
// attribute values), comments, and the contents of pre, textarea, script and style are copied as is.
function minifyHTML(html) {
  const RAW = /^<(pre|textarea|script|style)[\s>\/]/i;
  let out = '', i = 0;
  while (i < html.length) {
    const c = html[i];
    if (c === '<') {
      let end;
      const raw = RAW.exec(html.slice(i, i + 12));
      if (html.startsWith('<!--', i)) {
        end = html.indexOf('-->', i + 4);
        end = end < 0 ? html.length : end + 3;
      } else if (raw) {
        const close = html.toLowerCase().indexOf('</' + raw[1].toLowerCase(), i);
        end = close < 0 ? html.length : html.indexOf('>', close) + 1 || html.length;
      } else {
        // A tag: find its closing '>' while skipping quoted attribute values.
        let q = null;
        end = i + 1;
        while (end < html.length) {
          const ch = html[end];
          if (q) { if (ch === q) q = null; }
          else if (ch === '"' || ch === "'") q = ch;
          else if (ch === '>') break;
          end++;
        }
        end = Math.min(end + 1, html.length);
      }
      out += html.slice(i, end);
      i = end;
    } else if (/\s/.test(c)) {
      let j = i;
      while (j < html.length && /\s/.test(html[j])) j++;
      const run = html.slice(i, j);
      out += run.includes('\n') ? '\n' : run;
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out.trim() + '\n';
}

// Short commit SHA for the service worker's cache version: CI env, then git, then a timestamp.
function buildVersion() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (sha) return sha;
  } catch (e) { /* not a git checkout */ }
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

const kb = n => (n / 1024).toFixed(1) + ' KB';

async function main() {
  // JavaScript: bundle the ES modules into one classic script.
  const bundle = await build({
    entryPoints: [path.join(SRC, 'js', 'main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2020',
    legalComments: 'none',
    write: false,
    logLevel: 'warning',
  });
  const js = bundle.outputFiles[0].text.trim().replace(/<\/script/gi, '<\\/script');

  // CSS
  const cssSrc = await readFile(path.join(SRC, 'styles.css'), 'utf8');
  const css = (await transform(cssSrc, { loader: 'css', minify: true })).code.trim().replace(/<\/style/gi, '<\\/style');

  // HTML: check both tags exist, minify the markup, then inline the code.
  let html = await readFile(path.join(SRC, 'index.html'), 'utf8');
  if (!LINK_RE.test(html)) fail('src/index.html has no <link rel="stylesheet" href="styles.css"> tag to replace');
  if (!SCRIPT_RE.test(html)) fail('src/index.html has no <script type="module" src="js/main.js"></script> tag to replace');
  html = minifyHTML(html);
  // Function replacements, so '$' sequences in the code are inserted literally.
  html = html.replace(LINK_RE, () => '<style>' + css + '</style>');
  html = html.replace(SCRIPT_RE, () => '<script>' + js + '</script>');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await writeFile(path.join(DIST, 'index.html'), html);

  // PWA files, copied only if present.
  const copied = [];
  const manifest = path.join(SRC, 'manifest.webmanifest');
  if (existsSync(manifest)) {
    await cp(manifest, path.join(DIST, 'manifest.webmanifest'));
    copied.push('manifest.webmanifest');
  }
  const icons = path.join(SRC, 'icons');
  if (existsSync(icons)) {
    await cp(icons, path.join(DIST, 'icons'), { recursive: true });
    copied.push('icons/');
  }
  const sw = path.join(SRC, 'sw.js');
  if (existsSync(sw)) {
    const version = buildVersion();
    const swSrc = await readFile(sw, 'utf8');
    if (!swSrc.includes('__BUILD_VERSION__')) console.warn('warning: src/sw.js has no __BUILD_VERSION__ placeholder');
    await writeFile(path.join(DIST, 'sw.js'), swSrc.replaceAll('__BUILD_VERSION__', version));
    copied.push('sw.js (version ' + version + ')');
  }

  const raw = Buffer.byteLength(html), gz = gzipSync(html, { level: 9 }).length;
  console.log('dist/index.html: ' + raw + ' bytes (' + kb(raw) + '), gzip ' + gz + ' bytes (' + kb(gz) + ')');
  console.log(copied.length ? 'copied: ' + copied.join(', ') : 'no PWA files in src/ (manifest, sw.js, icons): skipped');
}

main().catch(err => fail(err && err.stack || String(err)));
