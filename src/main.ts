// 부트스트랩 — 캔버스/HUD 연결, 입력 바인딩, 메인 루프.
import { Game, type HudData } from "./render/game.js";

const canvas = document.getElementById("screen") as HTMLCanvasElement;
const game = new Game(canvas);

const el = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.round(n).toLocaleString();

// ---- i18n (한국어 / 日本語 전환) ----
type Lang = "ko" | "ja";
let lang: Lang = "ko";
const I18N: Record<Lang, Record<string, string>> = {
  ko: {
    held: "보유 구슬", launched: "총 발사", pending: "보류(입상)",
    ooatari: "大当たり·오아다리", reach: "리치(짝수)", spins: "총 회전수",
    speed: "회전 속도", stop: "멈춤 시간",
    fire: "구슬 발사 / 정지 (Space)", skip: "스킵 (S)", lang: "日本語",
    sb_spins: "회전", sb_held: "구슬", sb_reach: "금일 리치", sb_super: "금일 大当たり",
    hint: "왼쪽 아래에서 구슬 발사 → 못에 튕겨 입상 → 숫자 회전",
    mode_normal: "일반", mode_super: "슈퍼", mode_suffix: " 모드",
  },
  ja: {
    held: "持ち玉", launched: "発射数", pending: "保留(入賞)",
    ooatari: "大当たり", reach: "リーチ(偶数)", spins: "総回転数",
    speed: "回転速度", stop: "停止時間",
    fire: "玉発射 / 停止 (Space)", skip: "スキップ (S)", lang: "한국어",
    sb_spins: "回転", sb_held: "持ち玉", sb_reach: "本日リーチ", sb_super: "本日大当たり",
    hint: "左下から玉発射 → 釘に弾かれ入賞 → 数字回転",
    mode_normal: "通常", mode_super: "スーパー", mode_suffix: "モード",
  },
};
function applyLang(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((e) => {
    const k = e.dataset.i18n;
    const v = k ? I18N[lang][k] : undefined;
    if (v) e.textContent = v;
  });
  document.documentElement.lang = lang;
}
el("btn-lang").addEventListener("click", () => {
  lang = lang === "ko" ? "ja" : "ko";
  applyLang();
});

game.onHud = (h: HudData) => {
  const mk = h.mode === "슈퍼" ? "mode_super" : "mode_normal";
  el("h-mode").textContent = I18N[lang][mk]!;
  el("h-modebadge").textContent = I18N[lang][mk]! + I18N[lang].mode_suffix!;
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

// ---- 구슬 박스 (1000=투명, 많으면 2열, 초과 시 빨강 3000 교환) ----
let lastBoxKey = "";
const CLEAR_CAP = 20; // 투명 1000박스가 이보다 많으면 빨강(3000)으로 교환
function renderBoxes(held: number): void {
  const n1000 = Math.floor(held / 1000);
  let reds = 0;
  let clears = 0;
  if (n1000 > CLEAR_CAP) {
    reds = Math.floor(held / 3000);
    clears = Math.floor((held - reds * 3000) / 1000);
  } else {
    clears = n1000;
  }
  const key = `${reds}:${clears}`;
  if (key === lastBoxKey) return;
  lastBoxKey = key;
  const items: boolean[] = [];
  for (let i = 0; i < reds; i++) items.push(true);
  for (let i = 0; i < clears; i++) items.push(false);
  const L = Math.ceil(items.length / 2);
  el("boxes-left").innerHTML = itemsHtml(items.slice(0, L));
  el("boxes-right").innerHTML = itemsHtml(items.slice(L));
}
function itemsHtml(arr: boolean[]): string {
  return arr
    .map((red) => `<div class="ballbox${red ? " red" : ""}"><span class="bb-label">${red ? "3000" : "ブチョン"}</span></div>`)
    .join("");
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

applyLang();

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
