// 슬롯 심볼 1~9 — 사용자 자체 브랜드 마스코트(DUOCE NANOHYDROIN) 누끼 이미지.
// scripts/cutout.py 로 배경/텍스트 제거한 src/assets/char/<n>.png 를 사용한다.
// 숫자 매칭 가독성을 위해 홀/짝 발광 배경 + 숫자 배지를 함께 그린다.
import u1 from "../assets/char/1.png";
import u2 from "../assets/char/2.png";
import u3 from "../assets/char/3.png";
import u4 from "../assets/char/4.png";
import u5 from "../assets/char/5.png";
import u6 from "../assets/char/6.png";
import u7 from "../assets/char/7.png";
import u8 from "../assets/char/8.png";
import u9 from "../assets/char/9.png";
import u10 from "../assets/char/10.png";
import u11 from "../assets/char/11.png";

// 1~9 = 릴 심볼, 10~11 = 리치/오아다리 컷인 전용 추가 포즈.
const URLS = [u1, u2, u3, u4, u5, u6, u7, u8, u9, u10, u11];

const IMAGES: HTMLImageElement[] = URLS.map((u) => {
  const im = new Image();
  im.src = u;
  return im;
});

/** 컷인 등 외부 렌더에서 캐릭터 이미지(1~11)를 가져온다. */
export function getCharImage(id: number): HTMLImageElement | null {
  return IMAGES[id - 1] ?? null;
}

// 오아다리 징조 전용 이미지 (폴더 8.png/9.png 누끼 — 사용자 제공 피규어).
import o8 from "../assets/omen/8.png";
import o9 from "../assets/omen/9.png";

const OMEN_IMAGES: Record<number, HTMLImageElement> = {};
for (const [id, url] of [
  [8, o8],
  [9, o9],
] as const) {
  const im = new Image();
  im.src = url;
  OMEN_IMAGES[id] = im;
}

export function getOmenImage(id: number): HTMLImageElement | null {
  return OMEN_IMAGES[id] ?? null;
}

export interface SymbolPalette {
  core: string;
  edge: string;
  glow: string;
  text: string;
}

/** 홀수=청록 발광, 짝수=보라 발광, 7=황금 프리미엄. (PRD §1.2) */
export function paletteFor(id: number): SymbolPalette {
  if (id === 7) {
    return { core: "#fff4c2", edge: "#e8a81e", glow: "#ffcf3a", text: "#5a3b00" };
  }
  if (id % 2 === 1) {
    return { core: "#d6fff6", edge: "#0f8f7e", glow: "#2ee6c6", text: "#063b34" };
  }
  return { core: "#efe2ff", edge: "#6b3fd4", glow: "#9b6cff", text: "#2a1159" };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 심볼 1개를 그린다.
 * @param t 시간(초) — 발광 맥동.
 * @param glowBoost 당첨/리치 시 발광 증폭 (0..1).
 */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  id: number,
  cx: number,
  cy: number,
  size: number,
  t: number,
  glowBoost = 0,
): void {
  const pal = paletteFor(id);
  const r = size / 2;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3 + id);
  const glow = 8 + pulse * 8 + glowBoost * 36;

  ctx.save();

  // 발광 배경 패널 (둥근 사각 + 홀/짝 색).
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = glow;
  const panel = size * 0.92;
  const grad = ctx.createLinearGradient(cx, cy - panel / 2, cx, cy + panel / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.14)");
  grad.addColorStop(0.5, hexToRgba(pal.glow, 0.22));
  grad.addColorStop(1, hexToRgba(pal.edge, 0.3));
  roundRect(ctx, cx - panel / 2, cy - panel / 2, panel, panel, size * 0.14);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, size * 0.025);
  ctx.strokeStyle = hexToRgba(pal.glow, 0.85);
  ctx.stroke();

  // 캐릭터 이미지 (contain, 중앙 정렬).
  const img = IMAGES[id - 1];
  if (img && img.complete && img.naturalWidth > 0) {
    const box = size * 0.86;
    const ar = img.naturalWidth / img.naturalHeight;
    let dw = box;
    let dh = box;
    if (ar >= 1) dh = box / ar;
    else dw = box * ar;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    // 로딩 전 폴백: 숫자만.
    ctx.fillStyle = pal.core;
    ctx.font = `900 ${Math.floor(size * 0.5)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(id), cx, cy);
  }

  // 숫자 배지 (우하단).
  const br = size * 0.17;
  const bx = cx + r * 0.62;
  const by = cy + r * 0.62;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = pal.glow;
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = 8 + glowBoost * 20;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, size * 0.02);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();
  ctx.fillStyle = pal.text;
  ctx.font = `900 ${Math.floor(br * 1.4)}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(id), bx, by + br * 0.04);

  ctx.restore();
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
