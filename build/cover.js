// Cover generator, sized to the device screen. Three styles (book.yaml `cover.style`):
//   plain     black-on-white title page with the chapter list (default)
//   figures   title + a collage of figures from the notes (auto-picked or listed)
//   abstract  title card over generative art: flow | contours | mosaic | orbits | network | circuit
// Used by build_epub.js; can also run alone:
//   node build/cover.js <project> [--edition E] [--style S] [--art A] [--seed N]
//        [--palette P] [--count N] [--out file.png]
//   node build/cover.js <project> --gallery     # render every style/art into work/covers/<edition>/ + contact.png
//   node build/cover.js <project> --gallery --style abstract   # only the generative arts (3 x 2 sheet)
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ARTS = ['flow', 'contours', 'mosaic', 'orbits', 'network', 'circuit'];
const PALETTES = {
  mono:   { bg: '#f4f4f1', ink: ['#111111', '#3a3a3a', '#6b6b6b', '#9d9d9d', '#cfcfcf'] },
  ink:    { bg: '#f3efe6', ink: ['#1d3557', '#457b9d', '#a8dadc', '#e63946', '#2a2a2a'] },
  forest: { bg: '#eef0e8', ink: ['#283618', '#606c38', '#dda15e', '#bc6c25', '#1b1b1b'] },
  dusk:   { bg: '#f5efe9', ink: ['#22223b', '#4a4e69', '#9a8c98', '#c9ada7', '#e07a5f'] },
};

// ---------- deterministic randomness + value noise ----------
function hashStr(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; }
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function noise2(rand) {
  const P = 256, g = Array.from({ length: P * P }, rand);
  const at = (i, j) => g[((i % P + P) % P) * P + ((j % P + P) % P)];
  const sm = t => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y) => (n(x, y) * 0.6 + n(x * 2.1 + 17, y * 2.1 + 9) * 0.28 + n(x * 4.3 + 3, y * 4.3 + 41) * 0.12);
}

// ---------- image helpers (figures style) ----------
function imageSize(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf[0] === 0xff && buf[1] === 0xd8) {                       // JPEG: find SOFn
    for (let i = 2; i < buf.length - 9;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return [4, 3];
}
const dataUri = (buf, f) => `data:image/${/\.jpe?g$/i.test(f) ? 'jpeg' : 'png'};base64,${buf.toString('base64')}`;

// Figures used in the notes, one candidate per chapter (largest file ≈ richest picture), spread over the book.
function autoFigures(p, chapterFiles, count) {
  const per = [];
  for (const f of chapterFiles) {
    const refs = [...fs.readFileSync(f, 'utf8').matchAll(/!\[[^\n]*?\]\(([^)\s]+\.(?:png|jpe?g))\)/gi)].map(m => m[1]);
    const ok = refs.map(r => p.path(r)).filter(fp => fs.existsSync(fp)).map(fp => {
      const [w, h] = imageSize(fs.readFileSync(fp)); return { fp, w, h, size: fs.statSync(fp).size };
    }).filter(x => x.w / x.h < 3.2 && x.h / x.w < 2);           // skip extreme strips
    if (ok.length) per.push(ok.sort((a, b) => b.size - a.size)[0].fp);
  }
  if (per.length <= count) return per;
  return Array.from({ length: count }, (_, i) => per[Math.round(i * (per.length - 1) / (count - 1 || 1))]);
}

// ---------- shared text block ----------
function ctx(p, opts) {
  const [W, H] = p.device.screen || [1980, 2640];
  const c = { ...(p.cfg.cover || {}), ...opts };
  const zh = p.lang.toLowerCase().startsWith('zh');
  const font = c.font || (zh ? 'PingFang SC, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, sans-serif' : 'Helvetica Neue, Arial, sans-serif');
  const k = W / 1980;                                              // layouts designed at 1980 px wide
  const T = (x, y, size, text, weight = 400, fill = '#000', anchor = 'start') =>
    `<text x="${x * k}" y="${y * k}" font-family="${font}" font-weight="${weight}" font-size="${size * k}" fill="${fill}" text-anchor="${anchor}">${esc(text)}</text>`;
  let pal = c.palette || (p.device.color ? 'ink' : 'mono');
  pal = Array.isArray(pal) ? { bg: '#f4f4f1', ink: pal } : (PALETTES[pal] || PALETTES.mono);
  return {
    W, H, k, c, zh, T, pal,
    heading: c.heading || p.cfg.title || '', sub: c.subheading || '',
    tagline: c.tagline || p.cfg.subtitle || '', footer: c.footer || `${p.device.name || ''}`,
    seed: hashStr(String(p.cfg.title || '') + ':' + (c.seed ?? 1)),
    author: c.show_author === false ? '' : require('./lib').bookMeta(p).authors.map(a => a.name).join(zh ? '、' : ', '),
  };
}
// heading / subheading / rule / tagline starting at design-y `y0`; returns [svg, bottom design-y]
// rough rendered width of a string in em (bold sans): CJK full width, Latin by letter class
const emWidth = t => [...String(t)].reduce((w, c) => w + (/[\u2e80-\uffef]/.test(c) ? 1 : /[A-Z]/.test(c) ? 0.72
  : /[mwMW]/.test(c) ? 0.9 : /[ilj.,'·:;|!]/.test(c) ? 0.3 : c === ' ' ? 0.28 : 0.6), 0);
// fit a line into `width`: break a too-long heading at a space into two lines, then shrink if still too wide
function fitLines(text, size, width, allowWrap) {
  const t = String(text || '');
  if (emWidth(t) * size <= width) return [[t], size];
  const words = t.split(' ');
  if (allowWrap && words.length > 1) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), w = Math.max(emWidth(a), emWidth(b));
      if (!best || w < best[2]) best = [a, b, w];
    }
    return [[best[0], best[1]], Math.min(size, Math.floor(width / best[2]))];
  }
  return [[t], Math.floor(width / emWidth(t))];
}
function titleBlock(x, y0, width, X) {
  const { k, T, heading, sub, tagline, author } = X;
  const [hl, hs] = fitLines(heading, 150, width, true), [sl, ss] = fitLines(sub, 116, width, false);
  let y = y0 + 150 - (150 - hs) * 0.6, s = '';
  hl.forEach((line, i) => { if (i) y += hs * 1.15; s += T(x, y, hs, line, 700); });
  if (sub) { y += 190 - (150 - hs) * 0.4; s += T(x, y, ss, sl[0], 700); }
  y += 90; s += `<rect x="${x * k}" y="${y * k}" width="${width * k}" height="${10 * k}" fill="#000"/>`;
  if (tagline) { y += 130; s += T(x, y, 62, tagline, 400, '#333'); }
  if (author) { y += 110; s += T(x, y, 60, author, 700, '#111'); }
  return [s, y];
}
const svgDoc = (X, body, bg = '#fff') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${X.W}" height="${X.H}"><rect width="${X.W}" height="${X.H}" fill="${bg}"/>${body}</svg>`;

// ---------- style: plain ----------
function plain(p, chapterFiles, X) {
  const { W, H, k, T, zh, footer } = X;
  const titles = chapterFiles.map(f => (fs.readFileSync(f, 'utf8').match(/^# (.+)$/m) || [, ''])[1]
    .replace(/\s+/g, ' ').replace(/\s*[（(][^（()）]*[）)]\s*$/, '').trim());     // drop trailing "(English title)"
  const [tb, yEnd] = titleBlock(200, 410, W / k - 400, X);
  const headY = Math.max(1170, yEnd + 170), top = headY + 120, bottom = (H / k) - 330;
  // one column if it fits, else two narrower columns, else no list
  let step = 78, cols = 1;
  if (Math.floor((bottom - top) / step) < titles.length) { step = 70; cols = 2; }
  const room = Math.floor((bottom - top) / step), shown = titles.length <= room * cols ? titles : [];
  const perCol = Math.max(1, Math.ceil(shown.length / cols));                    // balance the columns
  const maxLen = cols === 1 ? 34 : 15, colW = (W / k - 400) / cols;
  const list = shown.map((t, i) => T(200 + Math.floor(i / perCol) * colW, top + (i % perCol) * step, cols === 1 ? 54 : 46,
    t.length > maxLen ? t.slice(0, maxLen - 1) + '…' : t, 400, '#222')).join('');
  return svgDoc(X, `<rect x="${120 * k}" y="${120 * k}" width="${W - 240 * k}" height="${H - 240 * k}" fill="none" stroke="#000" stroke-width="${6 * k}"/>
${tb}${shown.length ? T(200, headY, 60, zh ? '章节' : 'Chapters', 700) : ''}${list}
${footer ? T(200, H / k - 200, 48, footer, 400, '#555') : ''}`);
}

// ---------- style: figures ----------
function figures(p, chapterFiles, X) {
  const { W, H, k, T, c, footer } = X;
  const count = Math.max(1, Math.min(9, c.count || 6));
  const list = Array.isArray(c.figures) ? c.figures.map(f => p.path(f)) : autoFigures(p, chapterFiles, count);
  if (!list.length) { console.warn('cover: no figures found, falling back to plain'); return plain(p, chapterFiles, X); }
  const [tb, yEnd] = titleBlock(160, 150, W / k - 320, X);
  const top = (yEnd + 90) * k, left = 160 * k, right = W - 160 * k, bottom = H - 260 * k, gap = 36 * k;
  const n = list.length, cols = n <= 2 ? 1 : n <= 6 ? 2 : 3, rows = Math.ceil(n / cols);
  const tw = (right - left - gap * (cols - 1)) / cols, th = (bottom - top - gap * (rows - 1)) / rows, pad = 28 * k;
  const tiles = list.map((fp, i) => {
    const r = Math.floor(i / cols), lastRow = r === rows - 1, inRow = lastRow ? n - r * cols : cols;
    const rowW = inRow * tw + (inRow - 1) * gap, x0 = left + (right - left - rowW) / 2 + (i - r * cols) * (tw + gap), y0 = top + r * (th + gap);
    const buf = fs.readFileSync(fp);
    return `<rect x="${x0}" y="${y0}" width="${tw}" height="${th}" fill="#fff" stroke="#111" stroke-width="${4 * k}"/>
<image x="${x0 + pad}" y="${y0 + pad}" width="${tw - 2 * pad}" height="${th - 2 * pad}" preserveAspectRatio="xMidYMid meet" xlink:href="${dataUri(buf, fp)}"/>`;
  }).join('\n');
  return svgDoc(X, `${tb}${tiles}${footer ? T(160, H / k - 150, 48, footer, 400, '#555') : ''}`);
}

// ---------- style: abstract ----------
function art(kind, X) {
  const { W, H, k, pal } = X;
  const rand = rng(X.seed), pick = a => a[Math.floor(rand() * a.length)], N = noise2(rand);
  const out = [];
  if (kind === 'flow') {
    const f = 0.0016 / k, step = 9 * k;
    for (let i = 0; i < 900; i++) {
      let x = rand() * W, y = rand() * H; const pts = [];
      for (let s = 0; s < 70 && x > -20 && x < W + 20 && y > -20 && y < H + 20; s++) {
        pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`); const a = N(x * f, y * f) * Math.PI * 4;
        x += Math.cos(a) * step; y += Math.sin(a) * step;
      }
      if (pts.length > 4) out.push(`<path d="M${pts.join('L')}" fill="none" stroke="${pick(pal.ink)}" stroke-width="${(1.5 + rand() * 6) * k}" stroke-linecap="round" opacity="0.85"/>`);
    }
  } else if (kind === 'contours') {
    const cs = 18 * k, nx = Math.ceil(W / cs) + 1, ny = Math.ceil(H / cs) + 1, f = 0.0011 / k;
    const v = Array.from({ length: ny }, (_, j) => Array.from({ length: nx }, (_, i) => N(i * cs * f, j * cs * f)));
    let lo = Infinity, hi = -Infinity; v.flat().forEach(z => { lo = Math.min(lo, z); hi = Math.max(hi, z); });
    const levels = 18;
    for (let l = 1; l < levels; l++) {
      const t = lo + (hi - lo) * l / levels, segs = [];
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const q = [v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]], P = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const cross = [];
        for (let e = 0; e < 4; e++) {
          const a = q[e], b = q[(e + 1) % 4];
          if ((a < t) !== (b < t)) { const u = (t - a) / (b - a), A = P[e], B = P[(e + 1) % 4]; cross.push([(A[0] + (B[0] - A[0]) * u) * cs, (A[1] + (B[1] - A[1]) * u) * cs]); }
        }
        for (let m = 0; m + 1 < cross.length; m += 2) segs.push(`M${cross[m][0].toFixed(1)} ${cross[m][1].toFixed(1)}L${cross[m + 1][0].toFixed(1)} ${cross[m + 1][1].toFixed(1)}`);
      }
      const major = l % 4 === 0;
      out.push(`<path d="${segs.join('')}" fill="none" stroke="${pal.ink[major ? 0 : 1 + (l % (pal.ink.length - 1))]}" stroke-width="${(major ? 6 : 2.5) * k}" stroke-linecap="round"/>`);
    }
  } else if (kind === 'mosaic') {
    const cols = 6, s = W / cols, rows = Math.ceil(H / s);
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const x = q * s, y = r * s, bg = pick(pal.ink); let fg = pick(pal.ink); if (fg === bg) fg = pal.bg;
      out.push(`<rect x="${x}" y="${y}" width="${s + 1}" height="${s + 1}" fill="${bg}"/>`);
      const kind2 = Math.floor(rand() * 5), cx = x + (rand() < 0.5 ? 0 : s), cy = y + (rand() < 0.5 ? 0 : s);
      if (kind2 === 0) out.push(`<path d="M${cx} ${cy}L${cx === x ? x + s : x} ${cy}A${s} ${s} 0 0 ${(cx === x) === (cy === y) ? 1 : 0} ${cx} ${cy === y ? y + s : y}Z" fill="${fg}"/>`);
      else if (kind2 === 1) out.push(`<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * 0.34}" fill="${fg}"/>`);
      else if (kind2 === 2) out.push(`<path d="M${x} ${y}L${x + s} ${y + s}L${rand() < 0.5 ? x : x + s} ${rand() < 0.5 ? y + s : y}Z" fill="${fg}"/>`);
      else if (kind2 === 3) for (let b = 0; b < 4; b++) out.push(`<rect x="${x}" y="${y + b * s / 4}" width="${s + 1}" height="${s / 8}" fill="${fg}"/>`);
      else out.push(`<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * 0.36}" fill="none" stroke="${fg}" stroke-width="${s * 0.1}"/><circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * 0.1}" fill="${fg}"/>`);
    }
  } else if (kind === 'orbits') {
    for (let c = 0; c < 4; c++) {
      const cx = rand() * W, cy = H * (0.25 + rand() * 0.75), rings = 10 + Math.floor(rand() * 14);
      for (let i = 1; i <= rings; i++) {
        const r = i * (34 + rand() * 30) * k, len = 2 * Math.PI * r, dash = rand() < 0.5 ? '' : ` stroke-dasharray="${(len * (0.1 + rand() * 0.5)).toFixed(0)} ${(len * rand() * 0.4).toFixed(0)}"`;
        out.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="${pick(pal.ink)}" stroke-width="${(2 + rand() * 12) * k}"${dash} transform="rotate(${(rand() * 360).toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`);
      }
    }
  } else if (kind === 'network') {
    // a social-network drawing: separated communities, k-nearest links inside them,
    // preferential attachment that grows one hub per community, dashed weak ties between them
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    const nComm = 5 + Math.floor(rand() * 2), centers = [];
    for (let tries = 0; centers.length < nComm && tries < 2000; tries++) {   // spread communities out
      const c = [W * (0.13 + rand() * 0.74), H * (0.40 + rand() * 0.50)];
      if (centers.every(([x, y]) => (x - c[0]) ** 2 + (y - c[1]) ** 2 > (0.27 * W) ** 2)) centers.push(c);
    }
    const nodes = [];
    centers.forEach(([cx, cy], c) => {
      const m = 9 + Math.floor(rand() * 6), spread = (75 + rand() * 35) * k;
      for (let i = 0; i < m; i++) nodes.push({ x: cx + gauss() * spread, y: cy + gauss() * spread, c, deg: 0 });
    });
    for (let i = 0; i < 12; i++) nodes.push({ x: W * (0.04 + rand() * 0.92), y: H * (0.04 + rand() * 0.94), c: -1 - i, deg: 0 });
    const edges = new Map(), key = (i, j) => (i < j ? `${i}-${j}` : `${j}-${i}`);
    const link = (i, j) => { if (i !== j && !edges.has(key(i, j))) { edges.set(key(i, j), [i, j]); nodes[i].deg++; nodes[j].deg++; } };
    const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => [d2(a, b), j]).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0]);
      for (let s = 0; s < 2; s++) link(i, near[s][1]);
    });
    centers.forEach((_, c) => {                                       // rich get richer inside each community
      const mem = nodes.map((n, i) => [n, i]).filter(([n]) => n.c === c).map(([, i]) => i);
      for (let s = 0; s < mem.length; s++) {
        const tot = mem.reduce((z, i) => z + nodes[i].deg, 0); let r = rand() * tot, j = 0;
        while ((r -= nodes[mem[j]].deg) > 0 && j < mem.length - 1) j++;
        link(mem[Math.floor(rand() * mem.length)], mem[j]);
      }
    });
    const hubs = new Set(centers.map((_, c) => nodes.reduce((b, n, i) => (n.c === c && (b < 0 || n.deg > nodes[b].deg) ? i : b), -1)));
    const hubList = [...hubs];
    hubList.forEach((h, i) => link(h, hubList[(i + 1) % hubList.length]));   // weak ties: hubs bridge communities
    for (let s = 0; s < 4; s++) { const i = Math.floor(rand() * nodes.length), j = Math.floor(rand() * nodes.length); if (nodes[i].c !== nodes[j].c) link(i, j); }
    const maxDeg = Math.max(...nodes.map(n => n.deg));
    for (const [i, j] of edges.values()) {
      const a = nodes[i], b = nodes[j], weak = a.c !== b.c;
      out.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${weak ? pal.ink[2] : pal.ink[1]}" stroke-width="${(weak ? 3.5 : 5) * k}"${weak ? ` stroke-dasharray="${14 * k} ${10 * k}"` : ''} stroke-linecap="round"/>`);
    }
    nodes.forEach((n, i) => {
      const hub = hubs.has(i), r = (hub ? 40 : 13 + 20 * Math.sqrt(n.deg / maxDeg)) * k;
      const fill = hub ? pal.ink[0] : (n.c >= 0 && n.c % 2 === 0 ? pal.ink[3] : pal.bg);
      out.push(`<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" stroke="${pal.ink[0]}" stroke-width="${4 * k}"/>`);
      if (hub) out.push(`<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${(r * 0.38).toFixed(1)}" fill="${pal.bg}"/>`);
    });
  } else if (kind === 'circuit') {
    // a circuit board: chips with pins, traces routed on a grid with 45-degree bends, via pads
    const g = 44 * k, nx = Math.floor(W / g), ny = Math.floor(H / g);
    const used = Array.from({ length: ny + 1 }, () => new Uint8Array(nx + 1));
    const free = (i, j) => i > 0 && j > 0 && i < nx && j < ny && !used[j][i];
    const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const chips = [], pins = [];
    for (let tries = 0; chips.length < 3 && tries < 400; tries++) {   // chips sit below the title card
      const w = 5 + Math.floor(rand() * 5), h = 4 + Math.floor(rand() * 4);
      const i0 = 3 + Math.floor(rand() * (nx - w - 6)), j0 = Math.floor(ny * 0.48) + Math.floor(rand() * (ny * 0.42 - h));
      if (chips.some(c => i0 < c.i0 + c.w + 4 && c.i0 < i0 + w + 4 && j0 < c.j0 + c.h + 4 && c.j0 < j0 + h + 4)) continue;
      chips.push({ i0, j0, w, h });
      for (let j = j0 - 1; j <= j0 + h + 1; j++) for (let i = i0 - 1; i <= i0 + w + 1; i++) if (used[j]) used[j][i] = 1;
      for (let i = i0 + 1; i < i0 + w; i++) { pins.push([i, j0 - 1, 6]); pins.push([i, j0 + h + 1, 2]); }
      for (let j = j0 + 1; j < j0 + h; j++) { pins.push([i0 - 1, j, 4]); pins.push([i0 + w + 1, j, 0]); }
    }
    const traces = [];
    const route = (i, j, d, maxLen) => {
      const pts = [[i, j]];
      for (let s = 0; s < maxLen; s++) {
        if (s > 2 && rand() < 0.16) d = (d + (rand() < 0.5 ? 1 : 7)) % 8;    // bend by 45 degrees
        const [di, dj] = DIRS[d], ni = i + di, nj = j + dj;
        if (!free(ni, nj) || (di && dj && (used[j][ni] && used[nj][i]))) break;  // no crossing on diagonals
        i = ni; j = nj; used[j][i] = 1; pts.push([i, j]);
      }
      if (pts.length > 2) traces.push(pts);
    };
    pins.forEach(([i, j, d]) => { if (rand() < 0.8) route(i, j, d, 8 + Math.floor(rand() * 40)); });
    for (let s = 0; s < 70; s++) {                                     // free-running traces fill the board
      const i = 1 + Math.floor(rand() * (nx - 1)), j = 1 + Math.floor(rand() * (ny - 1));
      if (free(i, j)) { used[j][i] = 1; route(i, j, Math.floor(rand() * 8), 6 + Math.floor(rand() * 30)); }
    }
    traces.forEach((pts, t) => {
      const wide = t % 5 === 0, sw = (wide ? 9 : 5) * k;
      out.push(`<path d="M${pts.map(([i, j]) => `${i * g} ${j * g}`).join('L')}" fill="none" stroke="${pal.ink[wide ? 0 : 1]}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`);
      const [ei, ej] = pts[pts.length - 1];
      out.push(`<circle cx="${ei * g}" cy="${ej * g}" r="${13 * k}" fill="${pal.bg}" stroke="${pal.ink[0]}" stroke-width="${6 * k}"/>`);
    });
    chips.forEach(({ i0, j0, w, h }) => {
      for (const [i, j] of pins.filter(([i, j]) => i >= i0 - 1 && i <= i0 + w + 1 && j >= j0 - 1 && j <= j0 + h + 1)) {
        const x = i * g, y = j * g;
        out.push(`<rect x="${x - 9 * k}" y="${y - 9 * k}" width="${18 * k}" height="${18 * k}" fill="${pal.ink[2]}"/>`);
      }
      out.push(`<rect x="${i0 * g}" y="${j0 * g}" width="${w * g}" height="${h * g}" rx="${8 * k}" fill="${pal.ink[0]}"/>`);
      out.push(`<circle cx="${(i0 + 0.7) * g}" cy="${(j0 + 0.7) * g}" r="${10 * k}" fill="${pal.bg}"/>`);
    });
  } else throw new Error(`unknown cover art "${kind}" (choose: ${ARTS.join(', ')})`);
  return out.join('\n');
}
function abstract(p, chapterFiles, X) {
  const { W, H, k, T, c, footer, pal } = X;
  const kind = c.art || ARTS[X.seed % ARTS.length];
  const [tb, yEnd] = titleBlock(240, 300, W / k - 480, X);
  const cardH = (yEnd + 120 - 260) * k;
  const card = `<rect x="${160 * k}" y="${260 * k}" width="${W - 320 * k}" height="${cardH}" fill="#fff" stroke="#111" stroke-width="${6 * k}"/>`;
  const foot = footer ? `<rect x="${160 * k}" y="${H - 250 * k}" width="${W - 320 * k}" height="${120 * k}" fill="#fff" stroke="#111" stroke-width="${4 * k}"/>${T(W / k / 2, H / k - 172, 46, footer, 400, '#333', 'middle')}` : '';
  return svgDoc(X, `${art(kind, X)}\n${card}${tb}${foot}`, pal.bg);
}

// ---------- entry points ----------
const STYLES = { plain, figures, abstract };
function renderCover(p, chapterFiles, outFile, opts = {}) {
  const X = ctx(p, opts);
  const style = X.c.style || 'plain';
  if (!STYLES[style]) throw new Error(`unknown cover style "${style}" (choose: ${Object.keys(STYLES).join(', ')})`);
  const svg = STYLES[style](p, chapterFiles, X);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
  return outFile;
}
const makeCover = (p, chapterFiles, outFile) => renderCover(p, chapterFiles, outFile);

function gallery(p, chapterFiles, dir, opts = {}) {
  const abstracts = ARTS.map(a => [`abstract-${a}`, { style: 'abstract', art: a }]);
  const onlyAbstract = opts.style === 'abstract';             // --style abstract: just the generative arts
  const variants = onlyAbstract ? abstracts
    : [['plain', {}], ['figures', { style: 'figures' }], ['figures-3', { style: 'figures', count: 3 }], ...abstracts];
  const files = variants.map(([name, o]) => [name, renderCover(p, chapterFiles, path.join(dir, `${name}.png`), { ...opts, ...o })]);
  const [W, H] = p.device.screen || [1980, 2640], tw = 360, th = Math.round(tw * H / W), cols = onlyAbstract ? 3 : 4, rows = Math.ceil(files.length / cols);
  const cells = files.map(([name, f], i) => {
    const x = 30 + (i % cols) * (tw + 30), y = 30 + Math.floor(i / cols) * (th + 80);
    return `<image x="${x}" y="${y}" width="${tw}" height="${th}" xlink:href="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"/><rect x="${x}" y="${y}" width="${tw}" height="${th}" fill="none" stroke="#999"/><text x="${x + tw / 2}" y="${y + th + 44}" font-family="Helvetica, Arial, sans-serif" font-size="28" text-anchor="middle">${name}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${30 + cols * (tw + 30)}" height="${30 + rows * (th + 80)}"><rect width="100%" height="100%" fill="#fff"/>${cells}</svg>`;
  const contact = path.join(dir, 'contact.png');
  fs.writeFileSync(contact, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
  return [files, contact];
}

module.exports = { makeCover, renderCover, ARTS, PALETTES };

if (require.main === module) {
  const { loadProject, parseArgs, chapterFiles } = require('./lib');
  const argv = process.argv.slice(2), gallery_ = argv.includes('--gallery');
  const a = parseArgs(argv.filter(x => x !== '--gallery'));
  const { out, ...opts } = a.opts;
  const p = loadProject(a.target, a.edition), ch = chapterFiles(p);
  if (gallery_) {
    const [files, contact] = gallery(p, ch, out || path.join(p.work, 'covers', p.edition), opts);
    files.forEach(([n, f]) => console.log(`${n.padEnd(18)} ${f}`)); console.log('contact sheet ->', contact);
  } else {
    console.log('cover ->', renderCover(p, ch, out || path.join(p.work, `epub-${p.id}`, 'cover.png'), opts));
  }
}
