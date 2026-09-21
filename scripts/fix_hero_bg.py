"""Hero POS Kedai: PNG transparan (sumber utuh dari Izal di VPS) -> WebP alpha.

Sumber: /root/FotoPosKedaiTransparan.png (1536x2752, palette+transparency).
Langkah: konversi RGBA -> crop bbox area opaque -> downscale -> WebP alpha q88.
Sudut rounded & transparansi sudah baked-in di PNG, tidak perlu mask tambahan.
"""
from PIL import Image

SRC = '/root/FotoPosKedaiTransparan.png'
OUT = '/root/pos-kedai-landing/public/assets/img/shot-statistik.webp'
TARGET_W = 720  # ~2.4x lebar tampil CSS (300px), cukup tajam utk layar retina

im = Image.open(SRC).convert('RGBA')

# bbox area solid (alpha >= 128) + inset 8px utk memangkas strip noise antialias
# di tepi (terutama atas). Konten asli tidak terganggu signifikan (<1% dimensi).
solid = im.split()[-1].point(lambda v: 255 if v >= 128 else 0)
bbox = solid.getbbox()
print('bbox solid:', bbox)
INSET = 8
bbox = (max(0, bbox[0] + INSET), max(0, bbox[1] + INSET),
        min(im.size[0], bbox[2] - INSET), min(im.size[1], bbox[3] - INSET))
im = im.crop(bbox)
w, h = im.size
print('setelah crop:', w, 'x', h)

# downscale proporsional
nh = round(h * TARGET_W / w)
im = im.resize((TARGET_W, nh), Image.LANCZOS)
print('setelah resize:', im.size)

im.save(OUT, 'WEBP', quality=88, method=6)

# verifikasi
chk = Image.open(OUT)
print('hasil:', chk.size, chk.mode)
W, H = chk.size
a = chk.split()[-1].load()
print('alpha sudut (harus 0):', a[0, 0], a[W - 1, 0], a[0, H - 1], a[W - 1, H - 1])
print('alpha tengah tepi (harus 255):', a[W // 2, 2], a[W // 2, H - 3], a[2, H // 2], a[W - 3, H // 2])
# cek fringe hijau di arc sudut kiri-atas (warna indeks transparan asli (71,112,76))
fringe = 0
for y in range(0, 80):
    for x in range(0, 80):
        r, g, b, al = chk.getpixel((x, y))
        if 8 < al < 250 and g > r + 20 and g > b + 20:
            fringe += 1
print('piksel fringe hijau di pojok kiri-atas:', fringe)
import os
print('ukuran:', round(os.path.getsize(OUT) / 1024, 1), 'KB')
