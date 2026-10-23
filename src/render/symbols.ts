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

/** 짝수=파란 배경(통상), 홀수=빨간 배경(확변), 7=황금 프리미엄. */
export function paletteFor(id: number): SymbolPalette {
  if (id === 7) {
    return { core: "#fff4c2", edge: "#e8a81e", glow: "#ffcf3a", text: "#5a3b00" };
  }
  if (id % 2 === 1) {
    // 홀수 = 빨강
    return { core: "#ffe0e0", edge: "#b81c1c", glow: "#ff4d4d", text: "#4a0505" };
  }
  // 짝수 = 파랑
  return { core: "#dbe9ff", edge: "#1b4fb5", glow: "#3b82f6", text: "#06204a" };
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

  // 사각 카드 없이 — 부드러운 원형 발광 배경(자연스럽게).
  const rr = size * 0.62;
  const bg = ctx.createRadialGradient(cx, cy, rr * 0.15, cx, cy, rr);
  bg.addColorStop(0, hexToRgba(pal.glow, 0.32 + glowBoost * 0.4));
  bg.addColorStop(0.55, hexToRgba(pal.glow, 0.12));
  bg.addColorStop(1, hexToRgba(pal.glow, 0));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.fill();

  // 캐릭터 이미지 (contain, 중앙 정렬) + 발광.
  const img = IMAGES[id - 1];
  if (img && img.complete && img.naturalWidth > 0) {
    const box = size * 0.98;
    const ar = img.naturalWidth / img.naturalHeight;
    let dw = box;
    let dh = box;
    if (ar >= 1) dh = box / ar;
    else dw = box * ar;
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = glow;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.shadowBlur = 0;
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
