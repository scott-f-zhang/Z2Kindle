// Stage 4 — static website: one page per chapter + index. Math is pre-rendered with KaTeX
// (no JavaScript needed, works offline and in the Kindle browser).
// Usage: node build/build_web.js <project> [--edition E]   -> <project>/work/web/<edition>/
const fs = require('fs');
const path = require('path');
const katex = require('katex');
const { TOOLKIT, PANDOC_FORMAT, loadProject, parseArgs, bookMeta, chapterFiles, pandoc, checkPandoc } = require('./lib');

const args = parseArgs(process.argv.slice(2));
const p = loadProject(args.target, args.edition);
checkPandoc();
const out = p.out.web;                           // intermediate preview, regenerated each time
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets/fonts'), { recursive: true });

// assets: KaTeX css/fonts (offline), stylesheet, figures
const kdist = path.dirname(require.resolve('katex/dist/katex.min.css'));
fs.copyFileSync(path.join(kdist, 'katex.min.css'), path.join(out, 'assets/katex.min.css'));
for (const f of fs.readdirSync(path.join(kdist, 'fonts'))) {
  if (f.endsWith('.woff2')) fs.copyFileSync(path.join(kdist, 'fonts', f), path.join(out, 'assets/fonts', f));
}
fs.copyFileSync(path.join(TOOLKIT, 'build/styles/web.css'), path.join(out, 'assets/style.css'));
fs.rmSync(path.join(out, 'figs'), { recursive: true, force: true });
if (fs.existsSync(p.figs)) fs.cpSync(p.figs, path.join(out, 'figs'), { recursive: true });

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const errors = [];
function renderMath(html, label) {
  return html.replace(/<span class="math (inline|display)">([\s\S]*?)<\/span>/g, (m, kind, body) => {
    const display = kind === 'display';
    const tex = decode(body).trim().replace(display ? /^\\\[|\\\]$/g : /^\\\(|\\\)$/g, '');
    const opts = { displayMode: display, output: 'htmlAndMathml', strict: 'ignore' };
    try { return katex.renderToString(tex, { ...opts, throwOnError: true }); } catch (e) {
      errors.push(`${label}: ${e.message.split('\n')[0]} :: ${tex.slice(0, 80)}`);
      return katex.renderToString(tex, { ...opts, throwOnError: false });
    }
  });
}
const md2html = file => pandoc(['-f', PANDOC_FORMAT, '-t', 'html5', '--katex', file]);

const page = (title, body, nav = '') => `<!doctype html>
<html lang="${p.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="assets/katex.min.css">
<link rel="stylesheet" href="assets/style.css">
</head><body><main>
${nav}
${body}
${nav}
</main></body></html>`;

const chapters = chapterFiles(p).map(file => {
  const label = path.basename(file);
  let html = renderMath(md2html(file), label);
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, label])[1];
  // A leading "> **Overview：…**" quote is treated as the chapter summary; otherwise the first paragraph.
  const bq = html.match(/<blockquote>(\s*<p><strong>Overview[\s\S]*?)<\/blockquote>/);
  const summary = bq ? bq[1].replace(/<strong>Overview[：:]?<\/strong>\s*/, '') : ((html.match(/<\/h1>\s*<p>([\s\S]*?)<\/p>/) || [, ''])[1]);
  const toc = []; let i = 0;
  html = html.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (m, t) => { i++; toc.push(`<li><a href="#s${i}">${t}</a></li>`); return `<h2 id="s${i}">${t}</h2>`; });
  const tocHtml = `<nav class="toc"><p class="toc-title">${p.t.chapterToc}</p><ol>${toc.join('')}</ol></nav>`;
  if (toc.length) html = bq ? html.replace(bq[0], `${bq[0]}\n${tocHtml}`) : html.replace('<h2 id="s1">', `${tocHtml}\n<h2 id="s1">`);
  return { slug: path.basename(file, '.md').toLowerCase().replace(/[^a-z0-9_-]+/g, '-'), h1, summary, html };
});

chapters.forEach((c, k) => {
  const prev = chapters[k - 1], next = chapters[k + 1];
  const nav = `<nav class="pager">${prev ? `<a href="${prev.slug}.html">${p.t.prev}</a>` : '<span></span>'}<a href="index.html">${p.t.contents}</a>${next ? `<a href="${next.slug}.html">${p.t.next}</a>` : '<span></span>'}</nav>`;
  fs.writeFileSync(path.join(out, `${c.slug}.html`), page(c.h1.replace(/<[^>]+>/g, ''), c.html, nav));
});

let front = '';
if (p.front && fs.existsSync(p.front)) front = renderMath(md2html(p.front), 'front').replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/, '<h2$1>$2</h2>');
const title = p.cfg.title || 'Notes';
const list = chapters.map(c => `<li><a href="${c.slug}.html">${c.h1}</a><div class="ov">${c.summary}</div></li>`).join('\n');
const bm = bookMeta(p), escH = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const metaLine = [bm.authors.map(a => a.name).join(p.lang.startsWith('zh') ? '、' : ', '), bm.publisher, bm.date].filter(Boolean).map(escH).join(' · ');
fs.writeFileSync(path.join(out, 'index.html'), page(title, `<h1>${title}</h1>${metaLine ? `<p class="book-meta">${metaLine}</p>` : ''}${front}<h2>${p.t.chapters}</h2><ol class="chapters">${list}</ol>`));

console.log(`web: ${chapters.length} chapters -> ${out}/index.html`);
if (errors.length) { console.log(`KaTeX errors (${errors.length}):`); errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
