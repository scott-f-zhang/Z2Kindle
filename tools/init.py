"""Stage 0 — scaffold a new book project.

    python3 -I tools/init.py <project_dir> [--title T] [--device scribe-11] [--language en|zh-CN]

Creates the standard layout and a book.yaml you can edit:
  <project>/book.yaml  sources/  notes/  figs/  front/  work/  output/
Then copy your .pdf/.pptx files into sources/ and run tools/extract.py.
"""
import argparse
import json
import os
import sys

import yaml

TOOLKIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TEMPLATE = """# Z2kindle book project. Paths are relative to this file.
# Layout: sources/ (slides in) -> notes/ + figs/ (you/agents write) -> output/ (EPUBs out).
# work/ holds regenerable intermediates (extraction, build files, optional web preview).
title: {title}
subtitle: ""
language: {language}
device: {device}            # see {toolkit}/profiles/devices.yaml

sources: sources            # .pdf / .pptx lecture files
notes: notes                # chapter markdown (one file per source, same stem)
front: front/preface.md     # optional front matter
cover:
  style: plain              # plain | figures | abstract   (preview all: make covers P=<project>)
  # figures: auto           # figures style: auto-pick from the notes, or a list of image paths
  # count: 6                # figures style: how many tiles (1-9)
  # art: mosaic             # abstract style: flow | contours | mosaic | orbits
  # palette: mono           # abstract style: mono | ink | forest | dusk | [list of hex colours]
  # seed: 1                 # abstract style: change to get a different variation
  heading: {title}
  subheading: ""
  tagline: ""
  footer: ""
  # image: front/cover.png  # use your own cover instead of the generated one

# Book metadata embedded in the EPUB (shown in the Kindle library / book details).
# Every field is optional; editions can override any of them under editions.<name>.metadata.
metadata:
  author: ""                # one name, or a list: [Name A, Name B]
  # contributors:           # other roles: author | editor | translator | illustrator | compiler | contributor
  #   - {{name: "", role: editor}}
  # date: 2026-12-01         # default: build date
  # publisher: ""
  # description: ""         # blurb shown in book details
  # subject: [keyword1, keyword2]
  # rights: ""              # e.g. "For personal study only"
  # series: ""              # collection name; series_index: 1
  # identifier: ""          # ISBN, or leave unset for a stable generated UUID (re-sent books replace the old copy)

# chapters: [stem1, stem2]  # optional explicit order (default: natural sort by first number)

# output_name: my-notes     # EPUB file name in output/ (default: the project folder name)
web: false                  # true = also build the web preview into work/web/<edition>/

# Extra editions share sources/figs; each overrides top-level keys. Built to
# output/<output_name>-<edition>.epub; notes default to notes_<edition>/.
# editions:
#   book:
#     notes: notes_book
#     front: front/preface_book.md
#     title: "..."
#     cover: {{subheading: Book edition}}
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('project')
    ap.add_argument('--title', default='Untitled Notes')
    ap.add_argument('--device', default='scribe-11')
    ap.add_argument('--language', default='en', help='book language, e.g. en (default) or zh-CN; picks prompts/en or prompts/zh')
    a = ap.parse_args()
    with open(os.path.join(TOOLKIT, 'profiles', 'devices.yaml'), encoding='utf-8') as f:
        devices = yaml.safe_load(f)
    if a.device not in devices:
        sys.exit(f'unknown device {a.device}; choose: {", ".join(devices)}')
    cfg = os.path.join(a.project, 'book.yaml')
    if os.path.exists(cfg):
        sys.exit(f'{cfg} already exists; not overwriting')
    for d in ('sources', 'notes', 'figs', 'front', 'work', 'output'):
        os.makedirs(os.path.join(a.project, d), exist_ok=True)
    with open(cfg, 'w', encoding='utf-8') as f:
        f.write(TEMPLATE.format(title=json.dumps(a.title, ensure_ascii=False), device=a.device, language=a.language, toolkit=TOOLKIT))
    print(f'created {cfg}\nnext: copy slides into {os.path.join(a.project, "sources")}/ and run '
          f'python3 -I {os.path.join(TOOLKIT, "tools", "extract.py")} {a.project}')


if __name__ == '__main__':
    main()
