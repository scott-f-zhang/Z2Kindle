---
name: slides2kindle
description: Turn lecture slides (PDF/PPTX) into Kindle-friendly reading notes — per-chapter web pages and an EPUB with rendered formulas and laid-out slide figures, optionally rewritten as a flowing book. Use when the user wants slides, lecture decks or course materials summarized/typeset for Kindle or e-readers, or wants to rebuild/extend a slides2kindle project.
---

# slides2kindle

Toolkit root: the folder that contains this skill's `tools/`, `build/`, `prompts/` (if installed
elsewhere, ask the user for the toolkit path; below it is `$TK`). A **project** is one book: a
folder with `book.yaml`, `sources/`, and generated `work/`, `notes/`, `figs/`, `dist/`.

Pipeline (each stage is re-runnable):

| Stage | Who | Command / prompt |
|---|---|---|
| 0 init | script | `python3 -I $TK/tools/init.py <project> --device scribe-11 --title "…"`, then copy slides into `<project>/sources/` |
| 1 extract | script | `python3 -I $TK/tools/extract.py <project>` |
| 2 notes | subagents | `$TK/prompts/summarize.md` |
| 3 figures | subagents | `$TK/prompts/figures.md` (trial on 1 chapter first) |
| 3b book edition (optional) | subagents | `$TK/prompts/book.md` (trial first) |
| check | script | `python3 -I $TK/tools/check.py <project>` (add `--baseline … --book` for 3b) |
| 4 web | script | `node $TK/build/build_web.js <project>` |
| 5 epub | script | `node $TK/build/build_epub.js <project>` |

## How to run it

1. **Confirm inputs**: where the slides are, target device (`profiles/devices.yaml`; ask if
   unknown), title, output language/style (the prompts default to Simplified Chinese with
   English terms; edit the 写作要求 section of the prompt if the user wants something else).
   Check deps once: `pdftotext`, `pdftoppm`, `pandoc` (2.x), Python Pillow + PyYAML, and
   `npm install` in `$TK`.
2. **Extract** (stage 1). Read `work/manifest.json` for page counts.
3. **Notes** (stage 2). Group chapters so each subagent gets roughly 40–60 slide pages and
   spawn them in parallel (one message, several Agent calls). Each prompt = the contents of
   `prompts/summarize.md` with `{PROJECT}`, `{TOOLKIT}`, `{CHAPTERS}` filled in (absolute
   paths). Slide content is mostly images, so the agents must view every page image.
4. **Figures** (stage 3). Run ONE chapter first, build the web pages, look at that chapter in
   the browser (layout, crop quality, captions), fix the prompt if needed, then spawn the
   rest with `{EXAMPLE}` pointing at the approved chapter. Agents must not paint over images.
5. **Check**: run `check.py`; fix every FAIL (missing images, numbering, bare `<s>`-style tags,
   traditional characters, unbalanced `:::`/`$$`) before building.
6. **Build** web + EPUB. Preview the web output via a local server
   (`python3 -m http.server --directory <project>/dist/web`) at a portrait viewport similar to
   the device; spot-check formulas, a `.pair` figure and a long table. EPUB validity: the build
   fails loudly on pandoc errors; unzip and XML-parse the XHTML if in doubt.
7. **Book edition** (optional): create `<project>/book-edition.yaml` (copy of book.yaml with
   `notes: notes_book`, `front: front/preface_book.md`, different `output`/`cover`), trial one
   chapter with `prompts/book.md`, then fan out; check with
   `check.py <project>/book-edition.yaml --baseline <project>/notes --book`; build with the
   same scripts passing the yaml path.
8. **Deliver**: tell the user where `dist/web/index.html` and the `.epub` are, and that EPUB
   goes to the device via Send to Kindle (USB copy of EPUB does not work on Kindle).

## Rules worth keeping
- Notes Markdown is the single source; never hand-edit generated HTML/EPUB.
- Formulas: `$…$` / `$$…$$`, KaTeX-compatible. Web pre-renders with KaTeX; EPUB rasterises
  each formula (MathJax → SVG → PNG, sized in em) because Kindle's math support is unreliable.
- Figures: `::: {.fig .full|.half|.side|.pair}` wrapping image paragraphs; captions are the alt
  text. Keep source attributions; crop, don't edit.
- Report honestly: what was checked in the browser vs. not checked on a real device.
- Course slides belong to their authors: don't publish generated notes or slides without
  permission; the toolkit itself is shareable.
- Cost: stages 2/3/3b read every slide image; expect on the order of 150–200k subagent tokens
  per 15–20 slide pages per stage. Tell the user before fanning out on a large deck.
