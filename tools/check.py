"""Validate chapter notes before building.

    python3 -I tools/check.py <project> [--edition E] [--baseline EDITION|DIR] [--book]

Per chapter (notes/<stem>.md) it checks:
  * exactly one "# " title; fenced divs (:::) balanced; $$ delimiters balanced
  * every figure path exists; figure captions numbered 1..n ("图 X-n" or "Figure X-n");
    every figure number is referenced in the body text
  * no raw HTML-looking tags outside code spans / math (e.g. a bare <s> would be eaten as HTML)
  * zh-CN / zh-Hans books: no traditional characters (needs `opencc-python-reimplemented`)
  * --baseline EDITION|DIR: every display formula and figure path of that edition's (or DIR's)
    <stem>.md is still present
    (use when rewriting notes, e.g. the book-style pass)
  * --book: required headings (book.yaml `book_required_headings`, default 本讲小结/关键公式/术语对照)
Also reports figure files under figs/ that no chapter uses. Exit code 1 if any check fails.
"""
import argparse
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from z2k_project import Project  # noqa: E402

norm = lambda s: re.sub(r'\s+', '', s)
# image: ![alt](path) — alt may itself contain ']' (e.g. math like [h; c]), so only a ']' followed by '(' ends it
IMG = re.compile(r'!\[((?:[^\]]|\](?!\())*)\]\(([^)\s]+)\)')
CODE_MATH = re.compile(r'\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]*`')


def load_t2s(lang):
    if not str(lang).lower().startswith(('zh-cn', 'zh-hans', 'zh_cn')):
        return None
    try:
        from opencc import OpenCC
        return OpenCC('t2s')
    except ImportError:
        print('note: opencc not installed, skipping traditional-character check '
              '(pip install opencc-python-reimplemented)')
        return None


def check_chapter(p, stem, text, args, t2s):
    issues = []
    if len(re.findall(r'^# ', text, re.M)) != 1:
        issues.append('needs exactly one "# " title')
    opens = len(re.findall(r'^:{3,}\s*\{', text, re.M)) + len(re.findall(r'^:{3,}\s*[\w.-]+\s*$', text, re.M))
    closes = len(re.findall(r'^:{3,}\s*$', text, re.M))
    if opens != closes:
        issues.append(f'fenced divs unbalanced ({opens} open / {closes} close)')
    if text.count('$$') % 2:
        issues.append('odd number of $$')
    figs = IMG.findall(text)
    for _, path in figs:
        if not os.path.exists(p.path(path)):
            issues.append(f'missing image: {path}')
    nums = [int(m.group(1)) for cap, _ in figs if (m := re.match(r'(?:图|Figure)\s*\d+-(\d+)', cap))]
    if nums and nums != list(range(1, len(nums) + 1)):
        issues.append(f'figure numbering not 1..n: {nums}')
    body = IMG.sub('', text)
    for cap, _ in figs:
        m = re.match(r'((?:图|Figure)\s*\d+-\d+)', cap)
        if m and not re.search(re.escape(m.group(1)).replace(r'\ ', r'\s*'), body):
            issues.append(f'not referenced in text: {m.group(1)}')
    stripped = CODE_MATH.sub('', text)
    for tag in sorted(set(re.findall(r'</?[A-Za-z][A-Za-z0-9]*\b[^>\n]*>', stripped))):
        issues.append(f'raw HTML-like tag (wrap in backticks?): {tag}')
    if t2s:
        trad = sorted({c for c in stripped if '一' <= c <= '鿿' and t2s.convert(c) != c})
        if trad:
            issues.append('traditional characters: ' + ''.join(trad))
    if args.baseline:
        base_f = os.path.join(args.baseline, stem + '.md')
        if os.path.exists(base_f):
            base = open(base_f, encoding='utf-8').read()
            nt = norm(text)
            lost = [m for m in re.findall(r'\$\$([\s\S]*?)\$\$', base) if norm(m) not in nt]
            if lost:
                issues.append(f'{len(lost)} display formula(s) from baseline missing, e.g. {lost[0].strip()[:60]}')
            bf = sorted(x for _, x in IMG.findall(base))
            if bf != sorted(x for _, x in figs):
                issues.append('figure set differs from baseline')
    if args.book:
        for h in p.cfg.get('book_required_headings', ['本讲小结', '关键公式', '术语对照']):
            if not re.search(r'^#{2,4} .*' + re.escape(h), text, re.M):
                issues.append(f'missing heading containing "{h}"')
    return issues, len(figs)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('project')
    ap.add_argument('--edition', default='main')
    ap.add_argument('--baseline')
    ap.add_argument('--book', action='store_true')
    args = ap.parse_args()
    p = Project(args.project, args.edition)
    if args.baseline and args.baseline in p.editions:
        args.baseline = Project(args.project, args.baseline).notes
    t2s = load_t2s(p.cfg.get('language', ''))
    failed, used = False, set()
    stems = p.note_stems()
    if not stems:
        sys.exit(f'no chapter notes in {p.notes}')
    if os.path.isdir(p.sources):
        num = lambda s: (re.search(r'\d+', s) or [None])[0]
        have = {num(s) for s in stems}
        todo = [s for s in p.chapters() if num(s) not in have]
        if todo:
            print('sources without notes (matched by first number): ' + ', '.join(todo))
    for stem in stems:
        f = os.path.join(p.notes, stem + '.md')
        if not os.path.exists(f):
            print(f'{stem:40} MISSING notes file'); failed = True; continue
        text = open(f, encoding='utf-8').read()
        used.update(re.findall(r'\]\((figs/[^)\s]+)', text))
        issues, nfig = check_chapter(p, stem, text, args, t2s)
        print(f"{stem:40} {'OK ' if not issues else 'FAIL'}  {len(text):6} chars  {nfig:2} figures")
        for i in issues:
            print('    - ' + i)
        failed |= bool(issues)
    orphans = [os.path.relpath(x, p.root) for x in glob.glob(os.path.join(p.figs, '*', '*.png'))
               if os.path.relpath(x, p.root) not in used]
    if orphans:
        print(f'unused figure files ({len(orphans)}): ' + ', '.join(orphans[:8]) + (' …' if len(orphans) > 8 else ''))
    print('ALL OK' if not failed else 'CHECK FAILED')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
