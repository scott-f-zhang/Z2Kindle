"""Stage 0 — scaffold a new book project.

    python3 -I tools/init.py <project_dir> [--title T] [--device scribe-11] [--language zh-CN]

Creates <project_dir>/{sources,notes,figs,front} and a book.yaml you can edit.
Then copy your .pdf/.pptx files into sources/ and run tools/extract.py.
"""
import argparse
import json
import os
import sys

import yaml

TOOLKIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TEMPLATE = """# slides2kindle book project. Paths are relative to this file.
title: {title}
subtitle: ""
author: ""
language: {language}
device: {device}            # see {toolkit}/profiles/devices.yaml

sources: sources            # .pdf / .pptx lecture files
notes: notes                # chapter markdown (one file per source, same stem)
front: front/preface.md     # optional front matter
cover:
  heading: {title}
  subheading: ""
  tagline: ""
  footer: ""
  # image: front/cover.png  # use your own cover instead of the generated one

# chapters: [stem1, stem2]  # optional explicit order (default: natural sort by first number)

output:
  web: dist/web
  epub: dist/book.epub
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('project')
    ap.add_argument('--title', default='Untitled Notes')
    ap.add_argument('--device', default='scribe-11')
    ap.add_argument('--language', default='zh-CN')
    a = ap.parse_args()
    with open(os.path.join(TOOLKIT, 'profiles', 'devices.yaml'), encoding='utf-8') as f:
        devices = yaml.safe_load(f)
    if a.device not in devices:
        sys.exit(f'unknown device {a.device}; choose: {", ".join(devices)}')
    cfg = os.path.join(a.project, 'book.yaml')
    if os.path.exists(cfg):
        sys.exit(f'{cfg} already exists; not overwriting')
    for d in ('sources', 'notes', 'figs', 'front'):
        os.makedirs(os.path.join(a.project, d), exist_ok=True)
    with open(cfg, 'w', encoding='utf-8') as f:
        f.write(TEMPLATE.format(title=json.dumps(a.title, ensure_ascii=False), device=a.device, language=a.language, toolkit=TOOLKIT))
    print(f'created {cfg}\nnext: copy slides into {os.path.join(a.project, "sources")}/ and run '
          f'python3 -I {os.path.join(TOOLKIT, "tools", "extract.py")} {a.project}')


if __name__ == '__main__':
    main()
