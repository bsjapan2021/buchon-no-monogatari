// 게임 오케스트레이터 — 파친코 물리(구슬) + 결과 컨트롤러(ST식 모드) + 릴 연출.
import { Reel } from "./reel.js";
import { Effects } from "./effects.js";
import { Stampede } from "./boars.js";
import { Nuke } from "./nuke.js";
import { drawBackground } from "./background.js";
import { paletteFor, getCharImage, getOmenImage, getPremiumImage, drawSymbol } from "./symbols.js";
import { Playfield, type PanelRect } from "./playfield.js";
import { OutcomeController, lineCells, type Outcome, type LineSpec, type Mode } from "./outcome.js";
import { AudioManager } from "./audio.js";
import v11 from "../assets/11.mp4";
import v12 from "../assets/12.mp4";

export interface HudData {
  held: number;
  launched: number;
  pending: number;
  mode: string;
  special: boolean;
  windowSpin: number;
  ooatari: number;
  reachCount: number;
  totalSpins: number;
  message: string;
}

// 재접속 시 복원되는 게임 상태(전광판 + 모드 포함).
export interface GameSnapshot {
  held: number;
  launched: number;
  pending: number;
  ooatari: number;
  reachCount: number;
  totalSpins: number;
  winChar: number;
  mode: Mode;
  jitanLeft: number;
  rush: boolean;
  windowSpin: number;
}

type Phase = "idle" | "spinning" | "result" | "cooldown";

const REACH_CUTINS = [1, 3, 7, 8, 9, 10, 11];
const OMEN_CUTINS = [8, 9];

// 리치/오아다리 프리미엄 테마 — 테마마다 색·캐릭터·불꽃·연출 강도가 다르다.
interface WinTheme {
  titleKo: string;
  titleJa: string;
  color: string; // 강조색(컷인/플래시/버스트)
  beam: string; // 섬광·흥분 바이어스 색
  fw: string | null; // 불꽃 색조(null=무지개)
  chars: number[]; // 컷인 캐릭터 로테이션(다양하게)
  omen: boolean; // 대형 피규어(8·9) 컷인 사용
  shake: number; // 당첨 진동
  fwDur: number; // 불꽃 지속(초)
  split: boolean; // 화면 분할 전환
  hype: number; // 서스펜스 최대 흥분도
  premium?: boolean; // 프리미엄 예감(소녀 캐릭터 컷인 — 오아다리 기대도 MAX)
  oinori?: boolean; // お祈り/お願い 모드 — 캐릭터 5·6이 달님에게 기도(달 연출)
}

// 프리미엄 예감 — 이 연출이 뜨면 오아다리로 갈 확률이 매우 높다(기대도 MAX).
// 소녀 캐릭터(public/premium/omen1·2.png) 컷인. 오아다리에 자주, 리치에 드물게 등장.
const PREMIUM_OMEN: WinTheme = {
  titleKo: "프리미엄 예감",
  titleJa: "プレミアム予感",
  color: "#ffcf3a",
  beam: "#ff7bd0",
  fw: null,
  chars: [8, 9], // 프리미엄 이미지 미로드 시 폴백(피규어 8·9)
  omen: true,
  shake: 1.6,
  fwDur: 7.5,
  split: true,
  hype: 1,
  premium: true,
};

// 리치(통상/짝수·파랑 계열) — 적당히 화려한 5종.
const REACH_THEMES: WinTheme[] = [
  { titleKo: "오로라 리치", titleJa: "オーロラリーチ", color: "#2ee6c6", beam: "#6cff9b", fw: "#2ee6c6", chars: [2, 4, 6, 5], omen: false, shake: 0.5, fwDur: 3.2, split: false, hype: 0.55 },
  { titleKo: "스타더스트 리치", titleJa: "スターダストリーチ", color: "#ffcf3a", beam: "#fff4c2", fw: "#ffcf3a", chars: [7, 10, 11, 1], omen: false, shake: 0.5, fwDur: 3.5, split: false, hype: 0.6 },
  { titleKo: "블로섬 리치", titleJa: "ブロッサムリーチ", color: "#ff7bd0", beam: "#ff7bd0", fw: "#ff7bd0", chars: [3, 8, 9, 6], omen: false, shake: 0.45, fwDur: 3.2, split: false, hype: 0.55 },
  { titleKo: "오션 리치", titleJa: "オーシャンリーチ", color: "#4db8ff", beam: "#8fe9ff", fw: "#4db8ff", chars: [1, 5, 6, 2], omen: false, shake: 0.5, fwDur: 3.4, split: false, hype: 0.6 },
  { titleKo: "레인보우 리치", titleJa: "レインボーリーチ", color: "#9b6cff", beam: "#9b6cff", fw: null, chars: [1, 2, 3, 4, 5, 6], omen: false, shake: 0.65, fwDur: 3.9, split: true, hype: 0.72 },
  // お祈り/お願い — 달님께 기도(소녀 캐릭터가 달을 향해). 리치판.
  { titleKo: "달님 기도 (오이노리)", titleJa: "お祈りモード", color: "#9fd4ff", beam: "#dff0ff", fw: "#9fd4ff", chars: [5, 6], omen: false, shake: 0.5, fwDur: 3.6, split: false, hype: 0.62, oinori: true },
];

// 오아다리(확변/홀수·빨강 계열) — 프리미엄 그랜드 6종.
const OOATARI_THEMES: WinTheme[] = [
  { titleKo: "골든 러시", titleJa: "ゴールドラッシュ", color: "#ffcf3a", beam: "#fff4c2", fw: "#ffcf3a", chars: [7, 11, 10], omen: false, shake: 1.3, fwDur: 6, split: true, hype: 1 },
  { titleKo: "크림슨 블래스트", titleJa: "クリムゾンブラスト", color: "#ff4d4d", beam: "#ff7b4d", fw: "#ff4d4d", chars: [9, 3, 1], omen: false, shake: 1.45, fwDur: 6, split: true, hype: 1 },
  { titleKo: "레인보우 페스티벌", titleJa: "レインボーフェス", color: "#9b6cff", beam: "#9b6cff", fw: null, chars: [1, 3, 5, 7, 9, 11], omen: false, shake: 1.3, fwDur: 7, split: true, hype: 1 },
  { titleKo: "로열 웨딩", titleJa: "ロイヤルウェディング", color: "#ffd6f0", beam: "#ff7bd0", fw: "#ff7bd0", chars: [8, 9], omen: true, shake: 1.2, fwDur: 6.5, split: true, hype: 1 },
  { titleKo: "메가 쇼크", titleJa: "メガショック", color: "#ffffff", beam: "#8fe9ff", fw: null, chars: [1, 5, 7, 11, 3], omen: false, shake: 1.65, fwDur: 6.5, split: true, hype: 1 },
  { titleKo: "에메랄드 드림", titleJa: "エメラルドドリーム", color: "#2ee6c6", beam: "#6cff9b", fw: "#2ee6c6", chars: [2, 6, 4, 10], omen: false, shake: 1.3, fwDur: 6, split: true, hype: 1 },
  // お願い成就 — 달님께 기도가 이루어진 오아다리판.
  { titleKo: "달님 기도 성취 (오네가이)", titleJa: "お願い成就", color: "#ffd36a", beam: "#fff4c2", fw: "#ffcf3a", chars: [5, 6], omen: false, shake: 1.35, fwDur: 6.5, split: true, hype: 1, oinori: true },
];

function pickTheme(arr: WinTheme[]): WinTheme {
  return arr[(Math.random() * arr.length) | 0]!;
}

function rnd9(): number {
  return 1 + Math.floor(Math.random() * 9);
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private controller = new OutcomeController();
  private reels: [Reel, Reel, Reel];
  private fx: Effects;
  private stampede = new Stampede(); // 오아다리 — 멧돼지 떼 질주
  private boarSoundT = 0; // 발굽 사운드 반복 타이머
  private nuke = new Nuke(); // 오아다리 3연속 — 원자폭탄 폭발
  private ooatariStreak = 0; // 연속 오아다리 횟수
  private audio = new AudioManager();

  private w = 0;
  private h = 0;
  private dpr = 1;
  private time = 0;

  private phase: Phase = "idle";
  private pt = 0;
  private skip = false;

  // 설정 (UI 슬라이더).
  private spinSpeedMul = 1;
  private stopTimeMul = 1;

  // 파친코 물리 + 인벤토리.
  private playfield = new Playfield();
  private held = 1000;
  private launched = 0;
  private launching = false;
  private launchTimer = 0;
  private pendingSpins = 0;

  // 현재 스핀 상태.
  private outcome: Outcome | null = null;
  private displayGrid: number[][] = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  private offsets: [number, number, number] = [0.2, -0.2, 0.2];
  private stopDelay: [number, number, number] = [0.5, 0.9, 1.3];
  private issued: [boolean, boolean, boolean] = [true, true, true];
  private landed: [boolean, boolean, boolean] = [true, true, true];
  private firstStopT = 0.45;
  private lastRow = 2;
  private winLine: LineSpec | null = null;
  private winGlow = 0;
  private winChar = 0; // 당첨 캐릭터 — 좌·우에 다음 당첨까지 표시

  // 컷인.
  private cutinActive = false;
  private cutinSet: number[] = REACH_CUTINS;
  private cutinIdx = 0;
  private cutinTimer = 0;
  private omenSwitched = false;
  private omenBig = false; // 오아다리 징조 — 8·9 큰 그림
  private theme: WinTheme | null = null; // 이번 리치/오아다리 테마

  // 프리미엄 영상 (사용자 제공).
  private videos: Record<string, HTMLVideoElement> = {};
  private videosUnlocked = false;
  private activeVideo: HTMLVideoElement | null = null;
  private reachStreak = 0; // 연속 리치 횟수

  private hud: HudData = {
    held: 1000,
    launched: 0,
    pending: 0,
    mode: "normal",
    special: false,
    windowSpin: 0,
    ooatari: 0,
    reachCount: 0,
    totalSpins: 0,
    message: "SPACE: 구슬 발사 / 정지 · S: 스킵",
  };

  onHud: (h: HudData) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.reels = [new Reel(11), new Reel(29), new Reel(47)];
    this.fx = new Effects(100, 100);
    for (const [key, src] of [
      ["11", v11],
      ["12", v12],
    ] as const) {
      const vd = document.createElement("video");
      vd.src = src;
      vd.playsInline = true;
      vd.preload = "auto";
      this.videos[key] = vd;
    }
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** 프리미엄 영상 재생 (이미 같은 영상 재생 중이면 유지). */
  private playVideo(key: string): void {
    const vd = this.videos[key];
    if (!vd) return;
    if (this.activeVideo === vd && !vd.ended) return;
    this.activeVideo = vd;
    vd.currentTime = 0;
    vd.muted = false;
    vd.volume = 1;
    vd.play().catch(() => {}); // iOS는 unlockVideos()로 사전 해제했으므로 음소거하지 않음
  }

  setSpinSpeed(v: number): void {
    this.spinSpeedMul = Math.max(0.3, Math.min(2.5, v));
  }
  setStopTime(v: number): void {
    this.stopTimeMul = Math.max(0.3, Math.min(2.5, v));
  }

  toggleAuto(): void {
    this.audio.start(); // 사용자 제스처 → 오디오 활성화
    this.unlockVideos(); // iOS: 영상 소리 사전 해제
    if (this.held <= 0 && !this.launching) {
      this.hud.message = "보유 구슬이 없습니다";
      this.emit();
      return;
    }
    this.launching = !this.launching;
    this.hud.message = this.launching ? "구슬 발사 중… (SPACE 정지)" : "발사 정지";
    this.emit();
  }

  requestSkip(): void {
    this.skip = true;
  }

  toggleMute(): boolean {
    this.audio.start();
    return this.audio.toggleMute();
  }

  /** 외부(스케일 변경 등)에서 재레이아웃을 강제. */
  relayout(): void {
    this.resize();
  }

  /** 현재 게임 상태 스냅샷(DB 저장용). */
  snapshot(): GameSnapshot {
    const cs = this.controller.getState();
    return {
      held: this.held,
      launched: this.launched,
      pending: this.pendingSpins,
      ooatari: this.hud.ooatari,
      reachCount: this.hud.reachCount,
      totalSpins: this.hud.totalSpins,
      winChar: this.winChar,
      mode: cs.mode,
      jitanLeft: cs.jitanLeft,
      rush: cs.rush,
      windowSpin: cs.windowSpin,
    };
  }

  /** 저장된 상태로 복원(재접속 시). */
  restore(s: Partial<GameSnapshot>): void {
    if (typeof s.held === "number") this.held = s.held;
    if (typeof s.launched === "number") this.launched = s.launched;
    if (typeof s.pending === "number") this.pendingSpins = Math.min(4, Math.max(0, s.pending));
    if (typeof s.ooatari === "number") this.hud.ooatari = s.ooatari;
    if (typeof s.reachCount === "number") this.hud.reachCount = s.reachCount;
    if (typeof s.totalSpins === "number") this.hud.totalSpins = s.totalSpins;
    if (typeof s.winChar === "number") this.winChar = s.winChar;
    this.controller.setState({
      mode: (s.mode as Mode) ?? "NORMAL",
      jitanLeft: s.jitanLeft ?? 0,
      rush: s.rush ?? false,
      windowSpin: s.windowSpin ?? 0,
    });
    const cs = this.controller.getState();
    this.hud.held = this.held;
    this.hud.launched = this.launched;
    this.hud.pending = this.pendingSpins;
    this.hud.mode = this.controller.getModeKey();
    this.hud.special = cs.mode !== "NORMAL";
    this.hud.windowSpin = cs.jitanLeft;
    this.audio.setMode(cs.mode !== "NORMAL" ? "SUPER" : "NORMAL");
    this.emit();
  }

  /** iOS/모바일: 첫 사용자 제스처에서 영상 재생을 사전 해제(오아다리 영상 소리 보장). */
  unlockVideos(): void {
    if (this.videosUnlocked) return;
    this.videosUnlocked = true;
    for (const vd of Object.values(this.videos)) {
      vd.muted = false;
      const vol = vd.volume || 1;
      vd.volume = 0; // 무음으로 잠깐 재생→정지하여 iOS 재생 권한 획득
      vd.play()
        .then(() => {
          vd.pause();
          vd.currentTime = 0;
          vd.volume = vol;
        })
        .catch(() => {
          vd.volume = vol;
        });
    }
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    // clientWidth/Height = 레이아웃(변형 전) 크기 → CSS transform:scale 로 축소돼도 설계 해상도로 렌더.
    const rect = this.canvas.getBoundingClientRect();
    this.w = this.canvas.clientWidth || rect.width;
    this.h = this.canvas.clientHeight || rect.height;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.fx.resize(this.w, this.h);
    this.stampede.resize(this.w, this.h);
    this.nuke.resize(this.w, this.h);
    this.playfield.layout(this.w, this.h, this.panelRect(), this.holeMouthY());
  }

  // ---- 스핀 시작 (입상 보류 1개 소화) ----
  private startSpin(): void {
    const out = this.controller.next();
    this.outcome = out;
    // skip은 사용자 S키 요청시에만. 모든 스핀은 1행→2행→3행 순차 슬라이딩 정지를 보여준다.
    this.winGlow = 0;
    this.winLine = null;
    this.fx.setHype(0);
    this.cutinActive = false;
    this.omenSwitched = false;
    this.omenBig = false;
    // 이번 스핀의 리치/오아다리 테마를 무작위 선택(매번 다른 연출).
    // 프리미엄 예감은 오아다리에 자주(45%)·리치에 드물게(8%) → 뜨면 오아다리 기대도 MAX.
    if (out.kind === "ooatari") {
      this.theme = Math.random() < 0.45 ? PREMIUM_OMEN : pickTheme(OOATARI_THEMES);
    } else if (out.kind === "reach") {
      this.theme = Math.random() < 0.08 ? PREMIUM_OMEN : pickTheme(REACH_THEMES);
    } else {
      this.theme = null;
    }
    this.fx.setHypeTint(this.theme?.beam ?? null);

    this.scheduleStops(out); // lastRow 먼저 결정
    this.buildDisplay(out);

    const speed = this.stepX() * 11 * this.spinSpeedMul;
    for (const r of this.reels) r.startSpin(speed);
    this.landed = [false, false, false];
    this.audio.startReelSpin();

    this.phase = "spinning";
    this.pt = 0;
  }

  private buildDisplay(out: Outcome): void {
    const g = [
      [rnd9(), rnd9(), rnd9()],
      [rnd9(), rnd9(), rnd9()],
      [rnd9(), rnd9(), rnd9()],
    ];
    const off: [number, number, number] = [this.randOffset(), this.randOffset(), this.randOffset()];
    if (out.line && (out.kind === "reach" || out.kind === "ooatari")) {
      // 완전 정렬(당첨).
      const cells = lineCells(out.line);
      for (const [r, c] of cells) g[r]![c] = out.number;
      for (const r of new Set(cells.map(([r]) => r))) off[r] = 0;
    } else if (out.line && out.kind === "reachlose") {
      // 리치 꽝: 마지막 정지 행의 셀만 불일치(2개 일치 + 1개 어긋남).
      const cells = lineCells(out.line);
      let diff = rnd9();
      while (diff === out.number) diff = rnd9();
      for (const [r, c] of cells) g[r]![c] = r === this.lastRow ? diff : out.number;
      for (const r of new Set(cells.map(([r]) => r))) off[r] = 0;
    }
    this.displayGrid = g;
    this.offsets = off;
  }

  /** 정위치에서 조금 지나치거나(+) 미달(-)한 랜덤 오프셋. */
  private randOffset(): number {
    return (Math.random() < 0.5 ? -1 : 1) * (0.16 + Math.random() * 0.18);
  }

  private scheduleStops(out: Outcome): void {
    // 1행 → 2행 → 3행 순차 정지 (위에서 아래로 차례대로 슬라이딩하며 멈춤).
    const order: [number, number, number] = [0, 1, 2];
    const base = this.dur(0.4);
    const gap = (): number => this.dur(0.22 + Math.random() * 0.12);
    const delays: [number, number, number] = [0, 0, 0];
    let t = base;
    delays[order[0]] = t;
    t += gap();
    delays[order[1]] = t;
    t += gap();
    if (out.kind !== "none") t += this.dur(out.kind === "ooatari" ? 3.4 : 1.0); // 서스펜스(마지막 3행 전, 오아다리 징조 길게)
    delays[order[2]] = t;
    this.stopDelay = delays;
    this.lastRow = order[2];
    this.firstStopT = base;
    this.issued = [false, false, false];
  }

  private dur(base: number): number {
    return (this.skip ? base * 0.08 : base) * this.stopTimeMul;
  }

  update(dt: number): void {
    this.time += dt;
    this.fx.update(dt);
    this.stampede.update(dt);
    this.nuke.update(dt);
    for (const r of this.reels) r.update(dt);
    if (this.winGlow > 0) this.winGlow = Math.max(0, this.winGlow - dt * 0.4);

    if (this.cutinActive) {
      this.cutinTimer += dt;
      if (this.cutinTimer > (this.omenBig ? 0.7 : 0.4)) {
        this.cutinIdx = (this.cutinIdx + 1) % this.cutinSet.length;
        this.cutinTimer = 0;
      }
    }

    // 구슬 발사 — 보유 구슬만큼.
    if (this.launching && this.held > 0) {
      this.launchTimer += dt;
      let did = false;
      while (this.launchTimer >= 0.13 && this.held > 0) {
        this.launchTimer -= 0.13;
        this.playfield.launch();
        this.held--;
        this.launched++;
        did = true;
      }
      if (this.held <= 0) {
        this.launching = false;
        this.hud.message = "구슬 소진";
        did = true;
      }
      if (did) {
        this.hud.held = this.held;
        this.hud.launched = this.launched;
        this.emit();
      }
    }

    // 물리 + 입상.
    const scored = this.playfield.update(dt);
    if (scored > 0) {
      this.pendingSpins = Math.min(4, this.pendingSpins + scored); // 보류 최대 4 (파친코 保留)
      this.hud.pending = this.pendingSpins;
      this.fx.flash("#2ee6c6", 0.22);
      for (let i = 0; i < scored; i++) this.audio.pocketIn(i * 0.05); // 한 개마다 효과음
      this.emit();
    }

    // 릴 회전 트리거 — 노란색 홀(포켓)에 구슬이 입상(보류)됐을 때만 1회 회전. 자동회전 없음.
    if (this.phase === "idle" && this.pendingSpins > 0) {
      this.pendingSpins--;
      this.hud.pending = this.pendingSpins;
      this.startSpin();
      this.emit(); // 릴이 돌기 시작하면 전광판 보류 숫자가 즉시 1 빠진다
    }

    switch (this.phase) {
      case "spinning":
        this.pt += dt;
        for (let r = 0; r < 3; r++) {
          if (!this.issued[r] && this.pt >= this.stopDelay[r]) {
            const extra = 5 + ((Math.random() * 6) | 0);
            const d = this.dur(0.4 + Math.random() * 0.35);
            this.reels[r]!.requestStop(
              this.targetsFor(r),
              this.stepX(),
              extra,
              d,
              this.offsets[r],
            );
            this.issued[r] = true;
          }
        }
        // 릴 카드가 멈추는 순간 독특한 스톱음.
        for (let r = 0; r < 3; r++) {
          if (!this.landed[r] && this.issued[r] && this.reels[r]!.stopped) {
            this.landed[r] = true;
            this.audio.reelStop(r);
          }
        }
        this.updateSuspense();
        if (this.reels[0].stopped && this.reels[1].stopped && this.reels[2].stopped) {
          this.audio.stopReelSpin(); // 릴 멈추면 회전 음악도 정지
          this.resolveResult();
          this.cutinActive = false;
          this.fx.setHype(0);
          this.phase = "result";
          this.pt = 0;
        }
        break;
      case "result": {
        this.pt += dt;
        // 리치/오아다리는 충분히 볼 수 있게 대기시간 증가.
        const hold = this.outcome?.kind === "ooatari" ? 4.2 : this.outcome?.kind === "reach" ? 2.6 : 0.25;
        if (this.pt > this.dur(hold)) {
          this.phase = "cooldown";
          this.pt = 0;
        }
        break;
      }
      case "cooldown":
        this.pt += dt;
        if (this.pt > this.dur(0.2)) {
          this.skip = false;
          this.phase = "idle";
        }
        break;
      case "idle":
      default:
        break;
    }

    // 프리미엄 영상 재생 중엔 오아다리 다이나믹 효과(섬광/진동) 지속(영상 가독 위해 중간 강도).
    if (this.activeVideo) {
      if (this.activeVideo.ended) {
        this.activeVideo = null;
        this.stampede.stop(); // 영상이 끝나면 멧돼지 생성 중단(남은 놈은 마저 지나감)
      } else {
        this.fx.setHype(0.6);
      }
    }

    // 멧돼지 질주 중엔 발굽 사운드를 반복 재생(영상 내내 들리게).
    if (this.stampede.isRunning()) {
      this.boarSoundT -= dt;
      if (this.boarSoundT <= 0) {
        this.audio.stampede(2.8);
        this.boarSoundT = 2.6;
      }
    } else {
      this.boarSoundT = 0;
    }
  }

  private updateSuspense(): void {
    const out = this.outcome;
    if (!out || out.kind === "none" || this.pt <= this.firstStopT) return;
    const t = this.theme;
    const total = this.stopDelay[this.lastRow];
    const prog = Math.min(1, (this.pt - this.firstStopT) / Math.max(0.001, total - this.firstStopT));
    const peak = out.kind === "ooatari" ? (t?.hype ?? 1) : 0.5;
    this.fx.setHype(peak * (0.5 + 0.5 * prog));
    if (!this.cutinActive) {
      this.cutinActive = true;
      this.audio.reachZap(); // 리치예감 순간 — 번개+전기 감전음 + 순간 볼륨 부스트(깜짝!)
      this.cutinSet = t?.chars ?? REACH_CUTINS; // 테마별 캐릭터 로테이션
      this.cutinIdx = 0;
      this.cutinTimer = 0;
      this.omenSwitched = false;
      let title: string;
      let sub = "";
      let col = t?.beam ?? "#9fe9ff";
      if (t?.premium) {
        title = "✦ プレミアム予感 ✦";
        sub = "大当たり 기대도 MAX!!";
        col = "#ffcf3a";
      } else if (t?.oinori) {
        title = `${t.titleJa} 🌙`;
        sub = "달님께 기도… 제발!";
        col = t.beam;
      } else {
        title = out.kind === "ooatari" ? (t ? `${t.titleJa} 予感!` : "チャンス! 찬스!") : "リーチ予感 / 리치 예감";
      }
      this.fx.showCutin(title, sub, col);
    }
    // 후반 돌입 — 대형 컷인 + 테마 타이틀 예고. (프리미엄은 더 일찍·더 강하게)
    const bigAt = t?.premium ? 0.18 : 0.3;
    if ((out.kind === "ooatari" || t?.premium) && prog > bigAt && !this.omenSwitched) {
      this.omenSwitched = true;
      this.omenBig = true; // 대형 컷인(테마가 omen이면 8·9 피규어, 프리미엄은 소녀 카드)
      if (t?.omen && !t.premium) this.cutinSet = OMEN_CUTINS;
      this.cutinIdx = 0;
      this.cutinTimer = 0;
      const title = t?.premium ? "大当たり 確定級!!" : `${t?.titleJa ?? "大当たり"} 予告!!`;
      const sub = t?.premium ? "프리미엄 — 오아다리 임박!!" : `${t?.titleKo ?? "홀수 정렬"} 확정 임박!`;
      this.fx.showCutin(title, sub, t?.color ?? "#ffcf3a");
      this.fx.spawnTeaser(t?.color ?? "#ffcf3a", 30);
    }
  }

  private resolveResult(): void {
    const out = this.outcome!;
    this.hud.totalSpins++;
    const center = { x: this.reelLeft() + 1.5 * this.step(), y: this.rowYs()[1] };
    if (out.kind === "ooatari") {
      const t = this.theme ?? OOATARI_THEMES[0]!;
      // 오아다리 → 11.mov + 테마별 프리미엄 연출(색·불꽃·분할·충격파·진동).
      this.reachStreak = 0;
      this.ooatariStreak++;
      this.playVideo("11");
      this.audio.ooatari();
      this.stampede.start(this.w, this.h); // 멧돼지 떼 질주 — 영상 끝날 때까지 계속
      this.boarSoundT = 0; // 발굽 사운드 즉시 재생(이후 루프)
      // 오아다리 3연속 이상 → 화면 중앙 원자폭탄급 폭발.
      if (this.ooatariStreak >= 3) {
        this.nuke.start(this.w, this.h);
        this.audio.nuke();
        this.fx.flash("#ffffff", 1);
        this.fx.shake(2.2, 1.3);
      }
      this.fx.setHypeTint(t.beam);
      this.fx.startFireworks(t.fwDur, t.fw);
      if (t.split) this.fx.startSplit(t.color, 0.8);
      this.fx.flash(t.color, 0.5);
      this.fx.shake(t.shake, 0.9);
      this.fx.burst(center.x, center.y, t.color, 180);
      this.fx.shockwave(center.x, center.y, t.color, this.w * 0.5);
      this.fx.shockwave(center.x, center.y, t.beam, this.w * 0.72);
      this.winLine = out.line;
      this.winGlow = 1;
      this.winChar = out.number;
      const payout = out.payout;
      this.held += payout;
      this.hud.ooatari++;
      this.fx.showCutin(`${t.titleJa} 大当たり!!`, `${t.titleKo} · ${out.round}R 確変 +${payout}`, t.color);
      this.hud.message = `${t.titleKo} 大当たり! ${out.round}R確変 (+${payout}) ${out.continued ? "[연장]" : ""}`;
    } else if (out.kind === "reach") {
      const t = this.theme ?? REACH_THEMES[0]!;
      // 2회 이상 연속 리치 → 12.mov 재생.
      this.reachStreak++;
      this.ooatariStreak = 0;
      if (this.reachStreak >= 2) this.playVideo("12");
      this.audio.reach();
      this.fx.setHypeTint(t.beam);
      this.fx.startFireworks(t.fwDur, t.fw);
      if (t.split) this.fx.startSplit(t.color, 0.7);
      this.fx.flash(t.color, 0.55);
      this.fx.shake(t.shake, 0.4);
      this.fx.burst(center.x, center.y, t.color, 70);
      this.fx.shockwave(center.x, center.y, t.color, this.w * 0.4);
      this.winLine = out.line;
      this.winGlow = 0.7;
      this.winChar = out.number;
      const payout = out.payout;
      this.held += payout;
      this.hud.reachCount++;
      this.fx.showCutin(`${t.titleJa} リーチ!`, `${t.titleKo} · ${out.round}R 通常 +${payout}`, t.color);
      this.hud.message = `${t.titleKo} 리치! ${out.round}R通常 (+${payout})`;
    } else if (out.kind === "reachlose") {
      // 리치 꽝(ハズレ) — 연출만, 당첨 없음.
      this.fx.setHypeTint(null);
      this.ooatariStreak = 0;
      this.winLine = null;
      this.winGlow = 0;
      this.fx.shake(0.4, 0.3);
      this.hud.message = "リーチ…ハズレ / 아깝다";
    } else {
      this.fx.setHypeTint(null);
      this.winLine = null;
      this.winGlow = 0;
      this.reachStreak = 0;
      this.ooatariStreak = 0;
      this.hud.message = "꽝";
    }
    this.audio.setMode(out.special ? "SUPER" : "NORMAL");
    this.hud.held = this.held;
    this.hud.mode = out.modeKey;
    this.hud.special = out.special;
    this.hud.windowSpin = out.jitanLeft;
    this.emit();
  }

  private targetsFor(row: number): [number, number, number] {
    const r = this.displayGrid[row]!;
    return [r[0]!, r[1]!, r[2]!];
  }

  private emit(): void {
    this.onHud({ ...this.hud });
  }

  // ---- 지오메트리 (릴 패널 — 가로폭 2배, 세로는 그대로) ----
  // step=세로(셀 높이) 기준, stepX=가로 열 간격(세로의 2배) → 모니터 폭 2배.
  private step(): number {
    return Math.min((this.w * 0.92) / 6, this.h * 0.17);
  }
  private stepX(): number {
    return this.step() * 2;
  }
  private reelLeft(): number {
    return (this.w - 3 * this.stepX()) / 2;
  }
  private rowYs(): [number, number, number] {
    const s = this.step();
    const t = this.h * 0.16; // 상단 전광판 아래로 내림
    return [t + s * 0.62, t + s * 1.62, t + s * 2.62];
  }
  private panelRect(): PanelRect {
    const s = this.step();
    const sx = this.stepX();
    const left = this.reelLeft();
    const rows = this.rowYs();
    const x = left - sx * 0.05;
    const y = rows[0] - s * 0.62;
    const w = sx * 3 + sx * 0.1;
    const h = rows[2] + s * 0.62 - y;
    return { x, y, w, h, r: 16 };
  }
  private holeMouthY(): number {
    const p = this.panelRect();
    const bottom = p.y + p.h;
    return bottom + (this.h - bottom) * 0.6;
  }

  private cellCenter(row: number, col: number): { x: number; y: number } {
    return { x: this.reelLeft() + (col + 0.5) * this.stepX(), y: this.rowYs()[row] };
  }

  draw(): void {
    const ctx = this.ctx;
    const off = this.fx.shakeOffset();
    ctx.save();
    ctx.clearRect(0, 0, this.w, this.h);
    drawBackground(ctx, this.w, this.h, this.time, this.controller.isDenpo() ? "ST" : "NORMAL");
    this.fx.drawParticles(ctx);

    ctx.translate(off.x, off.y);

    this.playfield.draw(ctx);

    // 당첨 캐릭터 3개를 좌·우에 표시 (다음 리치/오아다리까지 유지).
    if (this.winChar > 0) {
      const sz = this.h * 0.18;
      for (let i = 0; i < 3; i++) {
        const cy = this.h * (0.27 + i * 0.23);
        drawSymbol(ctx, this.winChar, this.w * 0.06, cy, sz, this.time, 0.35);
        drawSymbol(ctx, this.winChar, this.w * 0.94, cy, sz, this.time, 0.35);
      }
    }

    const step = this.step();
    const stepX = this.stepX();
    const left = this.reelLeft();
    const cellSize = step * 0.92;
    const rowY = this.rowYs();
    const pr = this.panelRect();

    // 릴 프레임.
    ctx.save();
    ctx.fillStyle = "rgba(2,16,28,0.6)";
    ctx.strokeStyle = this.controller.isDenpo() ? "rgba(255,120,120,0.75)" : "rgba(130,220,255,0.55)";
    ctx.lineWidth = 3;
    roundRect(ctx, pr.x, pr.y, pr.w, pr.h, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3행 릴.
    const glow = this.winGlow;
    for (let i = 0; i < 3; i++) {
      this.reels[i]!.draw(ctx, left, rowY[i]!, stepX, cellSize, this.time, glow * 0.5);
    }

    // 당첨 라인 하이라이트.
    if (this.winLine && this.winGlow > 0) {
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.4 * this.winGlow;
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = 6;
      ctx.shadowColor = "#ffcf3a";
      ctx.shadowBlur = 20;
      const cells = lineCells(this.winLine);
      const a = this.cellCenter(cells[0]![0], cells[0]![1]);
      const b = this.cellCenter(cells[2]![0], cells[2]![1]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // shake

    this.drawVideo(ctx);
    this.fx.drawBeams(ctx);
    this.stampede.draw(ctx); // 오아다리 멧돼지 떼(영상 위로 질주)
    if (!this.activeVideo) {
      if (this.cutinActive && this.theme?.oinori) this.drawMoon(ctx); // 달님 기도 연출
      this.drawCutinChar(ctx);
    }
    this.fx.drawOverlay(ctx);
    this.fx.drawFireworks(ctx); // 폭죽은 영상·패널 위 최상단
    this.nuke.draw(ctx); // 원자폭탄 폭발은 최상단
  }

  private drawVideo(ctx: CanvasRenderingContext2D): void {
    const vd = this.activeVideo;
    if (!vd || vd.readyState < 2 || vd.videoWidth === 0) return;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, this.w, this.h);
    const ar = vd.videoWidth / vd.videoHeight;
    const dh = this.h * 0.94;
    const dw = dh * ar;
    const x = (this.w - dw) / 2;
    const y = (this.h - dh) / 2;
    ctx.save();
    roundRect(ctx, x, y, dw, dh, 18);
    ctx.clip();
    ctx.drawImage(vd, x, y, dw, dh);
    ctx.restore();
    ctx.strokeStyle = "#ffcf3a";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#ffcf3a";
    ctx.shadowBlur = 26;
    roundRect(ctx, x, y, dw, dh, 18);
    ctx.stroke();
    ctx.restore();
  }

  private drawCutinChar(ctx: CanvasRenderingContext2D): void {
    if (!this.cutinActive || this.cutinSet.length === 0) return;
    const t = this.theme;
    // 프리미엄 예감·오이노리는 소녀 캐릭터(public/premium) 카드 사용. 미로드 시 기존 폴백.
    const premImg = t?.premium || t?.oinori ? getPremiumImage(this.cutinIdx) : null;
    const id = this.cutinSet[this.cutinIdx % this.cutinSet.length]!;
    const img = premImg ?? (this.omenBig ? getOmenImage(id) : null) ?? getCharImage(id);
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const usePremium = premImg !== null;
    const oinori = !!t?.oinori;
    const big = this.omenBig || usePremium;
    const slide = Math.min(1, this.cutinTimer / 0.18);
    const e = 1 - (1 - slide) ** 3;
    const ar = img.naturalWidth / img.naturalHeight;
    // 오이노리는 달 아래 중앙에 작게, 프리미엄은 크게, 그 외 기존.
    const maxH = this.h * (oinori ? 0.5 : big ? 0.86 : 0.78);
    const maxW = this.w * (oinori ? 0.3 : big ? 0.5 : 0.5);
    let hgt = maxH;
    let wid = hgt * ar;
    if (wid > maxW) {
      wid = maxW;
      hgt = wid / ar;
    }
    const fromRight = this.cutinIdx % 2 === 0;
    const centered = oinori || big;
    const targetX = centered ? (this.w - wid) / 2 : fromRight ? this.w * 0.52 : this.w * 0.48 - wid;
    const startX = fromRight ? this.w + 20 : -wid - 20;
    const x = oinori ? targetX : startX + (targetX - startX) * e;
    const bob = Math.sin(this.time * 12) * this.h * 0.012;
    const y = this.h - hgt - this.h * 0.02 + bob;
    const accent = t?.color ?? (big ? "#ffcf3a" : paletteFor(id).glow);
    ctx.save();
    ctx.globalAlpha = (big ? 0.85 : 0.45) + (big ? 0.15 : 0.55) * e;
    if (usePremium) {
      // 스튜디오(회색 배경) 이미지 → 둥근 프리미엄 카드(발광 테두리)로 감싸 자연스럽게.
      const pad = Math.min(wid, hgt) * 0.035;
      roundRect(ctx, x - pad, y - pad, wid + pad * 2, hgt + pad * 2, 22);
      ctx.shadowColor = accent;
      ctx.shadowBlur = 55;
      ctx.fillStyle = "rgba(8,16,28,0.55)";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      roundRect(ctx, x, y, wid, hgt, 18);
      ctx.clip();
      ctx.drawImage(img, x, y, wid, hgt);
      ctx.restore();
      ctx.lineWidth = Math.max(3, wid * 0.014);
      ctx.strokeStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 28;
      roundRect(ctx, x, y, wid, hgt, 18);
      ctx.stroke();
    } else {
      ctx.shadowColor = accent;
      ctx.shadowBlur = big ? 60 : 44;
      ctx.drawImage(img, x, y, wid, hgt);
    }
    ctx.restore();
  }

  /** 달님 기도(오이노리) — 상단 중앙에 빛나는 달. */
  private drawMoon(ctx: CanvasRenderingContext2D): void {
    const mx = this.w / 2;
    const my = this.h * 0.24;
    const r = this.h * 0.11;
    ctx.save();
    // 달무리(후광).
    const halo = ctx.createRadialGradient(mx, my, r * 0.4, mx, my, r * 2.6);
    halo.addColorStop(0, "rgba(255,247,214,0.5)");
    halo.addColorStop(0.4, "rgba(200,225,255,0.22)");
    halo.addColorStop(1, "rgba(200,225,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // 달 본체.
    const body = ctx.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.2, mx, my, r);
    body.addColorStop(0, "#fff8e0");
    body.addColorStop(1, "#e7d9a8");
    ctx.fillStyle = body;
    ctx.shadowColor = "rgba(255,240,200,0.9)";
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 크레이터.
    ctx.fillStyle = "rgba(200,185,140,0.5)";
    const craters: [number, number, number][] = [
      [-0.3, -0.2, 0.18],
      [0.25, 0.1, 0.13],
      [-0.1, 0.35, 0.1],
      [0.35, -0.3, 0.09],
    ];
    for (const [dx, dy, cr] of craters) {
      ctx.beginPath();
      ctx.arc(mx + dx * r, my + dy * r, cr * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
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
