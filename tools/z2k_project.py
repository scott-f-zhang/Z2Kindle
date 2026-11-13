"""Shared helpers: load a book project (book.yaml) and resolve its paths."""
import os
import re
import sys

import yaml

TOOLKIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = 'main'


class Project:
    def __init__(self, target, edition=MAIN):
        """`target` is the project folder (or its book.yaml). `edition` picks an entry of the
        config's `editions:` map (overrides on top of the top-level "main" edition)."""
        target = os.path.abspath(target)
        if target.endswith(('.yaml', '.yml')):
            cfg_path, self.root = target, os.path.dirname(target)
        else:
            cfg_path, self.root = os.path.join(target, 'book.yaml'), target
        if not os.path.exists(cfg_path):
            sys.exit(f'config not found: {cfg_path}')
        with open(cfg_path, encoding='utf-8') as f:
            self.raw = yaml.safe_load(f) or {}
        self.editions = [MAIN] + [e for e in (self.raw.get('editions') or {}) if e != MAIN]
        self.edition = edition or MAIN
        base = {k: v for k, v in self.raw.items() if k != 'editions'}
        if self.edition != MAIN:
            ed = (self.raw.get('editions') or {}).get(self.edition)
            if ed is None:
                sys.exit(f'unknown edition "{self.edition}" (have: {", ".join(self.editions)})')
            deep = {k: {**(base.get(k) or {}), **(ed.get(k) or {})} for k in ('cover', 'metadata')}
            base = {**base, **ed, **deep}
        self.cfg = base
        with open(os.path.join(TOOLKIT, 'profiles', 'devices.yaml'), encoding='utf-8') as f:
            profiles = yaml.safe_load(f)
        dev = self.cfg.get('device', 'scribe-11')
        if dev not in profiles:
            sys.exit(f'unknown device "{dev}"; choose one of: {", ".join(profiles)}')
        self.device = profiles[dev]

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    @property
    def sources(self):
        return self.path(self.cfg.get('sources', 'sources'))

    @property
    def notes(self):
        default = 'notes' if self.edition == MAIN else f'notes_{self.edition}'
        return self.path(self.cfg.get('notes', default))

    @property
    def work(self):
        return self.path('work')

    @property
    def figs(self):
        return self.path('figs')

    def chapters(self):
        """Source stems in reading order."""
        explicit = self.cfg.get('chapters')
        if explicit:
            return list(explicit)
        stems = [os.path.splitext(f)[0] for f in os.listdir(self.sources)
                 if f.lower().endswith(('.pdf', '.pptx')) and not f.startswith('.')]
        return sorted(stems, key=natural_key)


    def note_stems(self):
        """Chapter notes in reading order (same rule as the Node builders): explicit
        `chapters:` list, else every notes/*.md sorted naturally."""
        explicit = self.cfg.get('chapters')
        if explicit:
            return list(explicit)
        if not os.path.isdir(self.notes):
            return []
        stems = [f[:-3] for f in os.listdir(self.notes) if f.endswith('.md') and not f.startswith('.')]
        return sorted(stems, key=natural_key)


def natural_key(s):
    m = re.search(r'\d+', s)
    return (int(m.group()) if m else float('inf'), s)
