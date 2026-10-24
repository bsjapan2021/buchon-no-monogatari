// 오아다리 연출 — 실사 일러스트 멧돼지 떼(사용자 제공 이미지)가 오른쪽→왼쪽으로 질주.
// 이미지 상단 하늘은 잘라내고 하단 밴드로 스크롤(단일 통과). 밴드 상/하단은 부드럽게 블렌딩.
import warthogsUrl from "../assets/boars/warthogs.png";

const IMG = new Image();
IMG.src = warthogsUrl;

// 원본 1916×821 — 하늘/먼 배경 상단을 제외한 멧돼지+풀밭 밴드.
const SRC_X = 0;
const SRC_Y = 150;
const SRC_W = 1916;
const SRC_H = 640;
const ASPECT = SRC_W / SRC_H;

export class Stampede {
  private w = 0;
  private h = 0;
  private t = 0;
  private elapsed = 0;
  private readonly dur = 2.6;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  isActive(): boolean {
    return this.t > 0;
  }

  /** 멧돼지 떼 질주 시작. 이미 질주 중이면 재시작하지 않는다(연타 리셋 방지). */
  start(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (this.t > 0) return;
    this.t = this.dur;
    this.elapsed = 0;
  }

  update(dt: number): void {
    if (this.t > 0) {
      this.t -= dt;
      this.elapsed += dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.t <= 0 || !IMG.complete || IMG.naturalWidth === 0) return;
    const p = Math.min(1, this.elapsed / this.dur);
    // 밴드(멧돼지가 너무 크지 않게 높이 제한, 화면 하단 쪽).
    const dh = this.h * 0.44;
    const dw = dh * ASPECT;
    const bandTop = this.h * 0.47;
    // 우→좌 단일 통과: 완전히 들어왔다가 완전히 빠져나간다.
    const x = this.w - (this.w + dw) * p;
    // 등장/퇴장 페이드.
    const fin = Math.min(1, p / 0.1);
    const fout = Math.min(1, (1 - p) / 0.12);
    const alpha = Math.max(0, Math.min(fin, fout));

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop, this.w, dh);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.drawImage(IMG, SRC_X, SRC_Y, SRC_W, SRC_H, x, bandTop, dw, dh);

    // 밴드 상/하단 가장자리를 투명하게 녹여 게임/영상 위에 자연스럽게 얹히게.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-out";
    const fadeH = dh * 0.2;
    const gt = ctx.createLinearGradient(0, bandTop, 0, bandTop + fadeH);
    gt.addColorStop(0, "rgba(0,0,0,1)");
    gt.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gt;
    ctx.fillRect(0, bandTop, this.w, fadeH);
    const gb = ctx.createLinearGradient(0, bandTop + dh - fadeH, 0, bandTop + dh);
    gb.addColorStop(0, "rgba(0,0,0,0)");
    gb.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = gb;
    ctx.fillRect(0, bandTop + dh - fadeH, this.w, fadeH);
    ctx.restore();
  }
}
