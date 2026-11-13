// Shared helpers for the Node build scripts: project config, chapter order, pandoc.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');

const TOOLKIT = path.resolve(__dirname, '..');
const PANDOC_FORMAT = 'markdown+tex_math_dollars+implicit_figures+lists_without_preceding_blankline';

const I18N = {
  zh: { prev: '← 上一章', next: '下一章 →', contents: '目录', chapterToc: '本章目录', chapters: '章节', preface: '前言' },
  en: { prev: '← Previous', next: 'Next →', contents: 'Contents', chapterToc: 'In this chapter', chapters: 'Chapters', preface: 'Preface' },
};

// Standard project layout (everything for one book lives in one folder):
//   book.yaml  sources/  notes/  notes_<edition>/  figs/  front/
//   work/      regenerable intermediates (extraction, epub build, covers, optional web/<edition>/)
//   output/    final deliverables: <output_name>.epub, <output_name>-<edition>.epub
// One book.yaml holds every edition: top-level keys are the "main" edition; `editions:` maps
// other edition names to overrides (shallow merge; `cover` and `metadata` merged one level deeper).
const MAIN = 'main';

function editionNames(cfg) { return [MAIN, ...Object.keys(cfg.editions || {}).filter(e => e !== MAIN)]; }

function mergeEdition(cfg, edition) {
  if (!edition || edition === MAIN) { const { editions, ...base } = cfg; return base; }
  const ed = (cfg.editions || {})[edition];
  if (!ed) throw new Error(`unknown edition "${edition}" (have: ${editionNames(cfg).join(', ')})`);
  const { editions, ...base } = cfg;
  return { ...base, ...ed, cover: { ...(base.cover || {}), ...(ed.cover || {}) }, metadata: { ...(base.metadata || {}), ...(ed.metadata || {}) } };
}

// `target`: the project folder (or its book.yaml). `edition`: name from `editions:`, default main.
function loadProject(target, edition = MAIN) {
  target = path.resolve(target);
  const isCfg = /\.ya?ml$/.test(target);
  const root = isCfg ? path.dirname(target) : target;
  const cfgFile = isCfg ? target : path.join(root, 'book.yaml');
  if (!fs.existsSync(cfgFile)) throw new Error(`config not found: ${cfgFile}`);
  const raw = yaml.load(fs.readFileSync(cfgFile, 'utf8')) || {};
  if (raw.output && typeof raw.output === 'object') console.warn('note: `output:` paths are no longer used; finals go to output/, web to work/web/<edition>/');
  const cfg = mergeEdition(raw, edition || MAIN);
  const profiles = yaml.load(fs.readFileSync(path.join(TOOLKIT, 'profiles/devices.yaml'), 'utf8'));
  const deviceId = cfg.device || 'scribe-11';
  if (!profiles[deviceId]) throw new Error(`unknown device "${deviceId}" (see profiles/devices.yaml)`);
  const lang = cfg.language || 'en';
  const ed = edition || MAIN;
  const p = {
    root, cfg, raw, lang, id: ed, edition: ed, editions: editionNames(raw),
    device: profiles[deviceId],
    t: I18N[lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'],
    path: (...x) => path.join(root, ...x),
  };
  p.sources = p.path(cfg.sources || 'sources');
  p.notes = p.path(cfg.notes || (ed === MAIN ? 'notes' : `notes_${ed}`));
  p.work = p.path('work');
  p.figs = p.path('figs');
  p.front = cfg.front ? p.path(cfg.front) : null;
  const base = (raw.editions || {})[ed]?.output_name || (ed === MAIN ? raw.output_name : null)
    || `${raw.output_name || path.basename(root)}${ed === MAIN ? '' : '-' + ed}`;
  p.out = { dir: p.path('output'), epub: p.path('output', `${base}.epub`), web: p.path('work', 'web', ed) };
  return p;
}

// Shared CLI parsing for the build scripts: <project> [--edition E] [--all] [--web] [other --k v]
function parseArgs(argv) {
  const a = { target: '.', edition: MAIN, all: false, web: false, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--all') a.all = true;
    else if (x === '--web') a.web = true;
    else if (x === '--edition' || x === '-e') a.edition = argv[++i];
    else if (x.startsWith('--')) { const v = argv[++i]; a.opts[x.slice(2)] = /^\d+$/.test(v) ? Number(v) : v; }
    else a.target = x;
  }
  return a;
}

// Book metadata embedded in the EPUB (and shown on the cover / web index). From `metadata:` in
// book.yaml (per-edition overrides allowed); top-level `author:` still works.
const ROLES = { author: 'aut', editor: 'edt', translator: 'trl', illustrator: 'ill', contributor: 'ctb', compiler: 'com', narrator: 'nrt', publisher: 'pbl' };
const list = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
function bookMeta(p) {
  const m = p.cfg.metadata || {};
  const people = (v, role) => list(v).map(x => (typeof x === 'string' ? { name: x, role } : { name: x.name, role: x.role || role }))
    .filter(x => x.name).map(x => ({ ...x, role: ROLES[x.role] || x.role }));
  const today = new Date().toISOString().slice(0, 10);
  let id = m.identifier;
  if (!id) {                                   // stable per project + edition, so re-sent books replace the old copy
    const h = require('crypto').createHash('sha1').update(`z2kindle:${path.basename(p.root)}:${p.edition}`).digest('hex');
    id = `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${(8 | (parseInt(h[16], 16) & 3)).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }
  const isbn = /^(97[89])?[\d-]{9,}[\dXx]$/.test(String(id).replace(/^isbn:/i, ''));
  return {
    title: p.cfg.title || '', subtitle: p.cfg.subtitle || '', lang: p.lang,
    authors: people(m.author ?? p.cfg.author, 'aut'),
    contributors: people(m.contributors, 'ctb'),
    date: m.date ? String(m.date instanceof Date ? m.date.toISOString().slice(0, 10) : m.date) : today,
    publisher: m.publisher || '', rights: m.rights || '', description: m.description || '',
    subjects: list(m.subject ?? m.subjects ?? m.keywords),
    identifier: { scheme: isbn ? 'ISBN-13' : 'UUID', text: String(id).replace(/^isbn:/i, '') },
    series: m.series || '', seriesIndex: m.series_index ?? m.seriesIndex ?? '',
  };
}

const naturalKey = s => { const m = s.match(/\d+/); return m ? parseInt(m[0], 10) : Infinity; };

// Chapter files in reading order: explicit `chapters:` list, else every notes/*.md sorted naturally.
function chapterFiles(p) {
  if (p.cfg.chapters) return p.cfg.chapters.map(s => path.join(p.notes, s + '.md'));
  return fs.readdirSync(p.notes).filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .sort((a, b) => naturalKey(a) - naturalKey(b) || a.localeCompare(b))
    .map(f => path.join(p.notes, f));
}

function pandoc(args, opts = {}) {
  return execFileSync('pandoc', args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
}

function checkPandoc() {
  const v = pandoc(['--version']).split('\n')[0];
  const major = parseInt((v.match(/pandoc\S*\s+(\d+)/) || [, '0'])[1], 10);
  if (major >= 3) console.warn(`warning: ${v} — the toolkit is tested with pandoc 2.x; figure markup changed in 3.x, check the output.`);
  return v;
}

const h1Of = file => (fs.readFileSync(file, 'utf8').match(/^# (.+)$/m) || [, path.basename(file, '.md')])[1].trim();

module.exports = { TOOLKIT, PANDOC_FORMAT, MAIN, loadProject, parseArgs, editionNames, bookMeta, chapterFiles, pandoc, checkPandoc, h1Of };
