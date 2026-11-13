// Generate a plain black-on-white cover sized to the device screen.
// Used by build_epub.js; can also run alone: node build/cover.js <project> [out.png]
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function makeCover(p, chapterFiles, outFile) {
  const [W, H] = p.device.screen || [1980, 2640];
  const k = W / 1980;                                   // layout designed at 1980 px wide
  const c = p.cfg.cover || {};
  const zh = p.lang.toLowerCase().startsWith('zh');
  const font = c.font || (zh ? 'PingFang SC, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, sans-serif' : 'Helvetica Neue, Arial, sans-serif');
  const heading = c.heading || p.cfg.title || '';
  const sub = c.subheading || '';
  const tagline = c.tagline || p.cfg.subtitle || '';
  const footer = c.footer || `${p.device.name || ''}`;
  const T = (x, y, size, text, weight = 400, fill = '#000') =>
    `<text x="${x * k}" y="${y * k}" font-family="${font}" font-weight="${weight}" font-size="${size * k}" fill="${fill}">${esc(text)}</text>`;

  // chapter list (titles from each chapter's "# " heading), only as many as fit
  const titles = chapterFiles.map(f => (fs.readFileSync(f, 'utf8').match(/^# (.+)$/m) || [, ''])[1].replace(/\s+/g, ' ').trim());
  const top = 1290, step = 78, bottom = (H / k) - 330;
  const fit = Math.max(0, Math.floor((bottom - top) / step));
  const shown = titles.length <= fit ? titles : [];
  const list = shown.map((t, i) => T(200, top + i * step, 54, t.length > 34 ? t.slice(0, 33) + '…' : t, 400, '#222')).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#fff"/>
<rect x="${120 * k}" y="${120 * k}" width="${W - 240 * k}" height="${H - 240 * k}" fill="none" stroke="#000" stroke-width="${6 * k}"/>
${T(200, 560, 150, heading, 700)}
${sub ? T(200, 760, 120, sub, 700) : ''}
<rect x="${200 * k}" y="${860 * k}" width="${W - 400 * k}" height="${10 * k}" fill="#000"/>
${tagline ? T(200, 1000, 64, tagline, 400, '#333') : ''}
${shown.length ? T(200, 1170, 60, zh ? '章节' : 'Chapters', 700) : ''}
${list}
${footer ? T(200, H / k - 200, 48, footer, 400, '#555') : ''}
</svg>`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
  return outFile;
}

module.exports = { makeCover };

if (require.main === module) {
  const { loadProject, chapterFiles } = require('./lib');
  const p = loadProject(process.argv[2] || '.');
  const out = process.argv[3] || path.join(p.work, `epub-${p.id}`, 'cover.png');
  console.log('cover ->', makeCover(p, chapterFiles(p), out));
}
