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
  // 당첨 구슬이 플라스틱 박스에 쏟아지는 루프 사운드.
  private pourGain: GainNode | null = null;
  private pourSrc: AudioBufferSourceNode | null = null;
  private pouring = false;
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

  // ---- 릴 회전 사운드 — 경쾌한 음악(멜로디+베이스+하이햇), 아주 큰 볼륨. 회전 중 루프, 멈추면 정지. ----
  startReelSpin(): void {
    if (!this.ctx || !this.master || this.reelSpinning) return;
    this.reelSpinning = true;
    this.reelGain = this.ctx.createGain();
    this.reelGain.gain.value = 0.9; // 아주 큰 볼륨
    this.reelGain.connect(this.master);
    this.reelArpStep = 0;
    this.scheduleReelMusic();
  }

  // 경쾌한 멜로디(장조) + 통통 튀는 베이스 + 하이햇을 빠른 템포로 루프.
  private scheduleReelMusic(): void {
    if (!this.reelSpinning || !this.reelGain) return;
    const g = this.reelGain;
    const step = this.reelArpStep;
    // 밝은 장조 멜로디(C장조, 통통 튀게).
    const melody = [0, 4, 7, 12, 7, 4, 7, 12, 5, 9, 12, 16, 12, 9, 7, 9];
    const base = 523.25; // C5
    const f = base * 2 ** (melody[step % melody.length]! / 12);
    this.blip(f, 0.15, g, "square", 0, 0.6); // 멜로디
    this.blip(f * 2, 0.08, g, "triangle", 0, 0.26); // 옥타브 반짝
    // 베이스(다운비트 I–IV–V–IV).
    if (step % 2 === 0) {
      const bassPat = [0, 5, 7, 5];
      const bSemi = bassPat[(step / 2) % bassPat.length]!;
      this.blip(130.81 * 2 ** (bSemi / 12), 0.2, g, "sawtooth", 0, 0.5);
    }
    this.hat(step % 2 === 0 ? 0.16 : 0.1); // 하이햇
    this.reelArpStep++;
    window.setTimeout(() => this.scheduleReelMusic(), 125);
  }

  // 하이햇(짧은 고역 노이즈).
  private hat(vol: number): void {
    if (!this.ctx || !this.reelGain) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.04);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.reelGain);
    src.start(t);
    src.stop(t + 0.05);
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

  // ---- 당첨 구슬이 플라스틱 박스에 떨어져 쌓이는 대음량 사운드 ----
  /** 구슬이 플라스틱 박스에 쏟아지는 래틀 루프 시작(큰 볼륨). */
  startBallPour(): void {
    if (!this.ctx || !this.master || this.pouring) return;
    this.pouring = true;
    const bus = this.ctx.createGain();
    bus.gain.value = 1.5; // 대음량
    bus.connect(this.master);
    this.pourGain = bus;
    // 플라스틱 특유의 중고역 래틀 베드(밴드패스 노이즈 루프).
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.5);
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 0.8;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.55;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    src.start();
    this.pourSrc = src;
  }

  /** 구슬이 플라스틱에 '다다닥' 부딪혀 쌓이는 클랙. count 많을수록 겹쳐 크게. */
  ballDrop(count = 1): void {
    const bus = this.pourGain ?? this.master;
    if (!this.ctx || !bus) return;
    const n = Math.min(6, Math.max(1, count));
    for (let i = 0; i < n; i++) this.plasticTick(i * 0.012 + Math.random() * 0.01, bus);
  }

  // 플라스틱 타격 — 짧은 하이패스 노이즈 클릭 + 공명 핑.
  private plasticTick(delay: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.05);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.65, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + 0.06);
    const f = 1700 + Math.random() * 1500;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.32, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og);
    og.connect(dest);
    o.start(t);
    o.stop(t + 0.09);
  }

  /** 구슬 쏟아짐 루프 종료(짧은 페이드아웃). */
  stopBallPour(): void {
    if (!this.pouring) return;
    this.pouring = false;
    const ctx = this.ctx;
    const bus = this.pourGain;
    const src = this.pourSrc;
    this.pourGain = null;
    this.pourSrc = null;
    if (!ctx || !bus) return;
    const t = ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    if (src) {
      try {
        src.stop(t + 0.35);
      } catch {
        /* 이미 정지됨 */
      }
    }
    window.setTimeout(() => {
      try {
        bus.disconnect();
      } catch {
        /* 무시 */
      }
    }, 450);
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

  /** 원자폭탄급 폭발음 — 초저역 붐 + 광대역 크랙 + 긴 럼블. 아주 큰 볼륨. */
  nuke(): void {
    if (!this.ctx || !this.master) return;
    this.suddenLoud(2.8); // 마스터 볼륨 급상승(오래 유지)
    const t = this.ctx.currentTime;
    // 초기 크랙(광대역 노이즈, 매우 큼).
    this.noiseBurst(0, 0.35, 1.0);
    this.noiseBurst(0.02, 0.6, 0.8);
    // 저역 붐(사인 스윕 다운).
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(22, t + 1.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1.0, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 2.5);
    // 서브 썸프(쿵).
    const o2 = this.ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(70, t);
    o2.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.95, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    o2.connect(g2);
    g2.connect(this.master);
    o2.start(t);
    o2.stop(t + 1.4);
    // 긴 럼블(로우패스 노이즈).
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(140, t);
    lp.frequency.exponentialRampToValueAtTime(55, t + 3.2);
    const gr = this.ctx.createGain();
    gr.gain.setValueAtTime(0.0001, t);
    gr.gain.linearRampToValueAtTime(0.8, t + 0.25);
    gr.gain.exponentialRampToValueAtTime(0.001, t + 3.4);
    src.connect(lp);
    lp.connect(gr);
    gr.connect(this.master);
    src.start(t);
    src.stop(t + 3.5);
  }

  /** 멧돼지 떼 질주 — 낮은 발굽 우르릉(갤럽 트레몰로) + 간헐 꿀꿀/괴성. */
  stampede(dur = 3.0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur + 0.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 170;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.25);
    g.gain.setValueAtTime(0.6, t + dur - 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // 갤럽 발굽 리듬(트레몰로).
    const lfo = this.ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 11;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.38;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.3);
    lfo.start(t);
    lfo.stop(t + dur + 0.3);
    this.scheduleGrunts(dur);
  }

  private scheduleGrunts(remain: number): void {
    if (remain <= 0 || !this.ctx || !this.master) return;
    this.grunt();
    const gap = 0.16 + Math.random() * 0.22;
    window.setTimeout(() => this.scheduleGrunts(remain - gap), gap * 1000);
  }

  private grunt(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    const f0 = 90 + Math.random() * 170;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.12);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500 + Math.random() * 700;
    bp.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.17);
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
