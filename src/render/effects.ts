// 연출 이펙트 — 기포, 번쩍번쩍 플래시, 섬광 난사, 지진 진동, 화면 분할 전환, 컷인.
// 모두 코드로 생성하는 오리지널 비주얼. (PRD §5.4/§5.5 + 사용자 요구: 무지막지한 흥분)

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Beam {
  x: number;
  y: number;
  angle: number;
  len: number;
  width: number;
  life: number;
  maxLife: number;
  color: string;
}

const HYPE_COLORS = ["#fff4c2", "#ffcf3a", "#2ee6c6", "#9b6cff", "#ff7bd0", "#8fe9ff"];

export class Effects {
  private ambient: Particle[] = [];
  private burstP: Particle[] = [];
  private beams: Beam[] = [];
  private shakeMag = 0;
  private shakeT = 0;
  private flashA = 0;
  private flashColor = "#ffcf3a";

  /** 0..1 흥분도 — 플래시/섬광/진동을 자동 구동. */
  private hype = 0;
  private flashTimer = 0;
  private beamTimer = 0;

  /** 화면 분할 전환. */
  private splitT = 0;
  private splitDur = 0;
  private splitActive = false;
  private splitColor = "#ffcf3a";

  /** 불꽃놀이(연속 폭죽). */
  private shells: { x: number; y: number; vy: number; targetY: number; color: string }[] = [];
  private fireworksT = 0;
  private fwTimer = 0;

  cutin: { text: string; sub: string; color: string; a: number; t: number } | null = null;

  constructor(private w: number, private h: number) {
    for (let i = 0; i < 40; i++) this.ambient.push(this.newAmbient(true));
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  private newAmbient(spread: boolean): Particle {
    return {
      x: Math.random() * this.w,
      y: spread ? Math.random() * this.h : this.h + 10,
      vx: (Math.random() - 0.5) * 8,
      vy: -20 - Math.random() * 40,
      r: 1 + Math.random() * 4,
      life: 1,
      maxLife: 1,
      color: "rgba(180,230,255,0.5)",
    };
  }

  spawnTeaser(color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.ambient.push({
        x: Math.random() * this.w,
        y: this.h + Math.random() * 40,
        vx: (Math.random() - 0.5) * 20,
        vy: -60 - Math.random() * 80,
        r: 2 + Math.random() * 6,
        life: 1,
        maxLife: 1,
        color,
      });
    }
  }

  burst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 360;
      this.burstP.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 6,
        life: 1,
        maxLife: 0.6 + Math.random() * 0.9,
        color,
      });
    }
  }

  // ---- 불꽃놀이 (연속 형형색색 폭죽) ----
  private static FW_COLORS = ["#ff5fa2", "#ffcf3a", "#2ee6c6", "#9b6cff", "#ff7b4d", "#6cff9b", "#4db8ff", "#ff4d4d", "#ffffff"];

  /** duration초 동안 폭죽을 연속 발사한다. */
  startFireworks(duration: number): void {
    this.fireworksT = Math.max(this.fireworksT, duration);
  }

  private launchShell(): void {
    const color = Effects.FW_COLORS[(Math.random() * Effects.FW_COLORS.length) | 0]!;
    this.shells.push({
      x: this.w * (0.12 + Math.random() * 0.76),
      y: this.h,
      vy: -(this.h * 1.25 + Math.random() * this.h * 0.55),
      targetY: this.h * (0.1 + Math.random() * 0.4),
      color,
    });
  }

  private explode(x: number, y: number, color: string): void {
    const n = 34 + ((Math.random() * 16) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 110 + Math.random() * 280;
      const c = Math.random() < 0.55 ? color : Effects.FW_COLORS[(Math.random() * Effects.FW_COLORS.length) | 0]!;
      this.burstP.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 3.5,
        life: 1,
        maxLife: 0.8 + Math.random() * 0.9,
        color: c,
      });
    }
  }

  /** 섬광 1발 — 화면 임의 위치에서 번쩍 그어지는 빛줄기. */
  spawnBeam(color?: string): void {
    this.beams.push({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      angle: Math.random() * Math.PI,
      len: this.w * (0.5 + Math.random() * 0.7),
      width: 3 + Math.random() * 10,
      life: 0,
      maxLife: 0.18 + Math.random() * 0.22,
      color: color ?? HYPE_COLORS[(Math.random() * HYPE_COLORS.length) | 0]!,
    });
  }

  shake(mag: number, dur = 0.4): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  flash(color: string, strength = 0.9): void {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, strength);
  }

  /** 흥분도 설정 (0=평온, 1=극대). 번쩍번쩍+섬광+진동 자동. */
  setHype(v: number): void {
    this.hype = Math.max(0, Math.min(1, v));
  }

  /** 화면 분할 전환 시작 (리치→오아다리). */
  startSplit(color: string, dur = 0.9): void {
    this.splitActive = true;
    this.splitT = 0;
    this.splitDur = dur;
    this.splitColor = color;
  }

  isSplitting(): boolean {
    return this.splitActive;
  }

  showCutin(text: string, sub: string, color: string): void {
    this.cutin = { text, sub, color, a: 1, t: 0 };
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const m = this.shakeMag;
    return { x: (Math.random() - 0.5) * m * 26, y: (Math.random() - 0.5) * m * 26 };
  }

  update(dt: number): void {
    // 흥분 자동 구동: 번쩍번쩍 + 섬광 + 진동.
    if (this.hype > 0) {
      this.flashTimer -= dt;
      this.beamTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flash(HYPE_COLORS[(Math.random() * HYPE_COLORS.length) | 0]!, 0.18 + this.hype * 0.28);
        this.flashTimer = 0.32 - this.hype * 0.14; // 흥분↑ → 더 자주 번쩍
      }
      if (this.beamTimer <= 0) {
        const n = 1 + ((this.hype * 2) | 0);
        for (let i = 0; i < n; i++) this.spawnBeam();
        this.beamTimer = 0.22 - this.hype * 0.1;
      }
      this.shake(0.25 + this.hype * 0.75, 0.12);
    }

    for (const p of this.ambient) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx += Math.sin(p.y * 0.05) * 6 * dt;
      if (p.y < -20) Object.assign(p, this.newAmbient(false));
    }
    for (const p of this.burstP) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
    }
    this.burstP = this.burstP.filter((p) => p.life < p.maxLife);

    // 불꽃놀이: 연속 발사 + 상승 + 폭발.
    if (this.fireworksT > 0) {
      this.fireworksT -= dt;
      this.fwTimer -= dt;
      if (this.fwTimer <= 0) {
        this.fwTimer = 0.12 + Math.random() * 0.16;
        this.launchShell();
        if (Math.random() < 0.4) this.launchShell();
      }
    }
    for (const s of this.shells) s.y += s.vy * dt;
    for (const s of this.shells) if (s.y <= s.targetY) this.explode(s.x, s.y, s.color);
    this.shells = this.shells.filter((s) => s.y > s.targetY);

    for (const b of this.beams) b.life += dt;
    this.beams = this.beams.filter((b) => b.life < b.maxLife);

    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 2.2);

    if (this.splitActive) {
      this.splitT += dt;
      if (this.splitT >= this.splitDur) this.splitActive = false;
    }

    if (this.cutin) {
      this.cutin.t += dt;
      if (this.cutin.t > 1.3) this.cutin.a = Math.max(0, this.cutin.a - dt * 2.5);
      if (this.cutin.a <= 0) this.cutin = null;
    }
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.ambient) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.burstP) {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // 상승하는 폭죽 쉘.
    for (const s of this.shells) {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 섬광 — 씬 위, 컷인 아래에 그린다. */
  drawBeams(ctx: CanvasRenderingContext2D): void {
    if (this.beams.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.beams) {
      const k = 1 - b.life / b.maxLife;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.55;
      ctx.strokeStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = b.width;
      ctx.beginPath();
      const dx = Math.cos(b.angle) * b.len;
      const dy = Math.sin(b.angle) * b.len;
      ctx.moveTo(b.x - dx / 2, b.y - dy / 2);
      ctx.lineTo(b.x + dx / 2, b.y + dy / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOverlay(ctx: CanvasRenderingContext2D): void {
    // 화면 분할 전환 (쫙 갈라지며 새 테마).
    if (this.splitActive) {
      const p = Math.min(1, this.splitT / this.splitDur);
      const half = (this.h / 2) * this.easeInOut(p);
      // 위/아래 패널이 중앙 균열에서 벌어진다.
      ctx.save();
      ctx.fillStyle = "#020a12";
      ctx.fillRect(0, 0, this.w, this.h / 2 - half);
      ctx.fillRect(0, this.h / 2 + half, this.w, this.h / 2 - half + 1);
      // 균열 빛.
      const gap = Math.max(4, half * 2);
      const grad = ctx.createLinearGradient(0, this.h / 2 - gap / 2, 0, this.h / 2 + gap / 2);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, this.splitColor);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.fillRect(0, this.h / 2 - gap / 2, this.w, gap);
      // 균열 테두리 하이라이트.
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, this.h / 2 - half);
      ctx.lineTo(this.w, this.h / 2 - half);
      ctx.moveTo(0, this.h / 2 + half);
      ctx.lineTo(this.w, this.h / 2 + half);
      ctx.stroke();
      // 개방 순간 피크 플래시.
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.7;
      ctx.fillStyle = this.splitColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }

    if (this.cutin) {
      const c = this.cutin;
      ctx.save();
      ctx.globalAlpha = c.a * 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, this.h * 0.36, this.w, this.h * 0.28);
      ctx.globalAlpha = c.a;
      ctx.textAlign = "center";
      ctx.fillStyle = c.color;
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 24;
      ctx.font = `900 ${Math.floor(this.h * 0.11)}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.fillText(c.text, this.w / 2, this.h * 0.49);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `600 ${Math.floor(this.h * 0.035)}px system-ui, sans-serif`;
      ctx.fillText(c.sub, this.w / 2, this.h * 0.58);
      ctx.restore();
    }

    if (this.flashA > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  }

  private easeInOut(p: number): number {
    return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
  }
}
