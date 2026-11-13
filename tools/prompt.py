"""Print a filled prompt template for a judgement stage, in the book's language.

    python3 -I tools/prompt.py <project> summarize --chapters L1_Intro,L2_Regression
    python3 -I tools/prompt.py <project> figures   --chapters L3_X --example <project>/notes/L1_Intro.md
    python3 -I tools/prompt.py <project> book      --chapters L3_X --edition book [--example …]

Picks prompts/zh/ for Chinese books (language: zh*) and prompts/en/ otherwise (override with
--lang). Fills {PROJECT}, {TOOLKIT}, {CHAPTERS}, {EXAMPLE}, and for `book` also {SOURCE_NOTES},
{OUT_NOTES}, {EDITION} and {OUTLINE} (built from the chapter titles of the main edition).
Hand the output to the agent / sub-agent that does the stage.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from z2k_project import TOOLKIT, Project  # noqa: E402

STAGES = ('summarize', 'figures', 'book')


def outline(p):
    lines = []
    for stem in p.note_stems():
        f = os.path.join(p.notes, stem + '.md')
        title = stem
        if os.path.exists(f):
            m = re.search(r'^# (.+)$', open(f, encoding='utf-8').read(), re.M)
            if m:
                title = m.group(1).strip()
        lines.append(f'- {title}')
    return '\n'.join(lines) or '(no chapters yet)'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('project')
    ap.add_argument('stage', choices=STAGES)
    ap.add_argument('--chapters', required=True, help='comma-separated source stems for this worker')
    ap.add_argument('--example', default='(none yet: this is the trial chapter)')
    ap.add_argument('--edition', default='book', help='book stage: edition name under editions:')
    ap.add_argument('--lang', choices=('en', 'zh'), help='override the template language')
    a = ap.parse_args()
    p = Project(a.project)
    lang = a.lang or ('zh' if str(p.cfg.get('language', 'en')).lower().startswith('zh') else 'en')
    tpl = open(os.path.join(TOOLKIT, 'prompts', lang, a.stage + '.md'), encoding='utf-8').read()
    tpl = re.sub(r'^<!--[\s\S]*?-->\s*', '', tpl)          # drop the orchestrator comment
    values = {'PROJECT': p.root, 'TOOLKIT': TOOLKIT, 'CHAPTERS': ', '.join(c.strip() for c in a.chapters.split(',')),
              'EXAMPLE': a.example}
    if a.stage == 'book':
        if a.edition not in p.editions:
            sys.exit(f'edition "{a.edition}" is not defined under editions: in book.yaml')
        values.update(SOURCE_NOTES=p.notes, OUT_NOTES=Project(a.project, a.edition).notes,
                      EDITION=a.edition, OUTLINE=outline(p))
    for k, v in values.items():
        tpl = tpl.replace('{' + k + '}', str(v))
    left = sorted(set(re.findall(r'\{([A-Z_]+)\}', tpl)))
    if left:
        print(f'warning: unfilled placeholders: {", ".join(left)}', file=sys.stderr)
    sys.stdout.write(tpl)


if __name__ == '__main__':
    main()
