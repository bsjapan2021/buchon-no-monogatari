// 부트스트랩 — 캔버스/HUD 연결, 입력 바인딩, 메인 루프.
import { Game, localDayStr, type HudData, type GameSnapshot } from "./render/game.js";
import "./auth/auth.css";
import { initGate, type GateController } from "./auth/overlay.js";
import { loadGameState, saveGameState, signOut, type Profile } from "./auth/auth.js";

let gateCtl: GateController | null = null;

let started = false; // 로그인 승인 후 게임 시작 여부

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
    admin_console_btn: "관리자 콘솔", logout_btn: "로그아웃",
    sb_spins: "회전", sb_held: "구슬", sb_pending: "보류", sb_reach: "금일 리치", sb_super: "금일 大当たり",
    hint: "왼쪽 아래에서 구슬 발사 → 못에 튕겨 입상 → 숫자 회전",
    mode_normal: "통상", mode_kakuhen: "確変", mode_jitan: "時短", mode_rush: "RUSH", mode_suffix: " 모드",
    mute_on: "🔊 소리 켜짐 (M)", mute_off: "🔇 소리 꺼짐 (M)",
  },
  ja: {
    held: "持ち玉", launched: "発射数", pending: "保留(入賞)",
    ooatari: "大当たり", reach: "リーチ(偶数)", spins: "総回転数",
    speed: "回転速度", stop: "停止時間",
    fire: "玉発射 / 停止 (Space)", skip: "スキップ (S)", lang: "한국어",
    admin_console_btn: "管理者コンソール", logout_btn: "ログアウト",
    sb_spins: "回転", sb_held: "持ち玉", sb_pending: "保留", sb_reach: "本日リーチ", sb_super: "本日大当たり",
    hint: "左下から玉発射 → 釘に弾かれ入賞 → 数字回転",
    mode_normal: "通常", mode_kakuhen: "確変", mode_jitan: "時短", mode_rush: "RUSH", mode_suffix: "モード",
    mute_on: "🔊 サウンドON (M)", mute_off: "🔇 サウンドOFF (M)",
  },
};
let lastMode = "normal";
let lastSpecial = false;
let lastMuted = false;
function applyLang(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((e) => {
    const k = e.dataset.i18n;
    const v = k ? I18N[lang][k] : undefined;
    if (v) e.textContent = v;
  });
  document.documentElement.lang = lang;
  renderMode();
  updateMuteBtn(lastMuted);
}
el("btn-lang").addEventListener("click", () => {
  lang = lang === "ko" ? "ja" : "ko";
  applyLang();
});

function renderMode(): void {
  const label = I18N[lang][`mode_${lastMode}`] ?? I18N[lang].mode_normal!;
  el("h-mode").textContent = label!;
  el("h-modebadge").textContent = label! + I18N[lang].mode_suffix!;
  el("h-modebadge").classList.toggle("super", lastSpecial);
}

game.onHud = (h: HudData) => {
  lastMode = h.mode;
  lastSpecial = h.special;
  renderMode();
  el("h-window").textContent = h.special && h.windowSpin > 0 ? `時短 ${h.windowSpin}` : "";
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
  el("sb-pending").textContent = String(h.pending);
  el("sb-reach").textContent = fmt(h.reachCount);
  el("sb-super").textContent = fmt(h.ooatari);
  // 구슬 박스 (1박스=1000개) — 보유량만큼 양 사이드에 쌓임.
  renderBoxes(h.held);
};

// ---- 구슬 박스 (1000=투명, 많으면 2열, 초과 시 상위 박스로 교환) ----
// 박스 단계: 투명 1,000 → 빨강 3,000 → 녹색 10,000 → 금색 100,000.
type BoxTier = "clear" | "red" | "green" | "gold";
let lastBoxKey = "";
const CLEAR_CAP = 20; // 투명(1000) 20개(=2만) 초과 시 빨강(3000)으로
const RED_CAP = 20; // 빨강(3000) 20개(=6만) 초과 시 녹색(10000)으로
const GOLD_UNIT = 100000; // 10만개 이상이면 금색(100000) 박스로 교환 — 박스 수 최소화
function renderBoxes(held: number): void {
  let golds = 0;
  let greens = 0;
  let reds = 0;
  let clears = 0;
  const n1000 = Math.floor(held / 1000);
  if (held >= GOLD_UNIT) {
    // 금색 → 녹색 → 빨강 → 투명 순으로 큰 박스부터 채워 박스 개수를 최소화.
    golds = Math.floor(held / GOLD_UNIT);
    let rem = held - golds * GOLD_UNIT;
    greens = Math.floor(rem / 10000);
    rem -= greens * 10000;
    reds = Math.floor(rem / 3000);
    clears = Math.floor((rem - reds * 3000) / 1000);
  } else if (n1000 <= CLEAR_CAP) {
    clears = n1000;
  } else if (Math.floor(held / 3000) <= RED_CAP) {
    reds = Math.floor(held / 3000);
    clears = Math.floor((held - reds * 3000) / 1000);
  } else {
    greens = Math.floor(held / 10000);
    const rem = held - greens * 10000;
    reds = Math.floor(rem / 3000);
    clears = Math.floor((rem - reds * 3000) / 1000);
  }
  const key = `${golds}:${greens}:${reds}:${clears}`;
  if (key === lastBoxKey) return;
  lastBoxKey = key;
  const items: BoxTier[] = [];
  for (let i = 0; i < golds; i++) items.push("gold");
  for (let i = 0; i < greens; i++) items.push("green");
  for (let i = 0; i < reds; i++) items.push("red");
  for (let i = 0; i < clears; i++) items.push("clear");
  const L = Math.ceil(items.length / 2);
  el("boxes-left").innerHTML = itemsHtml(items.slice(0, L));
  el("boxes-right").innerHTML = itemsHtml(items.slice(L));
}
function itemsHtml(arr: BoxTier[]): string {
  return arr
    .map((t) => {
      const cls = t === "gold" ? " gold" : t === "green" ? " green" : t === "red" ? " red" : "";
      const label = t === "gold" ? "100000" : t === "green" ? "10000" : t === "red" ? "3000" : "ブチョン";
      return `<div class="ballbox${cls}"><span class="bb-label">${label}</span></div>`;
    })
    .join("");
}

// ---- 입력 ----
el("btn-fire").addEventListener("click", () => game.toggleAuto());
el("btn-skip").addEventListener("click", () => game.requestSkip());

const updateMuteBtn = (muted: boolean) => {
  lastMuted = muted;
  el("btn-mute").textContent = muted ? I18N[lang].mute_off! : I18N[lang].mute_on!;
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
  if (!started) return; // 로그인 전에는 게임 입력 무시
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

// ---- 모바일 가로: 데스크탑 레이아웃을 통째로 축소(scale-to-fit) → PC와 동일 ----
const DESIGN_W = 1480; // PC 데스크탑과 동일한 설계 크기(모든 요소가 들어오는 비율)
const DESIGN_H = 760;
const appEl = el("app");
function applyScale(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 짧은 변 < 640 = 폰(가로/세로 무관) → 데스크탑 레이아웃을 통째로 축소.
  const scaleMode = Math.min(vw, vh) < 640;
  if (scaleMode) {
    document.body.classList.add("scaled");
    const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    appEl.style.width = `${DESIGN_W}px`;
    appEl.style.height = `${DESIGN_H}px`;
    appEl.style.transform = `translate(-50%, -50%) scale(${s})`;
  } else {
    document.body.classList.remove("scaled");
    appEl.style.width = "";
    appEl.style.height = "";
    appEl.style.transform = "";
  }
  game.relayout();
}
window.addEventListener("resize", applyScale);
window.addEventListener("orientationchange", () => {
  applyScale();
  setTimeout(applyScale, 300); // iOS: 회전 직후 innerHeight 반영 지연 대비
});
window.addEventListener("pageshow", applyScale);
window.addEventListener("load", applyScale);

// ---- 상태 저장(재접속 복원) : 로그인=DB, 게스트=localStorage ----
const LS_KEY = "buchon-state";
function loadLocal(): Partial<GameSnapshot> | null {
  try {
    const s = localStorage.getItem(LS_KEY);
    return s ? (JSON.parse(s) as Partial<GameSnapshot>) : null;
  } catch {
    return null;
  }
}
function saveLocal(s: GameSnapshot): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* 무시 */
  }
}

// ---- 로그인 승인 후 게임 시작 ----
function setupAccountBar(profile: Profile): void {
  const acc = document.getElementById("account");
  if (!acc) return;
  acc.hidden = false;
  el("acc-user").textContent = "👤 " + (profile.name || profile.email || "GUEST");
  const adminBtn = el("acc-admin") as HTMLButtonElement;
  if (profile.role === "admin") {
    adminBtn.hidden = false;
    adminBtn.onclick = () => gateCtl?.openAdmin();
  }
  el("acc-logout").addEventListener("click", async () => {
    await signOut();
    location.reload();
  });
}

async function startGame(profile: Profile): Promise<void> {
  if (started) return;
  started = true;
  document.body.classList.add("authed");
  setupAccountBar(profile);
  // 저장된 상태 복원.
  try {
    const snap = profile.id === "guest" ? loadLocal() : ((await loadGameState()) as Partial<GameSnapshot> | null);
    if (snap) game.restore(snap);
  } catch {
    /* 무시 */
  }
  applyScale();
  setTimeout(applyScale, 200);
  // 상태 저장 — 5초 주기 + 이탈/백그라운드 시.
  // 플레이 중 자정을 넘기면 금일 카운터(회전/리치/오아다리) 자동 초기화.
  let lastDay = localDayStr();
  const save = (): void => {
    const today = localDayStr();
    if (today !== lastDay) {
      game.resetDaily();
      lastDay = today;
    }
    const s = game.snapshot();
    if (profile.id === "guest") saveLocal(s);
    else void saveGameState(s as unknown as Record<string, unknown>);
  };
  setInterval(save, 5000);
  window.addEventListener("beforeunload", save);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) save();
  });
  // 메인 루프.
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// 스플래시/로그인 게이트 — 승인되면 게임 시작.
gateCtl = initGate((p) => {
  void startGame(p);
});
