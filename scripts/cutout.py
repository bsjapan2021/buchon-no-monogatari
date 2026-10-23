#!/usr/bin/env python3
# 캐릭터 누끼 — 사용자 자체 브랜드 마스코트(DUOCE NANOHYDROIN) 스티커에서
# 배경 + 흰색 다이컷 테두리를 제거하고, 가장 큰 연결영역(=캐릭터)만 남겨
# 텍스트 배너/장식(하트·해·집 등)을 자동 제거한다. scipy 미사용(numpy+PIL).
import glob
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "char")
os.makedirs(OUT, exist_ok=True)

# 번호 → 파일 prefix (표정 다양·얼굴 선명 위주, 7=프리미엄에 더블 썸업)
MAPPING = {
    1: "0698D30E",  # 좋은 아침 (손 흔들기)
    2: "A7955B50",  # 예 잘알겠습니다 (손 들기)
    3: "1C687EBE",  # 수고하세요 (손 흔들기)
    4: "835815CB",  # 두 손 모으기 (공손)
    5: "4DD3E21B",  # 흐뭇 (눈감고 미소)
    6: "02E6230B",  # 오늘도 참 수고 (가슴에 손/하트)
    7: "EE435F2C",  # 더블 썸업 (최고 텐션) → 프리미엄
    8: "EFF36F60",  # 수줍게 손 모음
    9: "49DC63E7",  # 아내가 무서워요 (당황)
    10: "16F5F7D8",  # 달리기 Go~Go! (역동) — 리치/오아다리 컷인용
    11: "BD2FB786",  # 공손히 부탁 (형님 부탁합니다) — 리치/오아다리 컷인용
}

HALF = 640  # 마스크 계산 해상도


def find(prefix: str) -> str:
    hits = glob.glob(os.path.join(os.path.dirname(__file__), "..", prefix + "*.png"))
    if not hits:
        raise FileNotFoundError(prefix)
    return hits[0]


def removable_mask(rgb: np.ndarray) -> np.ndarray:
    """흰색/검정(저채도 극단) = 배경 후보."""
    r, g, b = (rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int))
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    whiteish = mn > 226
    blackish = mx < 30
    return whiteish | blackish


def bfs_exterior(removable: np.ndarray) -> np.ndarray:
    """테두리에서 출발해 removable 을 타고 들어간 외부 영역(배경+다이컷)."""
    h, w = removable.shape
    ext = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if removable[y, x] and not ext[y, x]:
                ext[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if removable[y, x] and not ext[y, x]:
                ext[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and removable[ny, nx] and not ext[ny, nx]:
                ext[ny, nx] = True
                dq.append((ny, nx))
    return ext


def largest_component(fg: np.ndarray) -> np.ndarray:
    """8-연결 최대 연결영역만 True."""
    h, w = fg.shape
    label = np.zeros((h, w), np.int32)
    cur = 0
    best_label = 0
    best_size = 0
    for sy in range(h):
        for sx in range(w):
            if fg[sy, sx] and label[sy, sx] == 0:
                cur += 1
                size = 0
                dq = deque([(sy, sx)])
                label[sy, sx] = cur
                while dq:
                    y, x = dq.popleft()
                    size += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            if dy == 0 and dx == 0:
                                continue
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and label[ny, nx] == 0:
                                label[ny, nx] = cur
                                dq.append((ny, nx))
                if size > best_size:
                    best_size = size
                    best_label = cur
    return label == best_label


def process(num: int, path: str) -> None:
    img = Image.open(path).convert("RGB")
    full = np.asarray(img)
    H, W, _ = full.shape

    small = img.resize((HALF, HALF), Image.NEAREST)
    rgb_s = np.asarray(small)
    rem = removable_mask(rgb_s)
    ext = bfs_exterior(rem)
    fg = ~ext  # 캐릭터 + 텍스트 글자 + 장식 (외부 배경/테두리 제외)
    keep = largest_component(fg)

    # 작은 구멍(안경 안쪽 등) 메우기: keep 의 보수 중 테두리에 닿지 않는 건 캐릭터로 간주
    holes = bfs_exterior(~keep)
    keep = keep | (~holes & ~keep)  # 내부 구멍 채움

    # 풀 해상도로 업스케일 + 소프트 에지
    mask_img = Image.fromarray((keep * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(2))
    alpha = np.asarray(mask_img).astype(np.int32)  # int32: 뺄셈 언더플로 방지
    alpha = np.clip((alpha - 60) * 3, 0, 255).astype(np.uint8)  # 에지 정리

    rgba = np.dstack([full, alpha])

    # 바운딩 박스 크롭
    ys, xs = np.where(alpha > 20)
    if len(ys) == 0:
        raise RuntimeError(f"empty cutout: {num}")
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = rgba[y0 : y1 + 1, x0 : x1 + 1]

    # 정사각 패딩
    ch, cw, _ = crop.shape
    side = max(ch, cw)
    pad = int(side * 0.08)
    canvas = np.zeros((side + 2 * pad, side + 2 * pad, 4), np.uint8)
    oy = (canvas.shape[0] - ch) // 2
    ox = (canvas.shape[1] - cw) // 2
    canvas[oy : oy + ch, ox : ox + cw] = crop

    out = Image.fromarray(canvas).resize((512, 512), Image.LANCZOS)
    out.save(os.path.join(OUT, f"{num}.png"))
    print(f"  {num}: {os.path.basename(path)} -> {num}.png  ({cw}x{ch} crop)")


if __name__ == "__main__":
    print("누끼 처리:")
    for num, pfx in MAPPING.items():
        process(num, find(pfx))
    # 검증용 컨택트 시트
    sheet = Image.new("RGBA", (512 * 3, 512 * 3), (20, 30, 45, 255))
    for num in MAPPING:
        im = Image.open(os.path.join(OUT, f"{num}.png"))
        r, c = (num - 1) // 3, (num - 1) % 3
        sheet.paste(im, (c * 512, r * 512), im)
    sheet.save(os.path.join(OUT, "_contact_sheet.png"))
    print("완료. 검증: src/assets/char/_contact_sheet.png")
