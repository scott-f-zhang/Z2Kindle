"""Print a filled prompt template for a judgement stage, in the book's language.

    python3 -I tools/prompt.py <project> summarize --chapters L1_Intro,L2_Regression
    python3 -I tools/prompt.py <project> figures   --chapters L3_X --example <project>/notes/L1_Intro.md
    python3 -I tools/prompt.py <project> book      --chapters L3_X --edition book [--example …]

Book-only workflow (no reading-notes edition; the book is the main edition in notes/):
    python3 -I tools/prompt.py <project> draft  --chapters Ch3 [--pages 1-40 --part 1]
    python3 -I tools/prompt.py <project> book   --chapters Ch3 --edition main --source work/draft
    python3 -I tools/prompt.py <project> review --chapters Ch3 --edition main --source work/draft

Picks prompts/zh/ for Chinese books (language: zh*) and prompts/en/ otherwise (override with
--lang). Fills {PROJECT}, {TOOLKIT}, {CHAPTERS}, {EXAMPLE}, and for `book` also {SOURCE_NOTES},
{OUT_NOTES}, {EDITION} and {OUTLINE} (built from the chapter titles in the source folder).
`draft` also fills {PAGES}, {DRAFT_OUT}, {FIG_PREFIX} and {HEADING_RULE}; `review` fills {OUT_NOTES},
{SOURCE_NOTES} and {EDITION}.
Project-specific rules live in the project, not in the toolkit: <project>/prompts/common.md is
appended to every stage and <project>/prompts/<stage>.md to that stage, after the generic template
and taking precedence over it. The same placeholders are filled in them.
Hand the output to the agent / sub-agent that does the stage.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from z2k_project import TOOLKIT, Project, natural_key  # noqa: E402

STAGES = ('summarize', 'figures', 'book', 'draft', 'review')


def outline(p, folder):
    lines = []
    have = {f[:-3] for f in os.listdir(folder) if f.endswith('.md') and '.part' not in f} if os.path.isdir(folder) else set()
    order = p.cfg.get('chapters')                     # explicit order wins (deck numbers may overlap)
    stems = [s for s in order if s in have] if order else sorted(have, key=natural_key)
    for stem in stems or p.note_stems():
        f = os.path.join(folder, stem + '.md')
        title = stem
        if os.path.exists(f):
            m = re.search(r'^# (.+)$', open(f, encoding='utf-8').read(), re.M)
            if m:
                title = m.group(1).strip()
        lines.append(f'- {title}')
    return '\n'.join(lines) or '(no chapters yet)'


def project_rules(p, stage, zh):
    """Project-specific rules: <project>/prompts/common.md (every stage) and <project>/prompts/<stage>.md.
    They are appended after the toolkit template and take precedence over it."""
    parts = []
    for name in ('common', stage):
        f = p.path('prompts', name + '.md')
        if os.path.exists(f):
            text = re.sub(r'^<!--[\s\S]*?-->\s*', '', open(f, encoding='utf-8').read()).strip()
            if text:
                parts.append(text)
    if not parts:
        return ''
    head = ('## 本项目的补充规定（优先于上面的通用模板）' if zh else
            '## Project-specific rules (these take precedence over the generic template above)')
    return '\n' + head + '\n\n' + '\n\n'.join(parts) + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('project')
    ap.add_argument('stage', choices=STAGES)
    ap.add_argument('--chapters', required=True, help='comma-separated source stems for this worker')
    ap.add_argument('--example', default='(none yet: this is the trial chapter)')
    ap.add_argument('--edition', default='book', help='book stage: edition name under editions:')
    ap.add_argument('--source', help='book/review: folder with the source notes (default: main notes); '
                    'relative paths are inside the project, e.g. work/draft')
    ap.add_argument('--pages', help='draft: page range of this worker, e.g. 1-40 (default: all pages)')
    ap.add_argument('--part', type=int, help='draft: part number when one chapter is split across workers')
    ap.add_argument('--lang', choices=('en', 'zh'), help='override the template language')
    a = ap.parse_args()
    p = Project(a.project)
    lang = a.lang or ('zh' if str(p.cfg.get('language', 'en')).lower().startswith('zh') else 'en')
    tpl = open(os.path.join(TOOLKIT, 'prompts', lang, a.stage + '.md'), encoding='utf-8').read()
    tpl = re.sub(r'^<!--[\s\S]*?-->\s*', '', tpl)          # drop the orchestrator comment
    values = {'PROJECT': p.root, 'TOOLKIT': TOOLKIT, 'CHAPTERS': ', '.join(c.strip() for c in a.chapters.split(',')),
              'EXAMPLE': a.example}
    zh = lang == 'zh'
    if a.stage in ('book', 'review'):
        if a.edition not in p.editions:
            sys.exit(f'edition "{a.edition}" is not defined under editions: in book.yaml')
        src = os.path.join(p.root, a.source) if a.source else p.notes
        values.update(SOURCE_NOTES=src, OUT_NOTES=Project(a.project, a.edition).notes,
                      EDITION=a.edition, OUTLINE=outline(p, src))
    if a.stage == 'draft':
        stems = [c.strip() for c in a.chapters.split(',')]
        if a.part and len(stems) != 1:
            sys.exit('--part needs exactly one chapter')
        draft = os.path.join(p.work, 'draft')
        if a.part:
            out = os.path.join(draft, f'{stems[0]}.part{a.part}.md')
        else:
            out = ', '.join(os.path.join(draft, s + '.md') for s in stems)
        first = not a.part or a.part == 1
        if zh:
            rule = ('文件以 `# <章节编号> · <中文标题>（<English title>）` 开头。' if first else
                    '这是同一章的后续部分：**不要**写一级标题，直接从 `## ` 小节开始（小节编号可以从 1 重新开始，合并时会统一）。')
            pages = a.pages or '全部页'
        else:
            rule = ('Start the file with `# <chapter number> · <title>`.' if first else
                    'This continues the same chapter: do **not** write a `# ` title; start directly with `## `'
                    ' sections (numbering may restart at 1; it is unified when the parts are merged).')
            pages = a.pages or 'all pages'
        values.update(PAGES=pages, DRAFT_OUT=out, HEADING_RULE=rule,
                      FIG_PREFIX=f'p{a.part}_' if a.part else 'd_')
    tpl = tpl.rstrip() + '\n' + project_rules(p, a.stage, zh)
    for k, v in values.items():
        tpl = tpl.replace('{' + k + '}', str(v))
    left = sorted(set(re.findall(r'\{([A-Z_]+)\}', tpl)))
    if left:
        print(f'warning: unfilled placeholders: {", ".join(left)}', file=sys.stderr)
    sys.stdout.write(tpl)


if __name__ == '__main__':
    main()
