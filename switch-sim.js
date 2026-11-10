/* switch-sim.js — Physics + layered canvas renderer + Hall/Rapid Trigger tracker for OpenAula */
const TRAVEL = 3.4;                // mm
const BASE_PX_PER_MM = 70;         // px/mm cho ảnh 1536px; ảnh khác nhân theo `s`

// Tọa độ theo pixel ảnh gốc:
// rects  = [x0,y0,x1,y1] các khối của stem (trụ, flange, thân) -> tách ra để di chuyển
// ytop   = mép trên housing (phần stem phía trên là "ngoài trời", phía dưới bị pha màu vỏ)
// ylip   = mép dưới nắp housing (stem bị che từ đây xuống)
// spring = [x0,y0,x1,y1] vùng lò xo nhìn thấy; L0 = chiều dài làm việc ước lượng (px)
// phys   = Fpre/Fbot (gf), mu (ma sát), bump (tactile, tùy chọn)
const SWITCHES = {
  clear:  { label:'Clear',  src:'1139.png', s:1,   ytop:468, ylip:795,
            rects:[[620,180,915,382],[505,382,1035,468],[510,468,1030,500],[595,500,940,685]],
            spring:[625,795,900,1045], L0:520,
            phys:{Fpre:30, Fbot:45, mu:2} },
  yellow: { label:'Yellow', src:'1140.png', s:1,   ytop:420, ylip:780,
            rects:[[633,145,903,376],[498,376,1038,420],[685,420,855,710]],
            spring:[605,795,920,1040], L0:520,
            phys:{Fpre:40, Fbot:60, mu:3} },
  blue:   { label:'Blue',   src:'1138.png', s:2/3, ytop:280, ylip:520,
            rects:[[422,96,602,250],[332,250,692,280],[340,280,684,375],[420,375,604,465]],
            spring:[405,530,615,695], L0:347,
            phys:{Fpre:45, Fbot:62, mu:3.5, bump:{A:18, x0:1.5, w:0.55}} },
};

// Cấu hình toạ độ chuẩn cho toàn bộ switch profile trong OpenAula (HERO68 / HERO84 / WIN68 HE MAX)
const SWITCH_SIM_BY_PROFILE = {
  clear:       { label:'Jade',               s:1,         ytop:468, ylip:795, rects:[[620,180,915,382],[505,382,1035,468],[510,468,1030,500],[595,500,940,685]], spring:[625,795,900,1045], L0:520, phys:{Fpre:30, Fbot:45, mu:2} },
  white:       { label:'Meteor Magnetic',    s:1,         ytop:446, ylip:795, rects:[[620,175,915,408],[500,408,1035,446],[510,446,1030,485],[585,485,950,670]], spring:[625,795,900,1045], L0:520, phys:{Fpre:35, Fbot:50, mu:2.2} },
  black:       { label:'Black King',         s:1,         ytop:420, ylip:780, rects:[[633,145,903,376],[498,376,1038,420],[685,420,855,710]],                 spring:[605,795,920,1040], L0:520, phys:{Fpre:40, Fbot:60, mu:3} },
  blue:        { label:'Dragon King',        s:1,         ytop:457, ylip:750, rects:[[635,188,905,408],[520,408,1016,457],[520,457,1016,555],[600,555,935,710]], spring:[615,760,915,1010], L0:500, phys:{Fpre:36, Fbot:52, mu:2.5} },
  'switch-76': { label:'HERO 68 XS Custom',  s:1,         ytop:457, ylip:750, rects:[[635,188,905,408],[520,408,1016,457],[520,457,1016,555],[600,555,935,710]], spring:[615,760,915,1010], L0:500, phys:{Fpre:36, Fbot:52, mu:2.5} },
  'switch-1':  { label:'Jade Pro',           s:1254/1536, ytop:362, ylip:645, rects:[[520,147,748,323],[412,323,858,362],[420,362,845,470],[510,470,755,565]],  spring:[505,650,750,860],  L0:425, phys:{Fpre:33, Fbot:50, mu:2.2} },
  'jade-pro':  { label:'Jade Pro',           s:1254/1536, ytop:362, ylip:645, rects:[[520,147,748,323],[412,323,858,362],[420,362,845,470],[510,470,755,565]],  spring:[505,650,750,860],  L0:425, phys:{Fpre:33, Fbot:50, mu:2.2} },
  'switch-14': { label:'Jade King',          s:1254/1536, ytop:362, ylip:645, rects:[[520,147,748,323],[412,323,858,362],[420,362,845,470],[510,470,755,565]],  spring:[505,650,750,860],  L0:425, phys:{Fpre:34, Fbot:50, mu:2.2} },
  'switch-3':  { label:'Uranus Gaming',      s:1254/1536, ytop:377, ylip:615, rects:[[507,159,742,344],[414,344,839,377],[420,377,835,465],[505,465,748,560]],  spring:[500,625,750,835],  L0:425, phys:{Fpre:35, Fbot:50, mu:2.3} },
  uranus:      { label:'Uranus Gaming',      s:1254/1536, ytop:377, ylip:615, rects:[[507,159,742,344],[414,344,839,377],[420,377,835,465],[505,465,748,560]],  spring:[500,625,750,835],  L0:425, phys:{Fpre:35, Fbot:50, mu:2.3} },
  'switch-4':  { label:'Wing Chun',          s:1254/1536, ytop:361, ylip:640, rects:[[514,116,740,323],[405,323,850,361],[415,361,840,465],[505,465,750,565]],  spring:[500,648,750,855],  L0:425, phys:{Fpre:32, Fbot:48, mu:2.1} },
  'wing-chun': { label:'Wing Chun',          s:1254/1536, ytop:361, ylip:640, rects:[[514,116,740,323],[405,323,850,361],[415,361,840,465],[505,465,750,565]],  spring:[500,648,750,855],  L0:425, phys:{Fpre:32, Fbot:48, mu:2.1} },
  'switch-37': { label:'Ash Wood',           s:2/3,       ytop:280, ylip:520, rects:[[422,96,602,250],[332,250,692,280],[455,280,570,475]],                   spring:[405,530,615,695],  L0:347, phys:{Fpre:34, Fbot:50, mu:2.4} },
  'switch-59': { label:'Lingyun',            s:2/3,       ytop:280, ylip:520, rects:[[422,96,602,250],[332,250,692,280],[340,280,684,375],[420,375,604,465]],  spring:[405,530,615,695],  L0:347, phys:{Fpre:32, Fbot:48, mu:2.2} },
  'switch-60': { label:'Snow God',           s:2/3,       ytop:280, ylip:520, rects:[[422,96,602,250],[332,250,692,280],[340,280,684,375],[420,375,604,465]],  spring:[405,530,615,695],  L0:347, phys:{Fpre:28, Fbot:45, mu:2.0} },
  'switch-61': { label:'Nick Magnetic',      s:2/3,       ytop:280, ylip:520, rects:[[422,96,602,250],[332,250,692,280],[340,280,684,375],[420,375,604,465]],  spring:[405,530,615,695],  L0:347, phys:{Fpre:35, Fbot:50, mu:2.3} },
  'switch-62': { label:'Ice Jade',           s:2/3,       ytop:280, ylip:520, rects:[[422,96,602,250],[332,250,692,280],[340,280,684,375],[420,375,604,465]],  spring:[405,530,615,695],  L0:347, phys:{Fpre:28, Fbot:45, mu:2.0} },
};

function resolveSwitchSimConfig(switchOption, naturalWidth) {
  const src = (switchOption && switchOption.front) || '';
  const byId = switchOption && SWITCH_SIM_BY_PROFILE[switchOption.id];
  if (byId) return { ...byId, label: switchOption.name || byId.label, src };
  if (naturalWidth === 1024) return { ...SWITCH_SIM_BY_PROFILE['switch-59'], label: (switchOption && switchOption.name) || 'Switch', src };
  if (naturalWidth === 1254) return { ...SWITCH_SIM_BY_PROFILE['switch-1'], label: (switchOption && switchOption.name) || 'Switch', src };
  return { ...SWITCH_SIM_BY_PROFILE.clear, label: (switchOption && switchOption.name) || 'Switch', src };
}

/* ======================= PHYSICS ======================= */
class SwitchSim {
  constructor(o = {}) {
    Object.assign(this, {
      T: TRAVEL, m: 3.0,             // hành trình (mm); khối lượng hiệu dụng (g)
      Fpre: 40, Fbot: 60, mu: 3, c: 0.012,
      eBot: 0.08, eTop: 0.15, bump: null,
      kf: 1500, cf: 1.0, Fmax: 120,  // "ngón tay": lò xo cứng kéo về target, chỉ đẩy xuống
      target: -1, x: 0, v: 0, rz: 0, rv: 0, acc: 0,
      wr: 2*Math.PI*200, zr: 0.04    // ripple lò xo ~200Hz
    }, o);
    this.k = (this.Fbot - this.Fpre) / this.T;
  }
  bumpF(x) {
    const b = this.bump; if (!b) return 0;
    const u = (x - b.x0) / b.w;
    if (u < 0 || u > 1.5) return 0;
    const s = t => t*t*(3 - 2*t);
    return b.A * (u < 1 ? s(u) : 1 - s((u - 1) / 0.5));
  }
  springF(x = this.x) { return this.Fpre + this.k*x + this.bumpF(x); }
  step(h) {
    const Ff = Math.min(Math.max(this.kf*(this.target - this.x) - this.cf*this.v, 0), this.Fmax);
    const fr = this.mu*Math.tanh(this.v/5) + this.c*this.v;
    this.v += (Ff - this.springF() - fr) / this.m * 9810 * h;
    this.x += this.v * h;
    if (this.x < 0) {                         // top-out
      const vi = -this.v; this.x = 0;
      this.v = vi > 20 ? vi*this.eTop : 0;
      this.rv += vi * 0.3;
    } else if (this.x > this.T) {             // bottom-out
      const vi = this.v; this.x = this.T;
      this.v = vi > 20 ? -vi*this.eBot : 0;
    }
    this.rv += (-this.wr*this.wr*this.rz - 2*this.zr*this.wr*this.rv) * h;
    this.rz += this.rv * h;
  }
  update(dt) {
    this.acc = Math.min(this.acc + dt, 0.05);
    const h = 1/4000;
    while (this.acc >= h) { this.step(h); this.acc -= h; }
  }
  press()   { this.target = this.T + 1; }
  release() { this.target = -1; }
  drag(mm)  { this.target = mm; }
}

/* ======================= HALL / RAPID TRIGGER STATE MACHINE ======================= */
class SwitchTriggerTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.triggered = false;
    this.peak = 0;
    this.trough = 0;
  }
  evaluate(xMm, cfg = {}) {
    const travel = Math.max(0.5, cfg.travelMm || TRAVEL);
    const dzTop = cfg.deadzoneEnabled ? Math.max(0, Math.min(1.0, cfg.topDeadzone || 0)) : 0;
    const dzBot = cfg.deadzoneEnabled ? Math.max(0, Math.min(1.0, cfg.bottomDeadzone || 0)) : 0;
    const effectiveMax = Math.max(dzTop + 0.1, travel - dzBot);
    const ap = Math.max(dzTop + 0.01, Math.min(effectiveMax, cfg.actuationMm || 1.2));
    const clampedX = Math.max(0, Math.min(effectiveMax, xMm));

    if (xMm <= dzTop + 0.002) {
      this.triggered = false;
      this.peak = clampedX;
      this.trough = clampedX;
      return false;
    }
    if (!cfg.rapidTrigger) {
      this.triggered = clampedX >= ap;
      this.peak = clampedX;
      this.trough = clampedX;
      return this.triggered;
    }
    const pressSens = Math.max(0.005, cfg.splitSensitivity ? (cfg.pressSensitivity ?? cfg.rapidSensitivity ?? 0.5) : (cfg.rapidSensitivity ?? 0.65));
    const releaseSens = Math.max(0.005, cfg.splitSensitivity ? (cfg.releaseSensitivity ?? cfg.rapidSensitivity ?? 0.55) : (cfg.rapidSensitivity ?? 0.65));

    if (!this.triggered) {
      if (clampedX < ap) {
        this.trough = clampedX;
        this.peak = clampedX;
        return false;
      }
      if (this.peak < ap) {
        this.triggered = true;
        this.peak = clampedX;
        this.trough = clampedX;
        return true;
      }
      this.trough = Math.min(this.trough, clampedX);
      if (clampedX - this.trough >= pressSens) {
        this.triggered = true;
        this.peak = clampedX;
      }
    } else {
      this.peak = Math.max(this.peak, clampedX);
      if (this.peak - clampedX >= releaseSens) {
        this.triggered = false;
        this.trough = clampedX;
      }
    }
    return this.triggered;
  }
}

/* ======================= RENDERER ======================= */
// Tách ảnh phẳng thành: nền (đã xóa stem) + stem + lò xo, rồi ghép lại theo vị trí x (mm).
class SwitchView {
  constructor(img, cfg, canvas) {
    this.cfg = cfg; this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.ppm = BASE_PX_PER_MM * cfg.s;
    this._build(img);
  }
  _canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  _build(img) {
    const { rects, ytop, ylip, spring } = this.cfg;
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    this.W = W; this.H = H;
    const c0 = this._canvas(W, H), x0 = c0.getContext('2d', { willReadFrequently: true });
    x0.drawImage(img, 0, 0);
    const im = x0.getImageData(0, 0, W, H).data;           // gốc (throw nếu canvas bị taint)

    // bbox để crop canvas
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (im[(y*W + x)*4 + 3] > 20) { if (x<bx0) bx0=x; if (x>=bx1) bx1=x+1; if (y<by0) by0=y; if (y>=by1) by1=y+1; }
    this.box = [bx0, by0, bx1 - bx0, by1 - by0];
    this.cv.width = this.box[2]; this.cv.height = this.box[3];

    // --- nền: xóa stem ---
    const bg = new ImageData(new Uint8ClampedArray(im), W, H), o = bg.data;
    const M = 10;
    for (const [rx0, ry0, rx1, ry1] of rects) {
      const xa = rx0 - M, xb = rx1 + M, ya = ry0 - 25, n = xb - xa;
      for (let y = Math.max(0, ya); y < ry1; y++) {
        if (y < ytop) { for (let x = xa; x < xb; x++) { const i = (y*W + x)*4; o[i]=o[i+1]=o[i+2]=o[i+3]=0; } continue; }
        const A = [0,0,0], B = [0,0,0];
        for (let k = 0; k < 5; k++) for (let ch = 0; ch < 3; ch++) {
          A[ch] += im[(y*W + xa - 6 + k)*4 + ch] / 5;
          B[ch] += im[(y*W + xb + 1 + k)*4 + ch] / 5;
        }
        for (let x = xa; x < xb; x++) {
          const t = (x - xa) / (n - 1), i = (y*W + x)*4;
          for (let ch = 0; ch < 3; ch++) o[i+ch] = A[ch]*(1-t) + B[ch]*t;
          o[i+3] = 255;
        }
      }
    }
    this.bg = this._canvas(W, H); this.bg.getContext('2d').putImageData(bg, 0, 0);

    // màu pha của vỏ (để stem chìm vào housing trông xuyên qua nhựa)
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    for (let y = ytop + 20; y < ylip - 20; y++) for (let x = 40; x < W - 40; x++) {
      const i = (y*W + x)*4; if (o[i+3] > 200) { sr += o[i]; sg += o[i+1]; sb += o[i+2]; cnt++; }
    }
    const tint = cnt > 0 ? [sr/cnt, sg/cnt, sb/cnt] : [180, 180, 180];

    // --- stem: texture thường + texture pha màu ---
    const sN = new ImageData(W, H), sT = new ImageData(W, H);
    let minY = H, maxY = 0;
    for (const [rx0, ry0, rx1, ry1] of rects) {
      for (let y = ry0 - 2; y < ry1; y++) for (let x = rx0 - 2; x < rx1 + 2; x++) {
        const i = (y*W + x)*4;
        for (let ch = 0; ch < 4; ch++) sN.data[i+ch] = sT.data[i+ch] = im[i+ch];
        for (let ch = 0; ch < 3; ch++) sT.data[i+ch] = im[i+ch]*0.8 + tint[ch]*0.2;
        if (y < minY) minY = y; if (y >= maxY) maxY = y + 1;
      }
    }
    this.stemN = this._canvas(W, H); this.stemN.getContext('2d').putImageData(sN, 0, 0);
    this.stemT = this._canvas(W, H); this.stemT.getContext('2d').putImageData(sT, 0, 0);
    this.stemY = [minY, maxY];

    // --- lò xo: tìm chu kỳ rồi dựng dải mở rộng (tile) ---
    const [sx0, sy0, sx1, sy1] = spring, sw = sx1 - sx0, sh = sy1 - sy0;
    const g = new Float32Array(sw*sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = ((sy0 + y)*W + sx0 + x)*4; g[y*sw + x] = 0.299*im[i] + 0.587*im[i+1] + 0.114*im[i+2];
    }
    let bestE = 1e9, P = Math.floor(sh*0.12);
    for (let p = Math.floor(sh*0.12); p < Math.floor(sh*0.45); p++) {
      let e = 0; const n = (sh - p)*sw;
      for (let k = 0; k < n; k++) e += Math.abs(g[k] - g[k + p*sw]);
      e /= n; if (e < bestE) { bestE = e; P = p; }
    }
    this.P = P;
    const dMax = TRAVEL * this.ppm, rMin = Math.max(0.3, 1 - dMax / this.cfg.L0);
    const nMax = Math.ceil(sh / rMin) + P;
    const ext = this._canvas(sw, nMax), ex = ext.getContext('2d');
    const S = this._canvas(sw, sh); S.getContext('2d').drawImage(img, sx0, sy0, sw, sh, 0, 0, sw, sh);
    ex.drawImage(S, 0, nMax - sh);
    for (let t = 1; nMax - sh - t*P > -P; t++) ex.drawImage(S, 0, 0, sw, P, 0, nMax - sh - t*P, sw, P);
    this.ext = ext; this.nMax = nMax; this.sdim = [sw, sh];
  }

  dispose() {
    for (const k of ['bg','stemN','stemT','ext']) { const c = this[k]; if (c) { c.width = c.height = 0; this[k] = null; } }
  }

  // xmm: vị trí stem (mm), ripple: lệch dài lò xo (mm)
  draw(xmm, ripple = 0) {
    const { ytop, ylip, spring, L0 } = this.cfg, [sx0, sy0] = spring, [sw, sh] = this.sdim;
    const d = Math.round(xmm * this.ppm);
    const ctx = this.ctx, [bx, by, bw, bh] = this.box;
    ctx.setTransform(1, 0, 0, 1, -bx, -by);
    ctx.clearRect(bx, by, bw, bh);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.bg, 0, 0);

    // lò xo nén: dải mở rộng co theo r, neo ở đáy
    const r = Math.max(0.3, 1 - (d - ripple*this.ppm) / L0);
    const n = Math.min(this.nMax, sh / r);
    ctx.drawImage(this.ext, 0, this.nMax - n, sw, n, sx0, sy0, sw, sh);

    // stem
    const [minY, maxY] = this.stemY, W = this.W;
    const seg = (cv, ya, yb) => {
      ya = Math.max(ya, minY); yb = Math.min(yb, maxY);
      if (yb > ya) ctx.drawImage(cv, 0, ya, W, yb - ya, 0, ya + d, W, yb - ya);
    };
    seg(this.stemN, minY, Math.min(ytop - d, ylip - d));        // còn ngoài trời
    seg(this.stemT, ytop - d, Math.min(ytop, ylip - d));        // vừa chìm vào housing -> pha màu
    seg(this.stemN, ytop, ylip - d);                            // thân trong housing (đã có sẵn tint)
  }
}

/* ======================= API ======================= */
function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    if (!String(src).startsWith('data:')) i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = () => rej(new Error('Cannot load ' + src));
    i.src = src;
  });
}

/**
 * createSwitch(canvas, key | cfg, opts)
 *   key   : tên trong SWITCHES / SWITCH_SIM_BY_PROFILE, hoặc truyền thẳng 1 cfg object
 *   opts  : { travel, phys, onFrame(sim) }
 * Trả về: { sim, view, press(), release(), drag(mm), setPercent(p), start(), stop(), destroy() }
 */
async function createSwitch(canvas, keyOrCfg, opts = {}) {
  const cfg = typeof keyOrCfg === 'string' ? (SWITCHES[keyOrCfg] || SWITCH_SIM_BY_PROFILE[keyOrCfg]) : keyOrCfg;
  if (!cfg) throw new Error('Unknown switch: ' + keyOrCfg);
  const T = opts.travel || TRAVEL;
  const img = await loadImage(cfg.src);
  const view = new SwitchView(img, cfg, canvas);
  const sim = new SwitchSim({ ...cfg.phys, ...(opts.phys || {}), T });
  let raf = 0, t0 = 0;

  const tick = dt => { sim.update(dt); view.draw(sim.x, sim.rz); if (opts.onFrame) opts.onFrame(sim); };
  const loop = t => { tick(Math.min((t - t0) / 1000, 0.05)); t0 = t; raf = requestAnimationFrame(loop); };

  view.draw(0, 0);
  return {
    sim, view, tick,
    press:   () => sim.press(),
    release: () => sim.release(),
    drag:    mm => sim.drag(mm <= 0 ? -1 : mm),
    setPercent: p => sim.drag(p <= 0 ? -1 : T * p),
    start() { if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(loop); } },
    stop()  { cancelAnimationFrame(raf); raf = 0; },
    destroy() { cancelAnimationFrame(raf); raf = 0; view.dispose(); }
  };
}

const SwitchKit = {
  TRAVEL,
  BASE_PX_PER_MM,
  SWITCHES,
  SWITCH_SIM_BY_PROFILE,
  SwitchSim,
  SwitchView,
  SwitchTriggerTracker,
  resolveSwitchSimConfig,
  createSwitch,
  loadImage
};
if (typeof window !== 'undefined') window.SwitchKit = SwitchKit;
if (typeof module !== 'undefined') module.exports = SwitchKit;
