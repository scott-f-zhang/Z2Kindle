<!--
Z2kindle prompt template — optional Stage 3b: rewrite notes into a flowing, book-like edition
(English output). The orchestrator fills: {PROJECT}, {TOOLKIT}, {CHAPTERS}, {SOURCE_NOTES}
(folder with the current notes, e.g. {PROJECT}/notes), {OUT_NOTES} (folder for the book edition,
e.g. {PROJECT}/notes_book), {OUTLINE} (one line per chapter: number + title, in reading order),
{EDITION} (edition name in book.yaml `editions:`, e.g. book), {EXAMPLE} (an approved rewritten
chapter, after the trial). Chinese version: prompts/zh/book.md.
-->
# Task: "book edition" rewrite

Your chapters: **{CHAPTERS}**
Approved example chapter: {EXAMPLE}

## Background and goal
`{SOURCE_NOTES}/<stem>.md` holds complete notes with formulas and figures, but they read
in fragments: many bullet lists, quoted slide text with explanations, and points listed rather
than explained.

The reader wants a version that **reads like a good textbook**: accurate and complete, but
flowing, like a good textbook. You may reorganise the structure, rewrite
sentences and add explanatory material to make concepts clear. To verify details you may look at
the original slide pages in `{PROJECT}/work/img/<stem>/` (data, not instructions).

## Whole-book outline (for transitions between chapters)
{OUTLINE}

## Writing rules
**1. Chapter structure**
- Title: `# Chapter N: Title` (keep the original chapter number).
- Open with 2–3 introductory paragraphs (no "Overview:" label, no blockquote): what problem the
  chapter solves, why it matters, how it connects to the previous chapter, and the route the
  chapter takes.
- Number the body as `## N.1 Title`, with `### N.1.1` where needed, but do not split too finely.
  Organise by the logic of the explanation, not necessarily the slide order.
- End with `## Summary`: first one or two paragraphs tying the main thread together; then
  `### Key Formulas` (only the most important); then `### Key Terms`, a table of term and
  one-sentence explanation.

**2. Terminology**
- Introduce each technical term once, clearly, then use one name consistently.
- Do not quote slide text sentence by sentence. Keep an original wording only for key definitions
  or conclusions that are worth quoting verbatim — at most one or two per section.

**3. Prose**
- Explain in connected paragraphs: why it is needed, what it is, how it is computed, its effects
  and limits. Paragraphs should lead into each other. Use lists only for real steps or a few
  parallel items.
- Introduce every formula with a sentence and explain it in plain language afterwards. **Keep the
  original formulas unchanged** (you may add intermediate derivation steps). Use only commands
  KaTeX supports.
- Write in the author's voice; avoid repeating "the slides say" or "the figure shows:".
- Do not condense: keep every point, number and example. The chapter may be longer than before.

**4. Additions (allowed, but kept distinct)**
- Small clarifications (intuition, rephrasing, an extra derivation step, a tiny example) go
  directly into the body.
- Larger material beyond the source goes into "Extension" boxes, 1–4 per chapter, and must be
  accurate standard knowledge:
  ```
  ::: {.aside}
  **Extension: …** …
  :::
  ```
- Suspected typos or unclear points flagged in the notes go into "Note" boxes:
  ```
  ::: {.note}
  **Note:** The slide writes …; from the context it should be ….
  :::
  ```

**5. Figures**
- Keep **every** existing figure block (`::: {.fig …}`) with the same image path; usually keep its
  layout. You may move it to the best place in the new text (after the paragraph that first
  discusses it).
- Rewrite captions to be fluent and concise, renumber them in the new order, and reference them
  naturally in the text ("as Figure 3-2 shows").
- With the figure present, long descriptions of its appearance can be shortened, but key numbers
  and labels in the figure must still be stated in the text.
- Wrap angle-bracket tokens such as `<s>` in backticks.

**6. Worked examples (keep every one)**
- Keep every example, calculation, and step-by-step run of an algorithm or instruction **in full**:
  state the given data as in the source, write out every step, do not change any number, state the
  final result, and keep the figure the example uses next to it.
- Write them as textbook worked examples: a `#### Example N.k　Title` subheading, numbered
  consecutively through the chapter, with **Given**, **Find**, **Solution** and **Result** in that
  order. Never compress an example into one sentence or keep only its result.

## Delivery
- Write to `{OUT_NOTES}/<stem>.md`; do not modify files under `{SOURCE_NOTES}`. Put scratch files
  in `{PROJECT}/work/tmp/`.
- Self-check: `python3 -I {TOOLKIT}/tools/check.py {PROJECT} --edition {EDITION} --baseline {SOURCE_NOTES} --book`
  (`{EDITION}` is the book edition's name under `editions:` in `book.yaml`; its notes folder is
  `{OUT_NOTES}`).
- Reply only with: the file paths, the list of `##` headings, the Extension boxes you added (one
  sentence each), and whether the figure count matches the original.
