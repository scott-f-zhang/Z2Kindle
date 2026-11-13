"""Stage 3 helper — locate and crop figures from slide pages.

  python3 -I tools/figtool.py <project> grid <stem> <page>
      Writes work/grid/<stem>-pNN.png: the preview page with a labelled 50px grid
      (red verticals = x, blue horizontals = y, numbers every 100px). View it to pick a box.

  python3 -I tools/figtool.py <project> crop <stem> <page> <x0> <y0> <x1> <y1> <name>
      Box in PREVIEW pixel coordinates. Crops from the 220 dpi render (scale derived from the
      actual image sizes), trims the white margin, caps the width at the device profile's
      figure_max_width, saves figs/<stem>/<name>.png.

  python3 -I tools/figtool.py <project> media <stem> <image_file> <x0> <y0> <x1> <y1> <name>
      For PPTX media (work/pptx/<stem>/ppt/media/<image_file>); box in the image's own
      pixels (use 0 0 W H for the whole image; `size` prints W H).

  python3 -I tools/figtool.py <project> size <stem> <image_file>
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from z2k_project import Project  # noqa: E402


def page_file(p, kind, stem, page):
    f = os.path.join(p.work, kind, stem, f'p-{int(page):02d}.png')
    if not os.path.exists(f):
        sys.exit(f'not found: {f} (run tools/extract.py first)')
    return f


def trim(im, pad=12):
    rgb = im.convert('RGB')
    diff = ImageChops.difference(rgb, Image.new('RGB', rgb.size, (255, 255, 255)))
    box = diff.convert('L').point(lambda v: 255 if v > 18 else 0).getbbox()
    if not box:
        return rgb
    x0, y0, x1, y1 = box
    return rgb.crop((max(0, x0 - pad), max(0, y0 - pad), min(rgb.width, x1 + pad), min(rgb.height, y1 + pad)))


def flatten(im):
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        im = Image.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, 255)), im)
    return im.convert('RGB')


def save(p, im, stem, name):
    im = trim(im)
    max_w = int(p.device.get('figure_max_width', 1800))
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.Resampling.LANCZOS)
    out_dir = os.path.join(p.figs, stem)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, name + '.png')
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
    print(f'saved {out}  {im.width}x{im.height}  {os.path.getsize(out) // 1024}KB  -> markdown path: figs/{stem}/{name}.png')


def grid(p, stem, page):
    im = Image.open(page_file(p, 'img', stem, page)).convert('RGB')
    d = ImageDraw.Draw(im)
    for x in range(0, im.width, 50):
        d.line([(x, 0), (x, im.height)], fill=(255, 0, 0) if x % 100 == 0 else (255, 170, 170))
        if x % 100 == 0:
            d.text((x + 2, 2), str(x), fill=(200, 0, 0))
    for y in range(0, im.height, 50):
        d.line([(0, y), (im.width, y)], fill=(0, 0, 255) if y % 100 == 0 else (170, 170, 255))
        if y % 100 == 0:
            d.text((2, y + 2), str(y), fill=(0, 0, 200))
    os.makedirs(os.path.join(p.work, 'grid'), exist_ok=True)
    out = os.path.join(p.work, 'grid', f'{stem}-p{int(page):02d}.png')
    im.save(out)
    print(f'{out}  (preview size {im.width}x{im.height})')


def media_file(p, stem, image):
    f = os.path.join(p.work, 'pptx', stem, 'ppt', 'media', image)
    if not os.path.exists(f):
        sys.exit(f'not found: {f}')
    return f


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    p, cmd, a = Project(sys.argv[1]), sys.argv[2], sys.argv[3:]
    if cmd == 'grid':
        grid(p, a[0], a[1])
    elif cmd == 'crop':
        stem, page = a[0], a[1]
        prev = Image.open(page_file(p, 'img', stem, page))
        hi = Image.open(page_file(p, 'hires', stem, page))
        sx, sy = hi.width / prev.width, hi.height / prev.height
        x0, y0, x1, y1 = (float(v) for v in a[2:6])
        save(p, hi.crop((round(x0 * sx), round(y0 * sy), round(x1 * sx), round(y1 * sy))), stem, a[6])
    elif cmd == 'media':
        stem, image = a[0], a[1]
        x0, y0, x1, y1 = (int(float(v)) for v in a[2:6])
        save(p, flatten(Image.open(media_file(p, stem, image))).crop((x0, y0, x1, y1)), stem, a[6])
    elif cmd == 'size':
        print(*Image.open(media_file(p, a[0], a[1])).size)
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
