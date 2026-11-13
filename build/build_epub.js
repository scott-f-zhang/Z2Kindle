// Stage 5 — Kindle-friendly EPUB3. Every formula becomes a grayscale PNG sized in em (Kindle's
// MathML/KaTeX support is unreliable), figures keep their layout classes, cover is generated.
// Usage: node build/build_epub.js <project> [--edition E]  -> <project>/output/<name>[-<edition>].epub
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Resvg } = require('@resvg/resvg-js');
const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');
const { TOOLKIT, PANDOC_FORMAT, loadProject, parseArgs, bookMeta, chapterFiles, pandoc, checkPandoc } = require('./lib');
const { makeCover } = require('./cover');

const args = parseArgs(process.argv.slice(2));
const p = loadProject(args.target, args.edition);
checkPandoc();
const work = path.join(p.work, `epub-${p.id}`);   // per config, so editions don't clash
const mathDir = path.join(work, 'math');
fs.rmSync(mathDir, { recursive: true, force: true });
fs.mkdirSync(mathDir, { recursive: true });
fs.mkdirSync(path.dirname(p.out.epub), { recursive: true });

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mj = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages.filter(x => !['bussproofs', 'autoload', 'require'].includes(x)) }),
  OutputJax: new SVG({ fontCache: 'none' }),
});
const PX_PER_EM = p.device.px_per_em || 72;
const cache = new Map();
const errors = [];

function renderTex(tex, display) {
  const key = (display ? 'D' : 'I') + tex;
  if (cache.has(key)) return cache.get(key);
  let svg = adaptor.innerHTML(mj.convert(tex, { display, em: 16, ex: 8, containerWidth: 1280 }));
  if (/data-mjx-error|merror/.test(svg)) errors.push(tex.slice(0, 100));
  const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/).slice(1).map(Number);
  const wEx = parseFloat(svg.match(/width="([\d.]+)ex"/)[1]);
  const vaEx = parseFloat((svg.match(/vertical-align:\s*([-\d.]+)ex/) || [, '0'])[1]);
  const emPerEx = (vb[2] / 1000) / wEx;            // MathJax viewBox: 1000 units per em
  svg = svg.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ').replace(/currentColor/g, '#000');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: Math.max(1, Math.round(vb[2] / 1000 * PX_PER_EM)) }, background: '#ffffff' }).render().asPng();
  const name = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16) + '.png';
  fs.writeFileSync(path.join(mathDir, name), png);
  const r = { file: path.join(mathDir, name), wEm: vb[2] / 1000, hEm: vb[3] / 1000, vaEm: vaEx * emPerEx };
  cache.set(key, r);
  return r;
}

const f3 = x => x.toFixed(3).replace(/\.?0+$/, '');
function walk(x) {
  if (Array.isArray(x)) return x.map(walk);
  if (!x || typeof x !== 'object') return x;
  if (x.t === 'Math') {
    const display = x.c[0].t === 'DisplayMath';
    const r = renderTex(x.c[1], display);
    const style = display ? `width:${f3(r.wEm)}em;max-width:100%;height:auto;` : `height:${f3(r.hEm)}em;vertical-align:${f3(r.vaEm)}em;`;
    return { t: 'Image', c: [['', [display ? 'math-display' : 'math-inline'], [['style', style]]], [{ t: 'Str', c: x.c[1] }], [r.file, '']] };
  }
  const o = {};
  for (const k of Object.keys(x)) o[k] = walk(x[k]);
  return o;
}
const toAst = file => JSON.parse(pandoc(['-f', PANDOC_FORMAT, '-t', 'json', file]));

const inputs = [];
if (p.front && fs.existsSync(p.front)) {
  let front = fs.readFileSync(p.front, 'utf8');
  if (!/^# /m.test(front)) front = `# ${p.t.preface}\n\n` + front;   // EPUB chapters split on "# "
  const f = path.join(work, '00_front.md');
  fs.writeFileSync(f, front);
  inputs.push(f);
}
const chapters = chapterFiles(p);
inputs.push(...chapters);

let book = null;
for (const f of inputs) {
  const ast = walk(toAst(f));
  if (!book) book = ast; else book.blocks.push(...ast.blocks);
}
const jsonPath = path.join(work, 'book.json');
fs.writeFileSync(jsonPath, JSON.stringify(book));

let cover = p.cfg.cover && p.cfg.cover.image ? p.path(p.cfg.cover.image) : path.join(work, 'cover.png');
if (!(p.cfg.cover && p.cfg.cover.image)) makeCover(p, chapters, cover);

// metadata -> a YAML file for pandoc (EPUB3 dc:* fields, creator roles, stable identifier)
const bm = bookMeta(p);
const metaDoc = {
  title: bm.title, lang: bm.lang, 'toc-title': p.t.contents, date: bm.date,
  identifier: [{ scheme: bm.identifier.scheme, text: bm.identifier.text }],
};
if (bm.subtitle) metaDoc.title = [{ type: 'main', text: bm.title }, { type: 'subtitle', text: bm.subtitle }];   // EPUB3 title-type refinement
if (bm.authors.length) metaDoc.creator = bm.authors.map(a => ({ role: a.role, text: a.name }));
if (bm.contributors.length) metaDoc.contributor = bm.contributors.map(a => ({ role: a.role, text: a.name }));
for (const k of ['publisher', 'rights', 'description']) if (bm[k]) metaDoc[k] = bm[k];
if (bm.subjects.length) metaDoc.subject = bm.subjects.map(String);
if (bm.series) { metaDoc['belongs-to-collection'] = bm.series; if (bm.seriesIndex !== '') metaDoc['group-position'] = String(bm.seriesIndex); }
const metaFile = path.join(work, 'metadata.yaml');
fs.writeFileSync(metaFile, require('js-yaml').dump(metaDoc));
pandoc([
  '-f', 'json', '-t', 'epub3', jsonPath, '-o', p.out.epub,
  '--toc', '--toc-depth=2', '--epub-chapter-level=1',
  '--css', path.join(TOOLKIT, 'build/styles/epub.css'),
  '--epub-cover-image', cover,
  '--metadata-file', metaFile,
  '--resource-path', [work, p.root].join(path.delimiter),
], { stdio: 'inherit' });

const kb = Math.round(fs.statSync(p.out.epub).size / 1024);
console.log(`epub: ${chapters.length} chapters, ${cache.size} formula images, ${kb} KB -> ${p.out.epub}`);
if (errors.length) { console.log(`MathJax errors (${errors.length}):`); errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
