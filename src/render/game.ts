// 게임 오케스트레이터 — 파친코 물리(구슬) + 결과 컨트롤러(ST식 모드) + 릴 연출.
import { Reel } from "./reel.js";
import { Effects } from "./effects.js";
import { drawBackground } from "./background.js";
import { paletteFor, getCharImage, getOmenImage } from "./symbols.js";
import { Playfield, type PanelRect } from "./playfield.js";
import { OutcomeController, lineCells, type Outcome, type LineSpec } from "./outcome.js";
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

type Phase = "idle" | "spinning" | "result" | "cooldown";

const REACH_CUTINS = [1, 3, 7, 8, 9, 10, 11];
const OMEN_CUTINS = [8, 9];

function rnd9(): number {
  return 1 + Math.floor(Math.random() * 9);
}

function shuffle3(): [number, number, number] {
  const a: number[] = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a as [number, number, number];
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private controller = new OutcomeController();
  private reels: [Reel, Reel, Reel];
  private fx: Effects;
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
  private denpoTimer = 0; // 電サポ(확변/시단) 자동회전 타이머

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

  // 컷인.
  private cutinActive = false;
  private cutinSet: number[] = REACH_CUTINS;
  private cutinIdx = 0;
  private cutinTimer = 0;
  private omenSwitched = false;
  private omenBig = false; // 오아다리 징조 — 8·9 큰 그림

  // 프리미엄 영상 (사용자 제공).
  private videos: Record<string, HTMLVideoElement> = {};
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
    vd.play().catch(() => {
      vd.muted = true;
      vd.play().catch(() => {});
    });
  }

  setSpinSpeed(v: number): void {
    this.spinSpeedMul = Math.max(0.3, Math.min(2.5, v));
  }
  setStopTime(v: number): void {
    this.stopTimeMul = Math.max(0.3, Math.min(2.5, v));
  }

  toggleAuto(): void {
    this.audio.start(); // 사용자 제스처 → 오디오 활성화
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

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.fx.resize(this.w, this.h);
    this.playfield.layout(this.w, this.h, this.panelRect(), this.holeMouthY());
  }

  // ---- 스핀 시작 (입상 보류 1개 소화) ----
  private startSpin(): void {
    const out = this.controller.next();
    this.outcome = out;
    // 꽝은 보류가 밀리거나 電サポ 중이면 빠르게, 리치/오아다리는 끝까지 연출.
    this.skip = (this.pendingSpins > 2 || out.special) && out.kind === "none";
    this.winGlow = 0;
    this.winLine = null;
    this.fx.setHype(0);
    this.cutinActive = false;
    this.omenSwitched = false;
    this.omenBig = false;

    this.buildDisplay(out);
    this.scheduleStops(out);

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
    if (out.kind !== "none" && out.line) {
      const cells = lineCells(out.line);
      for (const [r, c] of cells) g[r]![c] = out.number;
      for (const r of new Set(cells.map(([r]) => r))) off[r] = 0; // 정위치
    }
    this.displayGrid = g;
    this.offsets = off;
  }

  /** 정위치에서 조금 지나치거나(+) 미달(-)한 랜덤 오프셋. */
  private randOffset(): number {
    return (Math.random() < 0.5 ? -1 : 1) * (0.16 + Math.random() * 0.18);
  }

  private scheduleStops(out: Outcome): void {
    const order = shuffle3();
    const base = this.dur(0.45);
    const gap = (): number => this.dur(0.28 + Math.random() * 0.3);
    const delays: [number, number, number] = [0, 0, 0];
    let t = base;
    delays[order[0]] = t;
    t += gap();
    delays[order[1]] = t;
    t += gap();
    if (out.kind !== "none") t += this.dur(out.kind === "ooatari" ? 3.4 : 1.0); // 서스펜스(오아다리 징조 길게)
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
      this.pendingSpins = Math.min(99, this.pendingSpins + scored);
      this.hud.pending = this.pendingSpins;
      this.fx.flash("#2ee6c6", 0.22);
      this.audio.pocketIn();
      this.emit();
    }

    // 릴 회전 트리거. 電サポ(확변/시단)는 전동 서포트로 자동회전, 통상은 입상 보류로.
    if (this.phase === "idle") {
      if (this.controller.isDenpo()) {
        this.denpoTimer += dt;
        if (this.denpoTimer >= 0.7) {
          this.denpoTimer = 0;
          this.startSpin();
        }
      } else {
        this.denpoTimer = 0;
        if (this.pendingSpins > 0) {
          this.pendingSpins--;
          this.hud.pending = this.pendingSpins;
          this.startSpin();
        }
      }
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
      if (this.activeVideo.ended) this.activeVideo = null;
      else this.fx.setHype(0.6);
    }
  }

  private updateSuspense(): void {
    const out = this.outcome;
    if (!out || out.kind === "none" || this.pt <= this.firstStopT) return;
    const total = this.stopDelay[this.lastRow];
    const prog = Math.min(1, (this.pt - this.firstStopT) / Math.max(0.001, total - this.firstStopT));
    const baseHype = out.kind === "ooatari" ? 1 : 0.5;
    this.fx.setHype(baseHype * (0.5 + 0.5 * prog));
    if (!this.cutinActive) {
      this.cutinActive = true;
      this.cutinSet = REACH_CUTINS;
      this.cutinIdx = 0;
      this.cutinTimer = 0;
      this.omenSwitched = false;
      this.fx.showCutin(out.kind === "ooatari" ? "チャンス! 찬스!" : "リーチ予感 / 리치 예감", "", "#9fe9ff");
    }
    if (out.kind === "ooatari" && prog > 0.28 && !this.omenSwitched) {
      this.omenSwitched = true;
      this.omenBig = true; // 8·9 큰 그림으로, 더 길게
      this.cutinSet = OMEN_CUTINS;
      this.cutinIdx = 0;
      this.cutinTimer = 0;
      this.fx.showCutin("大当たり予告 / 오아다리 징조!!", "8·9 출현 — 홀수 정렬!", "#ffcf3a");
    }
  }

  private resolveResult(): void {
    const out = this.outcome!;
    this.hud.totalSpins++;
    const center = { x: this.reelLeft() + 1.5 * this.step(), y: this.rowYs()[1] };
    if (out.kind === "ooatari") {
      const pal = paletteFor(out.number);
      // 오아다리(확률↑ 슈퍼 맥락) → 11.mov 재생 + 팡파레/폭죽/환호/음성.
      this.reachStreak = 0;
      this.playVideo("11");
      this.audio.ooatari();
      this.fx.startFireworks(5); // 형형색색 폭죽 연속
      this.fx.startSplit("#ffcf3a", 0.95);
      this.fx.flash(pal.glow, 0.95);
      this.fx.shake(1.3, 0.9);
      this.fx.burst(center.x, center.y, pal.glow, 170);
      this.winLine = out.line;
      this.winGlow = 1;
      const payout = out.payout;
      this.held += payout;
      this.hud.ooatari++;
      this.fx.showCutin("大当たり / 오아다리!!", `${out.round}R 確変 +${payout}구슬`, pal.glow);
      this.hud.message = `大当たり(오아다리)! ${out.round}R確変 (+${payout}) ${out.continued ? "[연장]" : ""}`;
    } else if (out.kind === "reach") {
      const pal = paletteFor(out.number);
      // 2회 이상 연속 리치 → 12.mov 재생.
      this.reachStreak++;
      if (this.reachStreak >= 2) this.playVideo("12");
      this.audio.reach();
      this.fx.flash(pal.glow, 0.6);
      this.fx.shake(0.6, 0.4);
      this.fx.burst(center.x, center.y, pal.glow, 60);
      this.winLine = out.line;
      this.winGlow = 0.7;
      const payout = out.payout;
      this.held += payout;
      this.hud.reachCount++;
      this.fx.showCutin("リーチ / 리치!", `${out.round}R 通常 +${payout}구슬`, pal.glow);
      this.hud.message = `リーチ(리치)! ${out.round}R通常 (+${payout})`;
    } else {
      this.winLine = null;
      this.winGlow = 0;
      this.reachStreak = 0;
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
    if (!this.activeVideo) this.drawCutinChar(ctx);
    this.fx.drawOverlay(ctx);
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
    const id = this.cutinSet[this.cutinIdx % this.cutinSet.length]!;
    // 오아다리 징조에는 폴더 8.png/9.png(피규어) 사용.
    const img = (this.omenBig ? getOmenImage(id) : null) ?? getCharImage(id);
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const big = this.omenBig;
    const slide = Math.min(1, this.cutinTimer / 0.18);
    const e = 1 - (1 - slide) ** 3;
    // contain: 세로형(신부)·가로형(커플) 모두 비율 유지하며 큰 박스에 맞춤.
    const ar = img.naturalWidth / img.naturalHeight;
    const maxH = this.h * (big ? 0.9 : 0.78);
    const maxW = this.w * (big ? 0.56 : 0.5);
    let hgt = maxH;
    let wid = hgt * ar;
    if (wid > maxW) {
      wid = maxW;
      hgt = wid / ar;
    }
    const fromRight = this.cutinIdx % 2 === 0;
    const targetX = big ? (this.w - wid) / 2 : fromRight ? this.w * 0.52 : this.w * 0.48 - wid;
    const startX = fromRight ? this.w + 20 : -wid - 20;
    const x = startX + (targetX - startX) * e;
    const bob = Math.sin(this.time * 12) * this.h * 0.012;
    const y = this.h - hgt - this.h * 0.02 + bob;
    const pal = paletteFor(id);
    ctx.save();
    ctx.globalAlpha = (big ? 0.72 : 0.45) + (big ? 0.28 : 0.55) * e;
    ctx.shadowColor = big ? "#ffcf3a" : pal.glow;
    ctx.shadowBlur = big ? 60 : 44;
    ctx.drawImage(img, x, y, wid, hgt);
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
