"""Cut each photo out of its background. Returns an RGBA PIL image (alpha = how much of the cell is the subject)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi


def _poly_mask(size, pts):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.array(m) > 0


def _clean(mask, min_area):
    mask = ndi.binary_closing(mask, iterations=3)
    mask = ndi.binary_fill_holes(mask)
    mask = ndi.binary_opening(mask, iterations=1)
    lab, n = ndi.label(mask)
    if n:
        areas = ndi.sum(mask, lab, range(1, n + 1))
        keep = [i + 1 for i, a in enumerate(areas) if a >= min_area]
        mask = np.isin(lab, keep)
    return mask


def _feather(mask, r):
    a = Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(r))
    return np.array(a) / 255.0


def bouquet(im):
    w, h = im.size
    hsv = np.array(im.convert("HSV")).astype(float) / 255
    S, V = hsv[..., 1], hsv[..., 2]
    wall = (S < 0.12) & (V > 0.25)
    yy, xx = np.mgrid[0:h, 0:w]
    table = yy > 664 + xx * (169 / 736)
    vase = _poly_mask(im.size, [(292, 596), (434, 588), (442, 700), (428, 830), (402, 902), (330, 916), (290, 862), (282, 760), (290, 680)])
    fg = (~wall) & (~table) & (~vase)                      # no vase: the stems are replanted in a garden by the page
    fg = ndi.binary_opening(fg, iterations=3)
    fg = _clean(fg, 3000)
    return fg, None


def cake(im):
    pts = [(286, 455), (284, 400), (292, 372), (300, 345), (303, 318), (325, 305), (335, 280), (352, 278), (358, 300), (370, 330),
           (392, 348), (398, 310), (414, 288), (428, 290), (425, 330), (448, 342), (462, 330), (470, 292), (480, 288), (484, 320),
           (498, 330), (506, 290), (520, 288), (528, 318), (527, 350), (545, 380), (548, 420), (540, 455), (528, 478), (545, 478),
           (560, 484), (575, 505), (585, 540), (590, 575), (595, 610), (590, 640), (610, 655), (630, 690), (634, 740), (622, 772),
           (602, 796), (540, 820), (420, 826), (300, 820), (240, 808), (216, 792),
           (204, 750), (207, 712), (240, 690), (248, 660), (250, 600), (255, 560), (256, 520), (248, 505), (262, 490), (285, 492), (290, 500)]
    poly = _poly_mask(im.size, pts)
    a = np.array(im.convert("RGB")).astype(float)
    h, w = poly.shape
    ring = ndi.binary_dilation(poly, iterations=45) & ~ndi.binary_dilation(poly, iterations=8)
    wallc = np.zeros((h, 3))                               # the wall's colour on each row, read from just outside the cake
    for y in range(h):
        px = a[y][ring[y]]
        wallc[y] = np.median(px, axis=0) if len(px) > 6 else (wallc[y - 1] if y else a[0, 0])
    wallc = ndi.gaussian_filter1d(wallc, 6, axis=0)
    d = np.sqrt(((a - wallc[:, None, :]) ** 2).sum(-1))
    red = (a[..., 0] > 110) & (a[..., 0] > a[..., 1] * 1.5)                           # cherries and stems always stay
    keep = poly & ((d > 42) | red)
    keep = ndi.binary_opening(keep, iterations=2)
    keep = ndi.binary_closing(keep, iterations=4)
    return ndi.binary_fill_holes(keep) & poly, None


def letter(im):
    a = np.array(im.convert("RGB")).astype(float)
    bg = np.median(np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3)]), axis=0)
    near = np.sqrt(((a - bg) ** 2).sum(-1)) < 28
    lab, n = ndi.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border))
    return ~outside, None


CUTS = {"bouquet": bouquet, "cake": cake, "letter": letter}


def cut(name, im):
    fg, glass = CUTS[name](im)
    a = _feather(fg, 1.2)
    out = im.convert("RGBA")
    arr = np.array(out)
    arr[..., 3] = (a * 255).astype("uint8")
    if glass is not None:                                   # the glass vase is see-through: draw it fainter
        g = _feather(glass, 2) 
        arr[..., 3] = (arr[..., 3] * (1 - 0.35 * g)).astype("uint8")
    return Image.fromarray(arr)
