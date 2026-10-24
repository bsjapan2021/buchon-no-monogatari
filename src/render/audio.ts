// 오디오 매니저 — Web Audio API 합성(BGM/효과음) + Web Speech 음성.
// 모두 코드로 생성하는 오리지널 사운드. 외부 음원 미사용.

type Mode = "NORMAL" | "SUPER";
type OscType = OscillatorType;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private ambGain: GainNode | null = null;
  private bgmStep = 0;
  // 릴 회전 사운드.
  private reelGain: GainNode | null = null;
  private reelOsc: OscillatorNode | null = null;
  private reelLfo: OscillatorNode | null = null;
  private reelSpinning = false;
  private reelArpStep = 0;
  private muted = false;
  private started = false;
  private mode: Mode = "NORMAL";

  /** 사용자 제스처 후 호출 (오디오 컨텍스트 생성/재개). */
  start(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    this.started = true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.3; // 배경음 3배
    this.bgmGain.connect(this.master);
    this.startBgm();
    this.startAmbience();
  }

  // ---- 파친코장 상시 앰비언스 (볼 캐스케이드 노이즈 + 겹치는 기계 징글) ----
  private startAmbience(): void {
    if (!this.ctx || !this.master) return;
    this.ambGain = this.ctx.createGain();
    this.ambGain.gain.value = 1.0; // 파친코장 앰비언스 크게
    this.ambGain.connect(this.master);
    // 볼 캐스케이드: 루핑 노이즈 베드.
    const bed = this.ctx.createBufferSource();
    bed.buffer = this.noiseBuffer(2);
    bed.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    bp.Q.value = 0.6;
    const bedGain = this.ctx.createGain();
    bedGain.gain.value = 0.34;
    bed.connect(bp);
    bp.connect(bedGain);
    bedGain.connect(this.ambGain);
    bed.start();
    this.scheduleJingle();
  }

  private scheduleJingle(): void {
    if (!this.ctx || !this.ambGain) return;
    this.jingle();
    window.setTimeout(() => this.scheduleJingle(), 200 + Math.random() * 600);
  }

  private jingle(): void {
    if (!this.ctx || !this.ambGain) return;
    const base = 400 + Math.random() * 900;
    const n = 2 + ((Math.random() * 2) | 0);
    const type: OscType = Math.random() < 0.5 ? "square" : "triangle";
    let dest: AudioNode = this.ambGain;
    if (typeof this.ctx.createStereoPanner === "function") {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.85;
      pan.connect(this.ambGain);
      dest = pan;
    }
    const steps = [0, 2, 4, 7, 9];
    for (let i = 0; i < n; i++) {
      const f = base * 2 ** (steps[i % steps.length]! / 12);
      this.blip(f, 0.14, dest, type, i * 0.1, 0.2);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMode(mode: Mode): void {
    this.mode = mode;
  }

  // ---- BGM: 간단한 아르페지오 루프 ----
  private startBgm(): void {
    const loop = (): void => {
      if (!this.ctx) return;
      this.playBgmStep();
      this.bgmStep++;
      const stepDur = this.mode === "SUPER" ? 0.17 : 0.26;
      window.setTimeout(loop, stepDur * 1000);
    };
    loop();
  }

  private playBgmStep(): void {
    if (!this.ctx || !this.bgmGain) return;
    const normal = [0, 3, 5, 7, 10, 12, 10, 7];
    const sup = [0, 4, 7, 11, 12, 14, 12, 7];
    const scale = this.mode === "SUPER" ? sup : normal;
    const base = this.mode === "SUPER" ? 330 : 262;
    const semi = scale[this.bgmStep % scale.length]!;
    const f = base * 2 ** (semi / 12);
    this.blip(f, 0.22, this.bgmGain, this.mode === "SUPER" ? "sawtooth" : "triangle", 0, 0.2);
    if (this.bgmStep % 2 === 0) this.blip(f / 2, 0.3, this.bgmGain, "sine", 0, 0.22);
  }

  private blip(freq: number, dur: number, dest: AudioNode, type: OscType, delay: number, vol: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---- 효과음 ----
  /** 구슬 입상음 — 밝은 금속성 '플링'(한 개마다). delay로 겹침 방지. */
  pocketIn(delay = 0): void {
    if (!this.master) return;
    this.blip(1320, 0.09, this.master, "triangle", delay, 0.3);
    this.blip(1980, 0.07, this.master, "sine", delay + 0.03, 0.22);
  }

  // ---- 릴 회전 사운드 (전자 휠 + 빠른 아르페지오, 회전 중 루프) ----
  startReelSpin(): void {
    if (!this.ctx || !this.master || this.reelSpinning) return;
    this.reelSpinning = true;
    this.reelGain = this.ctx.createGain();
    this.reelGain.gain.value = 0.16;
    this.reelGain.connect(this.master);
    // 전자 휠: 톱니 + 빠른 비브라토.
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 200;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 20;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 46;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const oscGain = this.ctx.createGain();
    oscGain.gain.value = 0.4;
    osc.connect(oscGain);
    oscGain.connect(this.reelGain);
    osc.start();
    lfo.start();
    this.reelOsc = osc;
    this.reelLfo = lfo;
    this.scheduleReelArp();
  }

  private scheduleReelArp(): void {
    if (!this.reelSpinning || !this.reelGain) return;
    const notes = [0, 4, 7, 12, 7, 4];
    const f = 440 * 2 ** (notes[this.reelArpStep % notes.length]! / 12);
    this.blip(f, 0.1, this.reelGain, "square", 0, 0.3);
    this.reelArpStep++;
    window.setTimeout(() => this.scheduleReelArp(), 110);
  }

  stopReelSpin(): void {
    if (!this.reelSpinning) return;
    this.reelSpinning = false;
    try {
      this.reelOsc?.stop();
      this.reelLfo?.stop();
    } catch {
      /* 이미 정지 */
    }
    this.reelOsc = null;
    this.reelLfo = null;
    const g = this.reelGain;
    if (g && this.ctx) {
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.08);
      window.setTimeout(() => g.disconnect(), 160);
    }
    this.reelGain = null;
  }

  /** 릴 카드 정지음 — 독특한 '착' (릴마다 피치 차등). */
  reelStop(index: number): void {
    if (!this.master) return;
    this.noiseBurst(0, 0.05, 0.22);
    const base = 540 - index * 90;
    this.blip(base, 0.13, this.master, "square", 0, 0.3);
    this.blip(base * 0.5, 0.1, this.master, "triangle", 0.02, 0.2);
  }

  reach(): void {
    if (!this.master) return;
    [660, 880, 1100].forEach((f, i) => this.blip(f, 0.26, this.master!, "triangle", i * 0.08, 0.3));
    this.speak("리이이치!");
  }

  ooatari(): void {
    if (!this.master) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.blip(f, 0.42, this.master!, "sawtooth", i * 0.09, 0.32));
    this.fireworks();
    this.cheer();
    this.speak("おおあたり！！", "ja-JP"); // 오아다리 → 일본어 음성
  }

  /** 리치 예감 — 번개(천둥) + 전기 감전음 + 순간 볼륨 부스트(깜짝!). */
  reachZap(): void {
    if (!this.ctx || !this.master) return;
    this.suddenLoud(1.0); // 순간적으로 볼륨을 키워 놀라게
    this.thunder();
    this.zap();
  }

  /** 마스터 볼륨을 순간 급상승 → 서서히 원복(깜짝 효과). */
  private suddenLoud(dur: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    const base = 0.5;
    g.cancelScheduledValues(t);
    g.setValueAtTime(base, t);
    g.linearRampToValueAtTime(1.0, t + 0.015); // 2배로 급상승
    g.linearRampToValueAtTime(base, t + dur); // 서서히 원복
  }

  /** 천둥/번개 — 날카로운 크랙 + 저역 우르릉. */
  private thunder(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.6);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 1.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.95, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 1.6);
    this.noiseBurst(0, 0.12, 0.9); // 초기 번개 크랙
  }

  /** 전기 감전음 — 톱니 하강 + 고속 트레몰로(지글지글) + 지지직 크래클. */
  private zap(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.5);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200;
    bp.Q.value = 7;
    const lfo = this.ctx.createOscillator(); // 지글거림(트레몰로)
    lfo.type = "square";
    lfo.frequency.value = 58;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    osc.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.55);
    lfo.start(t);
    lfo.stop(t + 0.55);
    for (let i = 0; i < 5; i++) this.noiseBurst(0.03 + i * 0.07, 0.04, 0.42); // 지지직
  }

  fireworks(): void {
    for (let i = 0; i < 6; i++) this.noiseBurst(0.1 + i * 0.17, 0.12, 0.3);
  }

  cheer(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.4);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.4);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 1.4);
  }

  private noiseBurst(delay: number, dur: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  private noiseBuffer(dur: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private speak(text: string, lang = "ko-KR", cancel = true): void {
    if (this.muted || typeof speechSynthesis === "undefined") return;
    try {
      if (cancel) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.pitch = 1.5;
      u.rate = 0.95;
      u.volume = 1;
      speechSynthesis.speak(u);
    } catch {
      /* 음성 미지원 무시 */
    }
  }
}
