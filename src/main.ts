// 부트스트랩 — 캔버스/HUD 연결, 입력 바인딩, 메인 루프.
import { Game, type HudData } from "./render/game.js";

const canvas = document.getElementById("screen") as HTMLCanvasElement;
const game = new Game(canvas);

const el = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.round(n).toLocaleString();

game.onHud = (h: HudData) => {
  el("h-mode").textContent = h.mode;
  el("h-modebadge").textContent = `${h.mode} 모드`;
  el("h-modebadge").classList.toggle("super", h.mode === "슈퍼");
  el("h-window").textContent = h.windowSpin > 0 ? `${h.windowSpin}/100 회전` : "";
  const held = el("h-held");
  held.textContent = fmt(h.held);
  held.style.color = h.held > 0 ? "var(--teal)" : "#ff8a8a";
  el("h-launched").textContent = fmt(h.launched);
  el("h-pending").textContent = String(h.pending);
  el("h-ooatari").textContent = fmt(h.ooatari);
  el("h-reach").textContent = fmt(h.reachCount);
  el("h-spins").textContent = fmt(h.totalSpins);
  el("h-msg").textContent = h.message;
  // 상단 전광판 실시간.
  el("sb-spins").textContent = fmt(h.totalSpins);
  el("sb-held").textContent = fmt(h.held);
  el("sb-reach").textContent = fmt(h.reachCount);
  el("sb-super").textContent = fmt(h.ooatari);
  // 구슬 박스 (1박스=1000개) — 보유량만큼 양 사이드에 쌓임.
  renderBoxes(h.held);
};

// ---- 구슬 박스 ----
let lastBoxN = -1;
function renderBoxes(held: number): void {
  const n = Math.min(40, Math.floor(held / 1000));
  if (n === lastBoxN) return;
  lastBoxN = n;
  const L = Math.ceil(n / 2);
  const R = n - L;
  el("boxes-left").innerHTML = boxHtml(L);
  el("boxes-right").innerHTML = boxHtml(R);
}
function boxHtml(k: number): string {
  let s = "";
  for (let i = 0; i < k; i++) s += '<div class="ballbox"><span class="bb-label">ブチョンPACHINKO</span></div>';
  return s;
}

// ---- 입력 ----
el("btn-fire").addEventListener("click", () => game.toggleAuto());
el("btn-skip").addEventListener("click", () => game.requestSkip());

const updateMuteBtn = (muted: boolean) => {
  el("btn-mute").textContent = muted ? "🔇 소리 꺼짐 (M)" : "🔊 소리 켜짐 (M)";
};
el("btn-mute").addEventListener("click", () => updateMuteBtn(game.toggleMute()));

const sSpeed = el("s-speed") as HTMLInputElement;
const sStop = el("s-stop") as HTMLInputElement;
sSpeed.addEventListener("input", () => {
  const v = Number(sSpeed.value);
  game.setSpinSpeed(v);
  el("v-speed").textContent = `${v.toFixed(1)}×`;
});
sStop.addEventListener("input", () => {
  const v = Number(sStop.value);
  game.setStopTime(v);
  el("v-stop").textContent = `${v.toFixed(1)}×`;
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    game.toggleAuto();
  } else if (e.key.toLowerCase() === "s") {
    game.requestSkip();
  } else if (e.key.toLowerCase() === "m") {
    updateMuteBtn(game.toggleMute());
  }
});

// ---- 메인 루프 ----
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
