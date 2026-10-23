#!/usr/bin/env python3
# 오아다리 징조용 — 폴더의 8.png/9.png(피규어, 베이지 배경)에서 배경을 제거.
# 코너 색(베이지)과 유사한 영역을 테두리에서 BFS 제거 → 최대 연결영역만 남김.
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "src", "assets", "omen")
os.makedirs(OUT, exist_ok=True)
HALF = 720


def bfs_ext(mask):
    h, w = mask.shape
    ext = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if mask[y, x] and not ext[y, x]:
                ext[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if mask[y, x] and not ext[y, x]:
                ext[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not ext[ny, nx]:
                ext[ny, nx] = True
                dq.append((ny, nx))
    return ext


def largest(fg):
    h, w = fg.shape
    lab = np.zeros((h, w), np.int32)
    cur = bl = bs = 0
    for sy in range(h):
        for sx in range(w):
            if fg[sy, sx] and lab[sy, sx] == 0:
                cur += 1
                sz = 0
                dq = deque([(sy, sx)])
                lab[sy, sx] = cur
                while dq:
                    y, x = dq.popleft()
                    sz += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            if dy == 0 and dx == 0:
                                continue
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and lab[ny, nx] == 0:
                                lab[ny, nx] = cur
                                dq.append((ny, nx))
                if sz > bs:
                    bs = sz
                    bl = cur
    return lab == bl


def process(num):
    img = Image.open(os.path.join(ROOT, f"{num}.png")).convert("RGB")
    full = np.asarray(img)
    H, W, _ = full.shape
    small = img.resize((HALF, HALF), Image.BILINEAR)
    s = np.asarray(small).astype(int)
    # 코너 4곳의 중앙값을 배경색으로.
    corners = np.array([s[0, 0], s[0, -1], s[-1, 0], s[-1, -1]])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((s - bg) ** 2).sum(axis=2))
    removable = dist < 42  # 베이지 배경 허용 오차
    ext = bfs_ext(removable)
    fg = ~ext
    keep = largest(fg)
    # 내부 구멍 메움.
    holes = bfs_ext(~keep)
    keep = keep | (~holes & ~keep)

    mask = Image.fromarray((keep * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(2))
    alpha = np.clip((np.asarray(mask).astype(np.int32) - 60) * 3, 0, 255).astype(np.uint8)
    rgba = np.dstack([full, alpha])
    ys, xs = np.where(alpha > 20)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = rgba[y0 : y1 + 1, x0 : x1 + 1]
    ch, cw, _ = crop.shape
    side = max(ch, cw)
    pad = int(side * 0.06)
    canvas = np.zeros((ch + 2 * pad, cw + 2 * pad, 4), np.uint8)
    canvas[pad : pad + ch, pad : pad + cw] = crop
    out = Image.fromarray(canvas)
    scale = 760 / max(out.size)
    out = out.resize((int(out.width * scale), int(out.height * scale)), Image.LANCZOS)
    out.save(os.path.join(OUT, f"{num}.png"))
    print(f"  {num}.png -> omen/{num}.png ({cw}x{ch} crop)")


if __name__ == "__main__":
    print("오아다리 징조 누끼:")
    for n in (8, 9):
        process(n)
    sheet = Image.new("RGBA", (1520, 760), (20, 30, 45, 255))
    for i, n in enumerate((8, 9)):
        im = Image.open(os.path.join(OUT, f"{n}.png"))
        sheet.paste(im, (i * 760 + (760 - im.width) // 2, (760 - im.height) // 2), im)
    sheet.save(os.path.join(OUT, "_check.png"))
    print("완료: src/assets/omen/_check.png")
