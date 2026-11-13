"""Stage 1 — extract text and page images from lecture sources.

    python3 -I tools/extract.py <project>

For every .pdf / .pptx in the project's sources folder this writes, under <project>/work/:
  text/<stem>.txt           pdftotext -layout output (PDF) or slide text + media map (PPTX)
  img/<stem>/p-NN.png       ~80 dpi page previews for reading (PDF only)
  hires/<stem>/p-NN.png     220 dpi renders used for cropping figures (PDF only)
  pptx/<stem>/              unzipped PPTX (slide XML + ppt/media/*)
  manifest.json             per-source page count, preview/hires sizes, pptx slide->media map
Page files are always zero-padded to two digits. Requires poppler (pdftotext, pdftoppm).
"""
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from z2k_project import Project  # noqa: E402

PREVIEW_DPI = 80
HIRES_DPI = 220


def need(cmd):
    if not shutil.which(cmd):
        sys.exit(f'missing dependency: {cmd} (install poppler, e.g. `brew install poppler`)')


def render(pdf, out_dir, dpi):
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    subprocess.run(['pdftoppm', '-r', str(dpi), '-png', pdf, os.path.join(out_dir, 'p')], check=True)
    # normalise names to p-NN.png regardless of page count
    for f in os.listdir(out_dir):
        m = re.match(r'p-(\d+)\.png$', f)
        if m:
            os.rename(os.path.join(out_dir, f), os.path.join(out_dir, f'p-{int(m.group(1)):02d}.png'))
    pages = sorted(glob.glob(os.path.join(out_dir, 'p-*.png')))
    from PIL import Image
    size = Image.open(pages[0]).size if pages else None
    return len(pages), size


def extract_pdf(pdf, stem, work):
    subprocess.run(['pdftotext', '-layout', pdf, os.path.join(work, 'text', stem + '.txt')], check=True)
    n, psize = render(pdf, os.path.join(work, 'img', stem), PREVIEW_DPI)
    _, hsize = render(pdf, os.path.join(work, 'hires', stem), HIRES_DPI)
    return {'type': 'pdf', 'pages': n, 'preview_size': psize, 'hires_size': hsize}


def extract_pptx(path, stem, work):
    out = os.path.join(work, 'pptx', stem)
    if os.path.isdir(out):
        shutil.rmtree(out)
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():  # guard against path traversal
            target = os.path.realpath(os.path.join(out, name))
            if not target.startswith(os.path.realpath(out) + os.sep):
                sys.exit(f'unsafe path in {path}: {name}')
        z.extractall(out)
    slides = sorted(glob.glob(os.path.join(out, 'ppt', 'slides', 'slide*.xml')),
                    key=lambda p: int(re.search(r'slide(\d+)\.xml', p).group(1)))
    media_map, lines = {}, []
    for s in slides:
        n = int(re.search(r'slide(\d+)\.xml', s).group(1))
        xml = open(s, encoding='utf-8').read()
        text = ' '.join(t.strip() for t in re.findall(r'<a:t>([^<]*)</a:t>', xml) if t.strip())
        rels = os.path.join(os.path.dirname(s), '_rels', os.path.basename(s) + '.rels')
        media = re.findall(r'Target="\.\./media/([^"]+)"', open(rels, encoding='utf-8').read()) if os.path.exists(rels) else []
        media_map[n] = media
        lines.append(f'== slide {n}  media: {", ".join(media) or "-"}\n{text}\n')
    with open(os.path.join(work, 'text', stem + '.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    return {'type': 'pptx', 'pages': len(slides), 'media_dir': f'work/pptx/{stem}/ppt/media', 'slide_media': media_map}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    need('pdftotext'); need('pdftoppm')
    p = Project(sys.argv[1])
    os.makedirs(os.path.join(p.work, 'text'), exist_ok=True)
    manifest = {}
    for stem in p.chapters():
        pdf, pptx = os.path.join(p.sources, stem + '.pdf'), os.path.join(p.sources, stem + '.pptx')
        if os.path.exists(pdf):
            manifest[stem] = extract_pdf(pdf, stem, p.work)
        elif os.path.exists(pptx):
            manifest[stem] = extract_pptx(pptx, stem, p.work)
        else:
            print(f'skip {stem}: no .pdf/.pptx'); continue
        m = manifest[stem]
        print(f"{stem:40} {m['type']:5} {m['pages']:3} pages")
    with open(os.path.join(p.work, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f'manifest -> {os.path.join(p.work, "manifest.json")}')


if __name__ == '__main__':
    main()
