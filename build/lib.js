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

// `target`: a project folder (uses its book.yaml) or a path to any .yaml config (e.g. an
// alternate edition). Paths inside the config are relative to the config's folder.
function loadProject(target) {
  target = path.resolve(target);
  const isCfg = /\.ya?ml$/.test(target);
  const root = isCfg ? path.dirname(target) : target;
  const cfgFile = isCfg ? target : path.join(root, 'book.yaml');
  if (!fs.existsSync(cfgFile)) throw new Error(`config not found: ${cfgFile}`);
  const cfg = yaml.load(fs.readFileSync(cfgFile, 'utf8')) || {};
  const profiles = yaml.load(fs.readFileSync(path.join(TOOLKIT, 'profiles/devices.yaml'), 'utf8'));
  const deviceId = cfg.device || 'scribe-11';
  if (!profiles[deviceId]) throw new Error(`unknown device "${deviceId}" (see profiles/devices.yaml)`);
  const lang = cfg.language || 'zh-CN';
  const p = {
    root, cfg, lang, id: path.basename(cfgFile).replace(/\.ya?ml$/, ''),
    device: profiles[deviceId],
    t: I18N[lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'],
    path: (...x) => path.join(root, ...x),
  };
  p.sources = p.path(cfg.sources || 'sources');
  p.notes = p.path(cfg.notes || 'notes');
  p.work = p.path('work');
  p.figs = p.path('figs');
  p.front = cfg.front ? p.path(cfg.front) : null;
  p.out = { web: p.path((cfg.output || {}).web || 'dist/web'), epub: p.path((cfg.output || {}).epub || 'dist/book.epub') };
  return p;
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

module.exports = { TOOLKIT, PANDOC_FORMAT, loadProject, chapterFiles, pandoc, checkPandoc, h1Of };
