"""Generate a tiny 2-page demo deck (sources/L1_Demo_Logistic.pdf) so the pipeline can be tried
without real course material.   python3 -I examples/demo/make_demo_slides.py"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1920, 1080


def font(size):
    for f in ('/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def slide(title):
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    d.text((100, 70), title, fill=(140, 20, 60), font=font(72))
    d.rectangle([100, 175, W - 100, 183], fill=(250, 200, 50))
    return im, d


# page 1: text-only slide
p1, d = slide('Logistic regression')
for i, line in enumerate(['Model the probability of the positive class',
                          'Hypothesis: h(x) = sigmoid(theta^T x)',
                          'Predict 1 if h(x) >= 0.5, else 0']):
    d.text((160, 300 + i * 110), '\u2022  ' + line, fill=(60, 60, 60), font=font(52))

# page 2: a figure (sigmoid curve) on the left, bullets on the right
p2, d = slide('The sigmoid function')
ox, oy, sx, sy = 180, 900, 70, 560          # plot origin and scale
d.line([(ox, oy), (ox + 14 * sx, oy)], fill='black', width=4)
d.line([(ox + 7 * sx, oy + 20), (ox + 7 * sx, oy - sy - 40)], fill='black', width=4)
pts = [(ox + (z + 7) * sx, oy - sy / (1 + math.exp(-z))) for z in [i / 10 - 7 for i in range(141)]]
d.line(pts, fill=(30, 110, 200), width=8)
d.line([(ox, oy - sy / 2), (ox + 14 * sx, oy - sy / 2)], fill=(200, 60, 60), width=3)
d.text((ox + 14 * sx - 60, oy + 15), 'z', fill='black', font=font(44))
d.text((ox + 7 * sx + 15, oy - sy - 50), 'g(z)', fill='black', font=font(44))
d.text((ox + 7 * sx + 15, oy - sy / 2 - 55), '0.5', fill=(200, 60, 60), font=font(40))
for i, line in enumerate(['Output in (0, 1)', 'g(0) = 0.5', 'Smooth and monotone']):
    d.text((1250, 380 + i * 110), '\u2022  ' + line, fill=(60, 60, 60), font=font(48))

out = os.path.join(HERE, 'sources', 'L1_Demo_Logistic.pdf')
os.makedirs(os.path.dirname(out), exist_ok=True)
p1.save(out, save_all=True, append_images=[p2], resolution=144)
print('wrote', out)
