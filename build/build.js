// One-shot build: EPUB for every edition (or one), plus the web preview only when asked.
//   node build/build.js <project> [--edition E] [--web]
// Web is produced when --web is given or book.yaml has `web: true` (per edition allowed).
// Finals: <project>/output/*.epub     Web preview (intermediate): <project>/work/web/<edition>/
const path = require('path');
const { execFileSync } = require('child_process');
const { loadProject, parseArgs } = require('./lib');

const a = parseArgs(process.argv.slice(2));
const first = loadProject(a.target);
const editions = process.argv.includes('--edition') || process.argv.includes('-e') ? [a.edition] : first.editions;
const run = (script, ed) => execFileSync(process.execPath, [path.join(__dirname, script), first.root, '--edition', ed], { stdio: 'inherit' });

const built = [];
for (const ed of editions) {
  const p = loadProject(first.root, ed);
  console.log(`\n== edition: ${ed}`);
  run('build_epub.js', ed); built.push(p.out.epub);
  if (a.web || p.cfg.web === true) { run('build_web.js', ed); built.push(path.join(p.out.web, 'index.html')); }
}
console.log('\nbuilt:\n  ' + built.map(f => path.relative(process.cwd(), f) || f).join('\n  '));
