// 심해 배경 — 그라디언트 + 광선(God Ray) + 커스틱스 근사. (PRD §5.5)
// 상태(통상/ST/시단)에 따라 색조를 바꾼다.
import type { GameState } from "../engine/types.js";

const THEMES: Record<GameState, [string, string, string]> = {
  NORMAL: ["#02121f", "#06324d", "#0a4a63"],
  ST: ["#1a0730", "#3a1066", "#5a2a9a"],
  JIDAN: ["#07201a", "#0d4336", "#166b52"],
};

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  state: GameState,
): void {
  const [c0, c1, c2] = THEMES[state];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, c0);
  g.addColorStop(0.55, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 광선: 상단에서 내려오는 반투명 빗살.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const x = ((i / 5) * w + Math.sin(t * 0.2 + i) * 40) % w;
    const grad = ctx.createLinearGradient(x, 0, x + 120, h);
    grad.addColorStop(0, "rgba(120,220,255,0.10)");
    grad.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 70, 0);
    ctx.lineTo(x + 220, h);
    ctx.lineTo(x + 20, h);
    ctx.closePath();
    ctx.fill();
  }
  // 커스틱스: 흔들리는 밝은 밴드.
  for (let i = 0; i < 3; i++) {
    const y = (h * 0.2 + i * h * 0.25 + Math.sin(t * 0.6 + i * 2) * 20) % h;
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#9fe9ff";
    ctx.fillRect(0, y, w, 2 + Math.sin(t + i) * 1.5);
  }
  ctx.restore();
}
