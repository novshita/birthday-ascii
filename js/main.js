(function () {
  "use strict";
  const C = window.CONFIG, A = window.ART;
  const { TAU, clamp, smoothstep, easeOut, lerp3, mul, hash3, rnd, BUCKETS, LEVELS, DIGITS } = A;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const Q = new URLSearchParams(location.search);          // debug: ?scene=1&t=4  (&blown for the cake)

  // ============================================================ grid + canvas
  // Two kinds of grid: NATIVE (big characters, 1 cell = 1 character on screen) for the countdown, and
  // HI (180 rows of tiny characters, scaled down to the window) for the pictures, like a printed ASCII poster.
  const NATIVE = { px: 12, rows: 0 }, HI = { px: 8, rows: 180 };
  const FPS = 30, BG = "#04030a";
  const probe = document.createElement("canvas").getContext("2d");
  const masks = new Map();                                 // glyph bitmaps, rebuilt when the character size changes
  let grid = null, FONT = "", CW = 1, CH = 1, ASPECT = 0.5;

  const view = document.getElementById("view"), ctx = view.getContext("2d");
  const btn = document.getElementById("next"), sr = document.getElementById("sr");
  const ui = { title: document.getElementById("title"), cap: document.getElementById("cap"),
    notes: document.getElementById("notes") };
  const ascii = document.createElement("canvas"), actx = ascii.getContext("2d");
  const glows = [2, 4, 8].map((s) => ({ s, el: document.createElement("canvas") }));
  let COLS, ROWS, N, W, H, S, lum, rgb, fx, img, px32, stars;

  function layout() {
    FONT = `${grid.px}px Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace`;
    probe.font = FONT;
    CW = Math.max(1, Math.round(probe.measureText("M").width)); CH = Math.round(grid.px * 1.15);
    ASPECT = CW / CH;                                      // a cell is about half as wide as it is tall
    if (grid.rows) {
      ROWS = grid.rows;
      COLS = clamp(Math.round(ROWS * CH / CW * innerWidth / Math.max(1, innerHeight)), 80, 640);
    } else {
      ROWS = Math.max(40, Math.floor(innerHeight / CH)); COLS = Math.max(36, Math.floor(innerWidth / CW));
    }
    N = COLS * ROWS; W = COLS * CW; H = ROWS * CH;
    S = Math.min(ROWS / 72, (COLS * ASPECT) / 88);         // countdown art is drawn in a 72-row space, scaled to fit
    view.width = ascii.width = W; view.height = ascii.height = H;
    for (const g of glows) { g.el.width = Math.ceil(W / g.s); g.el.height = Math.ceil(H / g.s); }
    lum = new Float32Array(N); rgb = new Float32Array(N * 3); fx = new Int32Array(N);
    img = actx.createImageData(W, H); px32 = new Uint32Array(img.data.buffer);
    stars = [];
    const density = grid.rows ? 1.2 : 2;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const h = hash3(r, c, 5);
      if (h % 1000 < density * 10) stars.push({ i: r * COLS + c, p: (h >>> 8) % 628 / 100, warm: h % 3 === 0 });
    }
    masks.clear();
  }
  function useGrid(g) { if (g !== grid) { grid = g; layout(); } }
  useGrid(NATIVE);

  // virtual (countdown) space <-> cells. Virtual x is centred, virtual y = 36 is the middle of the screen.
  const cOf = (x) => x * S / ASPECT + COLS / 2 - 0.5;
  const rOf = (y) => (y - 36) * S + ROWS / 2 - 0.5;
  const vX = (c) => (c + 0.5 - COLS / 2) * ASPECT / S;
  const vY = (r) => (r + 0.5 - ROWS / 2) / S + 36;
  const rowAt = (y) => Math.round(rOf(y));
  function paint(x0, y0, x1, y1, fn) {                     // call fn for each cell inside a virtual box
    const c0 = Math.max(0, Math.floor(cOf(x0))), c1 = Math.min(COLS - 1, Math.ceil(cOf(x1)));
    const r0 = Math.max(0, Math.floor(rOf(y0))), r1 = Math.min(ROWS - 1, Math.ceil(rOf(y1)));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * COLS + c, vX(c), vY(r), r, c);
  }
  function set(i, l, col) {
    lum[i] = l; fx[i] = 0;
    const j = i * 3; rgb[j] = col[0]; rgb[j + 1] = col[1]; rgb[j + 2] = col[2];
  }
  function glyph(r, c, ch, l, col) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    const i = r * COLS + c, k = (0.45 + 0.75 * l) * 1.6 / 1.1;     // divide out the renderer's brightness boost: colours stay true
    set(i, l, [col[0] / k, col[1] / k, col[2] / k]); fx[i] = ch.codePointAt(0);
  }
  function setT(i, l, col) { const k = (0.45 + 0.75 * l) * 1.6 / 1.1; set(i, l, [col[0] / k, col[1] / k, col[2] / k]); }
  function text(r, c, str, l, col) { for (let k = 0; k < str.length; k++) if (str[k] !== " ") glyph(r, c + k, str[k], l, col); }
  const textC = (r, str, l, col) => text(r, Math.round((COLS - str.length) / 2), str, l, col);

  // ============================================================ renderer (cells -> characters -> glow)
  const CHARS = BUCKETS.join(""), START = [], COUNT = BUCKETS.map((b) => b.length);
  BUCKETS.reduce((s, b, k) => { START[k] = s; return s + b.length; }, 0);
  const BUCKET_CODES = [...CHARS].map((ch) => ch.codePointAt(0));
  function mask(code) {
    let m = masks.get(code);
    if (!m) {
      const g = document.createElement("canvas"); g.width = CW; g.height = CH;
      const gx = g.getContext("2d");
      gx.font = FONT; gx.textBaseline = "top"; gx.fillStyle = "#fff"; gx.fillText(String.fromCodePoint(code), 0, 0);
      const d = gx.getImageData(0, 0, CW, CH).data;
      m = new Uint8Array(CW * CH);
      for (let k = 0; k < m.length; k++) m[k] = d[k * 4 + 3];
      masks.set(code, m);
    }
    return m;
  }
  const GLOW = 0.7;

  const overlays = [];                                     // scenes queue text to draw on the glowing canvas (see letter scene)
  let curFade = 1;
  function draw(frame) {
    px32.fill(0);
    const fidx = Math.floor(frame / 3);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c, L = lum[i];
      if (L < LEVELS[0] && !fx[i]) continue;
      let m;
      if (fx[i]) m = mask(fx[i]);
      else {
        let level = 0;
        while (level < LEVELS.length && L >= LEVELS[level]) level++;
        if (level === 0) continue;
        m = mask(BUCKET_CODES[START[level] + hash3(r, c, fidx) % COUNT[level]]);
      }
      const k = (0.45 + 0.75 * L) * 1.6, j = i * 3;
      const R = Math.min(255, 255 * rgb[j] * k) | 0, G = Math.min(255, 255 * rgb[j + 1] * k) | 0, B = Math.min(255, 255 * rgb[j + 2] * k) | 0;
      let o0 = r * CH * W + c * CW, mi = 0;
      for (let y = 0; y < CH; y++, o0 += W) {
        for (let x = 0; x < CW; x++, mi++) {
          const v = m[mi];
          if (v) px32[o0 + x] = (v << 24) | (B << 16) | (G << 8) | R;
        }
      }
    }
    actx.putImageData(img, 0, 0);
    if (overlays.length) {                                 // text is drawn in screen pixels, then glows with everything else
      const k = Math.min(innerWidth / W, innerHeight / H), ox = (innerWidth - W * k) / 2, oy = (innerHeight - H * k) / 2;
      actx.save(); actx.translate(-ox / k, -oy / k); actx.scale(1 / k, 1 / k); actx.globalAlpha = curFade;
      for (const cb of overlays) cb(actx);
      actx.restore(); overlays.length = 0;
    }
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(ascii, 0, 0);
    let src = ascii;                                       // glow: shrink step by step, then stretch back on top
    for (const g of glows) {
      const gx = g.el.getContext("2d");
      gx.imageSmoothingEnabled = true; gx.clearRect(0, 0, g.el.width, g.el.height);
      gx.drawImage(src, 0, 0, g.el.width, g.el.height); src = g.el;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = GLOW; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, W, H);
    ctx.restore();
  }

  // ============================================================ shared helpers
  const GOLD = [1.0, 0.78, 0.32], CREAM = [1.0, 0.94, 0.8], ROSE = [1.0, 0.55, 0.7];
  const FLICK = reduce ? 0 : 1;

  function backdrop(t) {                                   // night sky: twinkling stars
    lum.fill(0); fx.fill(0);
    for (const s of stars) {
      lum[s.i] = 0.07 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.3 * FLICK + s.p));
      const j = s.i * 3;
      if (s.warm) { rgb[j] = 1; rgb[j + 1] = 0.85; rgb[j + 2] = 0.6; } else { rgb[j] = 0.65; rgb[j + 1] = 0.72; rgb[j + 2] = 1; }
    }
  }
  function fireflies(t, a) {                               // slow golden dots drifting upward
    if (a <= 0) return;
    const off = Math.floor(t * 4), rate = grid.rows ? 1 : 2;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (lum[i] < 0.1 && hash3(c, r + off, 77) % 1000 < rate) set(i, 0.5 * a, [1, 0.8, 0.4]);
    }
  }
  function confetti(dt, cx, cy, count, seed) {             // burst of coloured bits that arc and fall
    const marks = "*+o~#x", cols = [GOLD, ROSE, [0.55, 0.8, 1], [0.7, 0.55, 1], [0.5, 0.9, 0.6]];
    for (let k = 0; k < count; k++) {
      const vx = (rnd(k, seed) - 0.5) * 70, vy = -(14 + rnd(k, seed + 1) * 40);
      const x = cx + vx * dt * (1 - 0.15 * dt), y = cy + vy * dt + 0.5 * 38 * dt * dt;
      const life = 3.4 + rnd(k, seed + 2);
      if (dt < 0 || dt > life) continue;
      const a = 1 - smoothstep(life - 0.9, life, dt);
      glyph(Math.round(rOf(y)), Math.round(cOf(x)), marks[k % marks.length], 0.85 * a, cols[k % cols.length]);
    }
  }
  const say = (s) => { sr.textContent = s; };

  // text that sits on top of the canvas (crisp and readable at any window size)
  function setTitle(s) { if (ui.title.textContent !== s) ui.title.textContent = s; ui.title.classList.toggle("on", !!s); }
  function setCap(s) { if (ui.cap.textContent !== s) ui.cap.textContent = s; ui.cap.classList.toggle("on", !!s); }
  function clearUI() {
    setTitle(""); setCap(""); ui.cap.style.bottom = ui.cap.style.top = ""; ui.notes.replaceChildren();
  }
  function typedSpans(el, full, typed, cursor) {           // typed text + invisible rest, so the layout never jumps
    if (!el.firstChild) {
      el.append(document.createElement("span"), document.createElement("span"));
      el.lastChild.className = "ghost";
    }
    const n = clamp(typed, 0, full.length);
    el.firstChild.textContent = full.slice(0, n) + (cursor ? "_" : "");
    el.lastChild.textContent = full.slice(n);
  }
  const toPx = (col, row) => {                             // canvas cell -> CSS pixels
    const k = Math.min(innerWidth / W, innerHeight / H);
    return { x: (innerWidth - W * k) / 2 + col * CW * k, y: (innerHeight - H * k) / 2 + row * CH * k, k };
  };

  // ============================================================ coloured pictures (art/*.jpg via js/pics.js)
  const PIC = {};
  for (const [k, p] of Object.entries(window.PICS || {})) {
    const bin = atob(p.rgba), px = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) px[i] = bin.charCodeAt(i);
    PIC[k] = { cols: p.cols, rows: p.rows, px, marks: p.marks || [] };
  }
  const SC = new Float32Array(4);
  function tap(p, u, v, wgt) {                             // add one smooth (bilinear) sample, alpha-weighted
    const x = u - 0.5, y = v - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx_ = x - x0, fy_ = y - y0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const a = x0 + dx, b = y0 + dy;
      if (a < 0 || b < 0 || a >= p.cols || b >= p.rows) continue;
      const j = (b * p.cols + a) * 4, al = p.px[j + 3] / 255 * wgt * (dx ? fx_ : 1 - fx_) * (dy ? fy_ : 1 - fy_);
      SC[0] += p.px[j] * al; SC[1] += p.px[j + 1] * al; SC[2] += p.px[j + 2] * al; SC[3] += al;
    }
  }
  function sampleC(p, u, v, d) {                           // returns alpha; colour (0..1) is left in SC[0..2]
    SC.fill(0);
    if (d > 0) { tap(p, u - d, v - d, 0.25); tap(p, u + d, v - d, 0.25); tap(p, u - d, v + d, 0.25); tap(p, u + d, v + d, 0.25); }
    else tap(p, u, v, 1);
    const a = SC[3];
    if (a > 0.001) { SC[0] /= a * 255; SC[1] /= a * 255; SC[2] /= a * 255; }
    return a;
  }
  const picX = () => 0.5 / ASPECT;                         // pictures are built for 1:2 cells; stretch if ours differ
  const picW = (p, f) => p.cols * f * picX();
  const fitPic = (p, padRows, padCols, maxF) => Math.min((ROWS - padRows) / p.rows, (COLS - padCols) / (p.cols * picX()), maxF);
  // Paint a picture: f = screen cells per picture row, cx = centre column, top = first row.
  // shade(i, alpha, colour, u 0..1, v 0..1, row, col). shift(v) sways rows sideways.
  function drawPic(p, f, cx, top, shade, shift) {
    const fh = f * picX(), w = p.cols * fh, h = p.rows * f, d = f < 1 ? 0.25 / f : 0;
    const r0 = Math.max(0, Math.floor(top)), r1 = Math.min(ROWS - 1, Math.ceil(top + h));
    const c0 = Math.max(0, Math.floor(cx - w / 2 - 8)), c1 = Math.min(COLS - 1, Math.ceil(cx + w / 2 + 8));
    for (let r = r0; r <= r1; r++) {
      const v = (r + 0.5 - top) / f, sh = shift ? shift(v / p.rows) : 0;
      for (let c = c0; c <= c1; c++) {
        const u = (c + 0.5 - cx - sh) / fh + p.cols / 2, a = sampleC(p, u, v, d);
        if (a >= 0.12) shade(r * COLS + c, a, SC, u / p.cols, v / p.rows, r, c);
      }
    }
  }
  // light a cell with its true colour; brightness only decides how dense the character is
  function paintCell(i, a, col, extra, wide) {
    const luma = 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2];
    // wide: use the full range of characters, so shadows between folds read as light, thin marks and highlights as dense ones
    const base = wide ? 0.26 + 0.7 * Math.pow(clamp((luma - 0.18) / 0.78), 0.95) : 0.5 + 0.45 * luma;
    const L = clamp((base + (extra || 0)) * Math.min(1, a * 1.4));
    const k = (0.45 + 0.75 * L) * 1.6, j = i * 3, lift = 1.25 / k;       // lift the darks so every inch of the subject shows
    lum[i] = L; fx[i] = 0;
    const g = wide ? 0.68 : 0.8;
    rgb[j] = Math.pow(col[0], g) * lift; rgb[j + 1] = Math.pow(col[1], g) * lift; rgb[j + 2] = Math.pow(col[2], g) * lift;
  }
  const BUD = [0.55, 0.74, 0.36];
  const noise2 = (u, v) => 0.5 + 0.25 * Math.sin(u * 11 + 1.3) * Math.sin(v * 9 + 0.4) + 0.25 * Math.sin(u * 5 - v * 7 + 2.1);   // 0..1, organic blobs
  const isGreen = (c) => c[1] > c[0] * 1.08 && c[1] > c[2] * 1.15;
  // wind: higher = sways more, and the wave travels up the picture (same recipe as lily_bouquet.html)
  const wind = (nv, t, amp, base) => {
    const h = clamp((base - nv) / base), w = t - 0.45 * h;
    return FLICK * amp * Math.pow(h, 1.4) * (0.6 * Math.sin(TAU * 2 * w / 14) + 0.3 * Math.sin(TAU * 3 * w / 14 + 1) + 0.1 * Math.sin(TAU * 5 * w / 14 + 2));
  };
  const sweep = (u, v, t) => {                             // a soft band of light drifting across the picture
    const x = u * 0.8 + v * 0.6 - (((t * 0.14) % 2.2) - 0.6);
    return FLICK * 0.2 * Math.exp(-x * x / 0.012);
  };
  function flame(c0, rb, h, t, k, life) {                  // one candle flame, cell coordinates
    const sway = FLICK * (1.1 * Math.sin(t * 9 + k * 2) + 0.7 * Math.sin(t * 15 + k));
    const hh = h * life * (1 + 0.14 * FLICK * Math.sin(t * 13 + k * 3));
    for (let r = Math.floor(rb - hh - 1); r <= rb; r++) for (let c = c0 - 6; c <= c0 + 6; c++) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      const u = (rb - r) / hh;
      if (u < 0 || u > 1) continue;
      const hw = 3.4 * Math.sin(Math.PI * Math.pow(u, 0.6)) * (1 - 0.3 * u) * life, dx = c - (c0 + sway * u * u);
      if (Math.abs(dx) > hw) continue;
      const core = 1 - Math.abs(dx) / (hw + 1e-3);
      set(r * COLS + c, clamp(0.7 + 0.35 * core), u < 0.14 ? [0.45, 0.65, 1] : lerp3([1, 0.5, 0.1], [1, 0.95, 0.6], core * 1.2 - u * 0.4));
    }
  }

  // ============================================================ scene 1: countdown
  function drawNumber(str, cy, scale, alpha, t, gold) {
    const P = 5 * scale, GAP = 1.3, adv = 5 + GAP, n = str.length;
    const totalW = (n * 5 + (n - 1) * GAP) * P, x0 = -totalW / 2, y0 = cy - 3.5 * P;
    const bit = (d, x, y) => (x < 0 || y < 0 || x > 4 || y > 6) ? 0 : DIGITS[d][y][x] === "1" ? 1 : 0;
    paint(x0, y0, x0 + totalW, y0 + 7 * P, (i, x, y) => {
      const rel = (x - x0) / P, d = Math.floor(rel / adv), px = rel - d * adv;
      if (d < 0 || d >= n || px < 0 || px >= 5) return;
      const dig = str[d], gx = Math.floor(px), gy = Math.floor((y - y0) / P);
      if (gy < 0 || gy > 6 || !bit(dig, gx, gy)) return;
      const u = px - gx, v = (y - y0) / P - gy;
      const edge = Math.min(bit(dig, gx - 1, gy) ? 1 : u, bit(dig, gx + 1, gy) ? 1 : 1 - u,
        bit(dig, gx, gy - 1) ? 1 : v, bit(dig, gx, gy + 1) ? 1 : 1 - v);
      const shim = 0.14 * Math.sin((x * 0.35 - t * 4 + (y - y0) * 0.25) * FLICK);
      const l = (0.55 + 0.4 * Math.sqrt(clamp(edge * 2)) + shim) * alpha;
      const k = (y - y0) / (7 * P);
      const col = gold ? lerp3(GOLD, ROSE, k + 0.25 * Math.sin(x * 0.2 - t * 3 * FLICK)) : lerp3([0.55, 0.82, 1], [0.78, 0.62, 1], k);
      setT(i, l, col);
    });
  }

  const ease2 = (x) => { x = clamp(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

  // ---- the curtain: art/curtain.txt is a pair of drapes made of characters. It hangs closed, sways on its own, ripples where the
  // pointer sweeps through it (every column plays a chime) and, when opened, gathers into folds at both sides.
  const CUR = window.CURTAIN, DR = CUR.rows, DC = CUR.cols;
  const bin = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const DENS = bin(CUR.a), DRGB = bin(CUR.rgb);                  // per cell: how much strand/bead/butterfly, and its colour
  // how much strand there is in each column of the picture: used to cut the two halves along a gap, never through a butterfly
  const COLD = Float32Array.from({ length: DC }, (_, x) => { let a = 0; for (let y = 0; y < DR; y++) a += DENS[y * DC + x]; return a / 255; });
  const srcCol = (X, sc, base) => { let sx = X / sc + base; const tile = Math.floor(sx / DC); sx -= tile * DC; return (tile & 1) ? DC - sx : sx; };
  const emptiest = (lo, hi, sc, base, step) => {                // the position between lo and hi whose picture column is the emptiest
    let best = lo, bv = 1e9;
    for (let X = lo; X <= hi; X += step) { const x = clamp(Math.floor(srcCol(X, sc, base)), 1, DC - 2), v = COLD[x - 1] + 2 * COLD[x] + COLD[x + 1]; if (v < bv) { bv = v; best = X; } }
    return best;
  };
  const emptyStart = (sc) => {                                  // start the picture at an empty column, so the outer edge never slices a butterfly
    let best = 0, bv = 1e9; for (let x = 1; x < 60; x++) { const v = COLD[x - 1] + 2 * COLD[x] + COLD[x + 1]; if (v < bv) { bv = v; best = x; } } return best;
  };
  const KCHIME = 14, reach = () => ROWS * 0.12;       // how far the pointer's push reaches, in columns
  let off = new Float32Array(0), vel = new Float32Array(0), heat = new Float32Array(0), voice = [], curKey = "", sweptPx = 0, pointer = { has: false };
  function buildCurtain() {                                    // rebuilt whenever the grid size changes
    curKey = COLS + "x" + ROWS; off = new Float32Array(COLS); vel = new Float32Array(COLS); heat = new Float32Array(COLS);
    voice = Array.from({ length: KCHIME }, (_, k) => ({ k, K: KCHIME, cool: 0 }));
  }
  function pushCurtain(col, dCols, speedPx) {                  // the pointer drags the cloth sideways near column col
    let touched = false, best = 0;
    const REACH = reach();
    for (let c = Math.max(0, Math.floor(col - REACH)); c <= Math.min(COLS - 1, Math.ceil(col + REACH)); c++) {
      const fall = 1 - Math.abs(c - col) / REACH; if (fall <= 0) continue;
      vel[c] += clamp(dCols, -6, 6) * 0.22 * fall; heat[c] = Math.min(1, heat[c] + fall * 0.7); best = Math.max(best, speedPx * fall); touched = true;
    }
    if (touched) { sweptPx += speedPx; if (best >= 1.1) chime(voice[clamp(Math.floor(col / COLS * KCHIME), 0, KCHIME - 1)], best); }
  }
  function stepCloth() {                                       // neighbours pull each other: a push becomes a travelling ripple
    for (let s = 0; s < 2; s++) {
      for (let c = 0; c < COLS; c++) {
        const l = off[Math.max(0, c - 1)], r = off[Math.min(COLS - 1, c + 1)];
        vel[c] = (vel[c] + ((l + r) / 2 - off[c]) * 0.3 - off[c] * 0.012) * 0.965;
      }
      for (let c = 0; c < COLS; c++) off[c] = clamp(off[c] + vel[c], -12, 12);
    }
  }
  const toRows = (cx, cy) => {                                  // screen pixels -> cell column and row
    const k = Math.min(innerWidth / W, innerHeight / H);
    return [(cx - (innerWidth - W * k) / 2) / (CW * k), (cy - (innerHeight - H * k) / 2) / (CH * k)];
  };
  let curtainLive = false;                                      // only the countdown scene reacts to the pointer
  addEventListener("pointermove", (ev) => {
    const [x, y] = toRows(ev.clientX, ev.clientY);
    if (curtainLive && pointer.has) {
      const sp = Math.hypot(ev.clientX - pointer.cx, ev.clientY - pointer.cy);
      if (sp >= 0.01 && sp <= 120) pushCurtain(x, x - pointer.x, sp);
    }
    pointer = { x, y, cx: ev.clientX, cy: ev.clientY, has: true };
  });
  document.addEventListener("pointerleave", () => { pointer.has = false; });

  // ---- chimes: first click or tap switches the sound on (browsers require a gesture). One note per column, on a 10-note scale.
  let AC = null, master = null, lastChime = 0, voices = 0;
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  function audioInit() {
    if (AC) { if (AC.state === "suspended") AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor(), delay = AC.createDelay(), fb = AC.createGain(), wet = AC.createGain();
      delay.delayTime.value = 0.11; fb.gain.value = 0.14; wet.gain.value = 0.13;
      master = AC.createGain(); master.connect(comp); master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(comp); comp.connect(AC.destination);
    } catch (e) { AC = null; }
  }
  addEventListener("pointerdown", audioInit);
  addEventListener("keydown", audioInit);
  function chime(ch, impact) {
    if (!AC || AC.state !== "running") return;
    const now = AC.currentTime;
    if (now < ch.cool || now - lastChime < 0.028 || voices >= 8) return;
    ch.cool = now + 0.095; lastChime = now; voices++;
    const base = SCALE[Math.floor(ch.k / ch.K * SCALE.length)], amp = Math.min(0.1, 0.03 + impact * 0.004), dur = 0.72 + Math.random() * 0.32;
    const pan = AC.createStereoPanner ? AC.createStereoPanner() : null, out = AC.createGain();
    if (pan) { pan.pan.value = clamp(((ch.k + 0.5) / ch.K * 2 - 1) * 0.9, -0.9, 0.9); out.connect(pan); pan.connect(master); } else out.connect(master);
    out.gain.setValueAtTime(0.0001, now); out.gain.linearRampToValueAtTime(amp, now + 0.006); out.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    [[1, 1], [2.003, 0.35], [4.01, 0.12]].forEach(([m, g], i) => {
      const o = AC.createOscillator(), og = AC.createGain();
      o.type = "sine"; o.frequency.value = base * m * (1 + (Math.random() - 0.5) * 0.004); og.gain.value = g;
      o.connect(og); og.connect(out); o.start(now); o.stop(now + dur + 0.05);
      if (i === 0) o.onended = () => { voices--; };
    });
  }

  function drawCurtain(t, drop, open) {
    // the picture keeps its own proportions (so butterflies stay butterflies) and repeats across the screen; opening slides both halves out
    const half = COLS / 2, sc = Math.min((ROWS / DR) * 0.95, COLS / 2 / (DC * 0.5)), base = emptyStart(sc), cut = emptiest(half * 0.9, half, sc, base, 0.5), shift = ease2(open) * (cut + 2), rows = Math.min(ROWS, Math.round(ROWS * easeOut(drop)));
    const sway = reduce ? 0 : 1;
    for (let c = 0; c < COLS; c++) heat[c] *= 0.94;
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < Math.ceil(half) + 14; k++) {            // k = distance from this side's outer edge, in cells
        const c = side ? COLS - 1 - k : k; if (c < 0 || c >= COLS) continue;
        for (let r = 0; r < rows; r++) {
          const lean = (0.25 + 0.75 * r / ROWS), wob = sway * 1.3 * Math.sin(r * 0.07 + t * 0.9 + k * 0.045) * lean;
          const X = k + shift + (side ? 1 : -1) * (off[c] * lean + wob);
          if (X < 0 || X > cut) continue;
          // smooth sample of the picture at this spot (the strands are thin, so we blend rather than skip characters)
          const sx = srcCol(X, sc, base);                         // every other copy is mirrored: no seams
          const fx0 = sx - 0.5, fy0 = r / sc - 0.5, ix = Math.floor(fx0), iy = Math.floor(fy0), tx = fx0 - ix, ty = fy0 - iy;
          let dsum = 0, cr = 0, cg = 0, cb = 0;
          for (let q = 0; q < 4; q++) {
            const qx = ix + (q & 1), sy = iy + (q >> 1); if (sy < 0 || sy >= DR || qx < 0 || qx >= DC) continue;
            const wgt = ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? ty : 1 - ty), dd = DENS[sy * DC + qx] / 255 * wgt, o = (sy * DC + qx) * 3;
            dsum += dd; cr += DRGB[o] * dd; cg += DRGB[o + 1] * dd; cb += DRGB[o + 2] * dd;
          }
          if (dsum < 0.12) continue;
          const h = heat[c], tw = 0.85 + 0.15 * Math.sin(t * 3 + r * 0.9 + c * 0.7) * FLICK;       // beads twinkle
          const l = clamp((0.3 + 1.1 * dsum + 0.35 * h) * tw), inv = 1 / (255 * dsum);
          setT(r * COLS + c, l, lerp3([cr * inv, cg * inv, cb * inv], [1, 1, 0.95], 0.6 * h));
        }
      }
    }
  }
  function firework(dt, cx, cy, seed, hue) {                   // radial burst of sparks that fade and fall; cx, cy in cells
    if (dt < 0 || dt > 1.9) return;
    const life = 1 - smoothstep(1.1, 1.9, dt), cols = [[1, 0.8, 0.4], [1, 0.5, 0.7], [0.55, 0.85, 1], [0.8, 0.65, 1], [0.6, 1, 0.7]];
    if (dt < 0.12) for (let k = 0; k < 6; k++) glyph(Math.round(cy), Math.round(cx) + k - 3, "*", 1, [1, 1, 0.95]);   // flash
    const FS = Math.max(1, ROWS / 57);
    for (let k = 0; k < 44; k++) {
      const ang = (k / 44) * TAU + rnd(seed, 3) * 6, sp = (14 + rnd(k, seed) * 12) * FS;
      for (let q = 0; q < 3; q++) {                            // each spark leaves a short trail
        const d = Math.max(0, dt - q * 0.05), dist = sp * d * (1 - 0.3 * d);
        glyph(Math.round(cy + Math.sin(ang) * dist + 9 * FS * d * d), Math.round(cx + Math.cos(ang) * dist * 2),
          q ? "." : "*+"[k % 2], (q ? 0.45 : 0.95) * life, cols[(hue + (k % 3)) % cols.length]);
      }
    }
  }
  const BURSTS = [[1.5, 0.22, 0.3], [2.1, 0.78, 0.26], [2.7, 0.5, 0.18], [3.5, 0.32, 0.42], [4.1, 0.7, 0.4], [4.9, 0.5, 0.3], [5.7, 0.18, 0.25], [6.1, 0.84, 0.3], [6.8, 0.5, 0.2]];

  // scene 1: the countdown. Scene 2: the curtain of butterflies (drawn on the finer grid, so the butterflies are clear) opens.
  // Scene 3: behind it, the big number and the party.
  // ---- sprites: the ASCII pictures from art/*.txt (js/sprites.js), moved, rotated and coloured by the page
  const SP = {};
  for (const k in window.SPR) { const q = window.SPR[k]; SP[k] = { cols: q.cols, rows: q.rows, v: bin(q.v), tip: q.tip }; }
  const KX = 0.54;                                         // an art character is 0.54 as wide as it is tall
  function spriteFrame(sp, o) {
    const sy = o.h / sp.rows, pxa = (o.px === undefined ? 0.5 : o.px) * sp.cols, pya = (o.py === undefined ? 0.5 : o.py) * sp.rows;
    return { sy, pxa, pya, P0x: o.x + (pxa - sp.cols / 2) * sy * KX / ASPECT, P0y: o.y + (pya - sp.rows / 2) * sy, cs: Math.cos(o.rot || 0), sn: Math.sin(o.rot || 0) };
  }
  function spriteTip(sp, o) {                              // where a point of the picture (its wand tip) is on screen: [col, row]
    const F = spriteFrame(sp, o); let ax = sp.tip[0] * sp.cols, ay = sp.tip[1] * sp.rows;
    if (o.flipX) ax = sp.cols - ax; if (o.flipY) ay = sp.rows - ay;
    const x = (ax - F.pxa) * F.sy * KX, y = (ay - F.pya) * F.sy;
    return [F.P0x + (x * F.cs - y * F.sn) / ASPECT, F.P0y + x * F.sn + y * F.cs];
  }
  // o: x, y (centre, in cells), h (height in rows), rot, px/py (pivot, 0..1), flipX/flipY, alpha, lo/gain (brightness to opacity),
  //    color(u, v, d) -> rgb, show(u, v) -> 0..1
  function sprite(sp, o) {
    const F = spriteFrame(sp, o), { cols, rows, v } = sp, lo = o.lo === undefined ? 0.25 : o.lo, gain = o.gain === undefined ? 1.8 : o.gain;
    const R = Math.hypot(cols * F.sy * KX, rows * F.sy);
    const c0 = Math.max(0, Math.floor(F.P0x - R / ASPECT)), c1 = Math.min(COLS - 1, Math.ceil(F.P0x + R / ASPECT));
    const r0 = Math.max(0, Math.floor(F.P0y - R)), r1 = Math.min(ROWS - 1, Math.ceil(F.P0y + R));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const dx = (c - F.P0x) * ASPECT, dy = r - F.P0y;
      let ax = F.pxa + (dx * F.cs + dy * F.sn) / (F.sy * KX), ay = F.pya + (-dx * F.sn + dy * F.cs) / F.sy;
      if (o.flipX) ax = cols - ax; if (o.flipY) ay = rows - ay;
      const fx0 = ax - 0.5, fy0 = ay - 0.5, ix = Math.floor(fx0), iy = Math.floor(fy0), tx = fx0 - ix, ty = fy0 - iy;
      if (ix < -1 || iy < -1 || ix >= cols || iy >= rows) continue;
      let d = 0;
      for (let q = 0; q < 4; q++) {
        const qx = ix + (q & 1), qy = iy + (q >> 1); if (qx < 0 || qy < 0 || qx >= cols || qy >= rows) continue;
        d += v[qy * cols + qx] * ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? ty : 1 - ty);
      }
      d /= 255; let a = clamp((d - lo) * gain); if (a < 0.03) continue;
      const u = ax / cols, w = ay / rows;
      if (o.show) { a *= o.show(u, w); if (a < 0.03) continue; }
      setT(r * COLS + c, clamp(a * (o.alpha === undefined ? 1 : o.alpha)), o.color(u, w, d));
    }
  }
  const dust = (r, c, l, col, k) => glyph(Math.round(r), Math.round(c), "*+.'`"[k % 5], l, col);   // one little sparkle
  const COOL = (u, v) => lerp3([0.55, 0.85, 1], [0.8, 0.62, 1], v);

  // scene 1: the countdown, with the digits from art/numbers.txt
  const countdown = {
    grid: HI,
    start() { curtainLive = false; say("Counting down to " + C.age + "."); },
    frame(t) {
      backdrop(t);
      const n = C.countdownFrom;
      if (t < n) {
        const step = Math.floor(t), st = t - step, k = n - step;
        if (SP["d" + k]) sprite(SP["d" + k], { x: COLS / 2, y: ROWS * 0.47, h: ROWS * 0.5 * (1 + 0.3 * (1 - easeOut(st * 3))), alpha: 1 - smoothstep(0.78, 1, st), lo: 0.2, gain: 1.7,
          color: (u, v, d) => lerp3(COOL(u, v), [1, 1, 1], clamp(d - 0.6) * 1.2) });
        setCap("Counting down to " + C.age);
      }
      if (t > n + 0.1) return "next";
    },
  };
  // scene 2: the big number and the party
  const party = {
    grid: HI,
    start() { curtainLive = false; say("Hurray! Happy birthday, " + C.name + ". You are " + C.age + "."); },
    frame(t) {
      backdrop(t);
      const digits = String(C.age).split("").filter((ch) => SP["d" + ch]), h = ROWS * 0.5 * (1 + 0.45 * (1 - easeOut(t * 2.2)));
      const widths = digits.map((ch) => SP["d" + ch].cols * (h / SP["d" + ch].rows) * KX / ASPECT), gap = h * 0.25;
      let x = COLS / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (digits.length - 1)) / 2;
      digits.forEach((ch, i) => {
        sprite(SP["d" + ch], { x: x + widths[i] / 2, y: ROWS * 0.47, h, alpha: smoothstep(0, 0.35, t), lo: 0.2, gain: 1.7,
          color: (u, v, d) => lerp3(lerp3(GOLD, ROSE, v + 0.2 * Math.sin(u * 5 - t * 3 * FLICK)), [1, 1, 1], clamp(d - 0.6) * 1.2) });
        x += widths[i] + gap;
      });
      if (!reduce) {
        confetti(t, 0, 32, 100, 3);
        for (const [bt, bx, by] of BURSTS) firework(t - bt, bx * COLS, by * ROWS, Math.round(bt * 10), Math.round(bx * 10));
      }
      setTitle(t > 0.5 ? "Hurray! Happy birthday, " + C.name : "");
      if (t > 8.5) return "next";
    },
  };

  // Tinker Bell's colours, by where on the picture a cell is: blonde hair, peach skin, a green dress, pale blue wings, gold sparkles
  function tinkerbell(u, v, d, t) {
    const x = u * 96, y = v * 71, box = (x0, x1, y0, y1) => smoothstep(x0 - 2, x0, x) * (1 - smoothstep(x1, x1 + 2, x)) * smoothstep(y0 - 2, y0, y) * (1 - smoothstep(y1, y1 + 2, y));
    const dress = Math.max(box(46, 62, 21, 34), box(36, 61, 34, 50));
    const wing = (1 - dress) * Math.max((1 - smoothstep(44, 48, x)) * (1 - smoothstep(32, 36, y)), (1 - smoothstep(34, 38, x)) * (1 - smoothstep(40, 44, y)));
    const e = ((x - 60) / 13) ** 2 + ((y - 11) / 7.5) ** 2, hair = 1 - smoothstep(0.7, 1.2, e);
    const gold = smoothstep(76, 82, x) + (1 - smoothstep(18, 26, x)) * smoothstep(10, 14, y);
    let col = [1, 0.8, 0.68];                                                              // skin
    col = lerp3(col, [0.4, 0.92, 0.42], dress);                                            // dress: leaf green
    col = lerp3(col, lerp3([0.5, 0.82, 1], [0.78, 0.7, 1], v + 0.15 * Math.sin(t * 2 * FLICK + u * 9)), wing);
    col = lerp3(col, [1, 0.86, 0.38], hair);                                               // hair
    col = lerp3(col, [1, 0.93, 0.55], clamp(gold));                                        // sparkles and the wand tip
    const k = 0.85 + 0.4 * d;
    return lerp3([col[0] * k, col[1] * k, col[2] * k], [1, 1, 0.95], clamp(d - 0.85) * 2);
  }

  // scene 3: a fairy appears from nowhere, waves her wand and writes "Happy Birthday" in the air; that fades, and flowers
  // grow in from the left and right (one from above and one from below on each side). Then the cake.
  const MG = { wave: 2.2, hbdAt: 3.4, hbdD: 2.6, hbdOut: 9.5, hbdOutD: 3, fairyOut: 12, flowers: 12.5, flowersD: 3.8, end: 19 };
  const magic = {
    grid: HI,
    start() { say("A fairy appears, waves her wand and writes Happy Birthday in the air. Then flowers grow in from the sides."); },
    frame(t) {
      backdrop(t);
      const wide = W / H >= 1.15, fh = ROWS * (wide ? 0.72 : 0.5);
      const L = wide ? { fx: COLS * 0.27, fy: ROWS * 0.54, bx: COLS * 0.66, by: ROWS * 0.42, bh: Math.min(ROWS * 0.42, COLS * 0.5 / 2.16) }
                     : { fx: COLS * 0.4, fy: ROWS * 0.7, bx: COLS * 0.5, by: ROWS * 0.27, bh: Math.min(ROWS * 0.3, COLS * 0.9 / 2.16) };
      const fairyAt = (tt) => ({ x: L.fx + 2 * Math.sin(tt * 1.1), y: L.fy + ROWS * 0.012 * Math.sin(tt * 1.4), h: fh, px: 0.5, py: 0.55,
        rot: 0.11 * smoothstep(MG.wave, MG.wave + 0.5, tt) * (1 - 0.7 * smoothstep(MG.hbdAt + MG.hbdD, MG.hbdAt + MG.hbdD + 1.5, tt)) * Math.sin(tt * 15 * FLICK) });
      const fo = fairyAt(t), fairyA = (1 - smoothstep(MG.fairyOut, MG.fairyOut + 1.6, t)), appear = clamp((t - 0.2) / 1.8);
      // 1) the fairy: sparkles gather, then she is there
      if (fairyA > 0) {
        sprite(SP.fairy, { ...fo, alpha: fairyA * smoothstep(0.1, 0.6, appear), lo: 0.2, gain: 1.8,
          show: (u, v) => smoothstep(noise2(u * 3, v * 3) * 0.7, noise2(u * 3, v * 3) * 0.7 + 0.35, appear * 1.1),
          color: (u, v, d) => tinkerbell(u, v, d, t) });
        if (!reduce && t < 2.4) for (let k = 0; k < 70; k++) {
          const ang = rnd(k, 31) * TAU, R0 = (0.45 + 0.5 * rnd(k, 32)) * fh, e = easeOut(clamp((t - rnd(k, 33) * 0.6) / 1.6));
          dust(fo.y + Math.sin(ang) * R0 * (1 - e), fo.x + Math.cos(ang) * R0 * (1 - e) * 1.2, 0.9 * (1 - e) * Math.min(1, t * 3), [1, 0.9, 0.6 + 0.4 * rnd(k, 34)], k);
        }
      }
      // 2) sparks pour from the wand
      if (!reduce && t > MG.wave && t < MG.hbdAt + MG.hbdD + 3) for (let k = 0; k < 130; k++) {
        const tb = MG.wave + 0.1 + k * 0.045, age = t - tb; if (age < 0 || age > 1.5) continue;
        const [tc, tr] = spriteTip(SP.fairy, fairyAt(tb)), a = 1 - age / 1.5;
        dust(tr + ((rnd(k, 35) - 0.5) * 6 - 5) * age * (ROWS / 90) + 14 * age * age, tc + (rnd(k, 36) - 0.3) * 16 * age * (ROWS / 90), 0.95 * a,
          [[1, 0.85, 0.45], [1, 0.6, 0.85], [0.6, 0.9, 1]][k % 3], k);
      }
      // 3) "Happy Birthday" grows out of the wand tip, hangs there, then dissolves
      const he = easeOut(clamp((t - MG.hbdAt) / MG.hbdD)), g2 = clamp((t - MG.hbdOut) / MG.hbdOutD);
      if (t >= MG.hbdAt && g2 < 1) {
        const [tc, tr] = spriteTip(SP.fairy, fo), bob = reduce ? 0 : Math.sin(t * 1.3) * ROWS * 0.008;
        sprite(SP.hbd, { x: tc + (L.bx - tc) * he, y: tr + (L.by - tr) * he + bob, h: L.bh * (0.05 + 0.95 * he), lo: 0.3, gain: 2.2,
          alpha: smoothstep(MG.hbdAt, MG.hbdAt + 0.5, t),
          show: (u, v) => {
            const wipe = smoothstep(u * 0.7 - 0.05, u * 0.7 + 0.25, he * 1.0), nz = noise2(u * 3, v * 3), dis = clamp((nz - (g2 * 1.4 - 0.2)) * 6);
            return wipe * dis;
          },
          color: (u, v, d) => lerp3(lerp3([1, 0.82, 0.45], [1, 0.95, 0.85], v), [1, 1, 1], 0.2 + 0.2 * Math.sin(t * 4 * FLICK + u * 20)) });
      }
      // 4) flowers grow in from both sides
      const gf = clamp((t - MG.flowers) / MG.flowersD);
      if (gf > 0) {
        const fh2 = Math.min(ROWS * 0.55, COLS * 0.32), fw = SP.flower.cols * (fh2 / SP.flower.rows) * KX / ASPECT;
        [[-1, 0], [-1, 1], [1, 0], [1, 1]].forEach(([side, top], i) => {       // top = 1: hangs from above
          const g = clamp((t - MG.flowers - (top ? 0.3 : 0)) / MG.flowersD), slide = (1 - easeOut(g)) * fw * 0.6;
          sprite(SP.flower, { x: side < 0 ? fw / 2 + 2 - slide : COLS - fw / 2 - 2 + slide, y: top ? fh2 / 2 + ROWS * 0.01 : ROWS - fh2 / 2 - ROWS * 0.01, h: fh2,
            flipX: side > 0, flipY: !!top, rot: reduce ? 0 : 0.03 * Math.sin(t * 0.9 + i * 1.7), lo: 0.25, gain: 1.8, alpha: smoothstep(0, 0.15, g),
            show: (u, v) => smoothstep(1.1 - g * 1.3 - 0.14, 1.1 - g * 1.3, v),
            color: (u, v, d) => lerp3(lerp3([1, 0.55, 0.75], [0.78, 0.62, 1], v), [1, 0.95, 0.85], clamp(d - 0.55) * 1.3 + 0.12 * Math.sin(t * 3 * FLICK + u * 17 + v * 9)) });
        });
        if (!reduce) for (let k = 0; k < 14; k++) {                                  // petals drifting down
          const age = (t * 0.25 + rnd(k, 37)) % 1;
          dust(age * ROWS, (rnd(k, 38) * 0.95 + 0.025) * COLS + 6 * Math.sin(t + k), 0.7 * gf * (1 - age * 0.5), [1, 0.7, 0.85], k);
        }
      }
      fireflies(t, 0.4);
      if (t > MG.end) return "next";
    },
  };

  const curtain = {
    grid: HI, openAt: null, simX: undefined,
    start() { this.openAt = null; this.simX = undefined; curKey = ""; sweptPx = 0; curtainLive = true; say("A curtain of butterflies and charms. Sweep the pointer through it, or scroll, to open it."); },
    scroll(d) { if (this.openAt === null) sweptPx += Math.abs(d) * 0.6; },
    frame(t) {
      backdrop(t);
      if (curKey !== COLS + "x" + ROWS) buildCurtain();
      const ready = 1.4;
      // it opens when it has been swept enough, or after a few seconds on its own
      if (this.openAt === null && t > ready) {
        if (Q.has("open")) this.openAt = Number(Q.get("open"));
        else if (sweptPx > 700 || t > ready + 9) this.openAt = t;
      }
      if (Q.has("sweep") && this.openAt === null && t > ready && t < ready + 3) {   // debug: simulate a pointer sweeping across
        const px = COLS * (0.1 + 0.8 * ((t - ready) / 1.6 % 1)), last = this.simX;
        if (last !== undefined) pushCurtain(px, px - last, Math.abs(px - last) * CW);
        this.simX = px;
      }
      const ot = this.openAt === null ? -1 : t - this.openAt, drop = clamp(t / 1.3), open = this.openAt === null ? 0 : clamp(ot / 2.8);
      stepCloth(); drawCurtain(t, drop, open);
      setCap(drop >= 1 && this.openAt === null ? "Sweep your cursor or finger through the curtain, or scroll, to open it  -  click once for chimes" : "");
      if (ot > 3.4) { curtainLive = false; return "next"; }          // the curtain has parted: on to the number
    },
  };
  // ============================================================ scene 2: cake (art/cake.jpg)
  const cake = {
    grid: HI, outAt: [], prog: 0, extra: 0, doneAt: null, lastT: 0, zoom: 0,
    start() {                                              // scroll / swipe / arrow keys blow the candles out one by one
      this.outAt = []; this.prog = Q.has("blown") ? 1 : 0; this.extra = 0; this.doneAt = null; this.lastT = 0; this.zoom = 0;
      if (Q.has("blown")) this.outAt = PIC.cake.marks.map(() => -10);
      if (Q.has("prog")) {                                  // debug: ?prog=0.4 starts with 40% of the way through the scroll
        const n = PIC.cake.marks.length; this.prog = Number(Q.get("prog")); this.outAt = Array.from({ length: Math.ceil(this.prog * n - 1e-6) }, () => -10);
      }
      say("A cake with cherries and candles. Make a wish. Scroll, swipe or press the down arrow to blow out the candles.");
    },
    scroll(d) {                                            // d: scroll distance in pixels (positive = down)
      const n = PIC.cake.marks.length;
      if (this.outAt.length < n) {
        this.prog = clamp(this.prog + clamp(d, -80, 80) / 1800, 0, 1);   // gentle: one notch is a fraction of one candle
        while (this.outAt.length < Math.ceil(this.prog * n - 1e-6)) this.outAt.push(this.lastT);
        if (this.outAt.length === n) this.doneAt = this.lastT;
      } else if (this.lastT > this.doneAt + 1.6) {         // all out: keep scrolling to open the letter
        this.extra = clamp(this.extra + d / 600, 0, 1);
        if (this.extra >= 1) goto(5);
      }
    },
    frame(t, T) {
      backdrop(t);
      const p = PIC.cake, marks = p.marks, f0 = fitPic(p, 48, 20, 1.25);
      // scrolling zooms in on the candles while they go out, then back out before the letter
      const zt = this.outAt.length < marks.length ? this.prog : 1 - this.extra;       // 0..1 target
      this.zoom += (zt - this.zoom) * (1 - Math.exp(-4 * Math.max(0, t - this.lastT)));
      const zf = reduce ? zt : this.zoom, f = f0 * (1 + 0.5 * zf), w = picW(p, f), h = p.rows * f;
      const cx = COLS / 2, my = marks.reduce((a, m) => a + m[1], 0) / marks.length;
      const top = (22 + my * p.rows * f0) * (1 - zf) + ROWS * 0.45 * zf - my * h;
      this.lastT = t;
      const out = (k) => k < this.outAt.length ? smoothstep(this.outAt[k], this.outAt[k] + 0.4, t) : 0;
      let alive = 0;
      for (let k = 0; k < marks.length; k++) alive += 1 - out(k);
      const flick = 0.95 + 0.05 * Math.sin(t * 11 * FLICK) * Math.sin(t * 5.3 * FLICK);
      const warm = 0.82 + 0.18 * (alive / marks.length) * flick, appear = smoothstep(0, 1.2, t);
      drawPic(p, f, cx, top, (i, a, col, nu, nv, r, c) => {
        if (!reduce && col[0] + col[1] + col[2] > 2.0 && hash3(r, c, Math.floor(t * 5)) % 500 === 0) { set(i, 1, [1, 1, 0.95]); return; }   // twinkle
        const show = smoothstep((1 - nv) * 1.4 + 0.5 * noise2(nu, nv), (1 - nv) * 1.4 + 0.5 * noise2(nu, nv) + 0.5, t);
        if (show > 0) paintCell(i, a * show * warm, col, sweep(nu, nv, t) * 1.5, true);
      });
      marks.forEach((m, k) => {                            // a flame on each cherry stem
        const col = Math.round(cx + (m[0] - 0.5) * w), base = Math.round(top + m[1] * h);
        const life = (1 - out(k)) * smoothstep(0.6, 1.4, t);
        if (life > 0.02) {
          flame(col, base, 10 * (1 + 0.5 * zf), t, k, life);
          if (!reduce) for (let q = 0; q < 5; q++) {         // sparks rising from the flame
            const age = (t * 0.7 + rnd(k * 9 + q, 4)) % 1;
            glyph(Math.round(base - 11 - age * 22), Math.round(col + 5 * Math.sin(t * 1.3 + k + q * 2) * age), q % 2 ? "." : "*", 0.8 * (1 - age) * life, [1, 0.8, 0.4]);
          }
        }
        else if (k < this.outAt.length) {                   // smoke once the flame is out
          const age = t - (this.outAt[k] + 0.3), a = 1 - smoothstep(2, 3.4, age);
          if (age > 0 && a > 0) for (let d = 0; d < Math.min(14, age * 6); d++) {
            const sc = col + Math.round(2.5 * Math.sin(d * 0.55 - t * 2) * (d / 14 + 0.25));
            glyph(base - d, sc, d % 3 === 0 ? "~" : d % 3 === 1 ? "'" : ".", 0.4 * a * (1 - d / 16), [0.7, 0.7, 0.8]);
          }
        }
      });
      fireflies(t, smoothstep(1, 3, t) * warm);
      const all = this.outAt.length === marks.length;
      setCap(t < 2.4 ? "Make a wish." : !all ? "Scroll or swipe to blow out the candles  \u2193"
        : t > this.doneAt + 1.6 ? "May every wish come true.  Scroll on to open your letter  \u2193" : "May every wish come true.");
    },
  };

  // ============================================================ scene 3: letter (art/letter.jpg, then the letter pops out)
  // 1) the envelope shows alone  2) it slides left  3) the letter pops out of it  4) the letter types itself, in ASCII
  const CPS = reduce ? 1e6 : 26;
  const TL = reduce ? { slide: 0.1, slideD: 0.01, pop: 0.2, popD: 0.01, type: 0.3 } : { slide: 3, slideD: 1.4, pop: 4.2, popD: 2.0, type: 6.6 };
  const letterTimes = []; let letterEnd = 0;
  (function () {
    let cur = 0;
    for (const p of C.letter) {
      const arr = [];
      for (let k = 0; k < p.length; k++) {
        arr.push(cur); cur += 1 / CPS;
        if (!reduce && ".,?!".includes(p[k])) cur += 0.12;
      }
      letterTimes.push(arr); cur += reduce ? 0 : 0.6;
    }
    letterEnd = cur;
  })();
  const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  const easeBack = (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  function wrap(str, width) {                              // words -> lines of {ch, k} (k = index in the paragraph)
    const lines = []; let line = [], len = 0;
    for (const w of str.matchAll(/\S+/g)) {
      if (line.length && len + 1 + w[0].length > width) { lines.push(line); line = []; len = 0; }
      if (line.length) { line.push({ ch: " ", k: w.index - 1 }); len++; }
      for (let q = 0; q < w[0].length; q++) line.push({ ch: w[0][q], k: w.index + q });
      len += w[0].length;
    }
    if (line.length) lines.push(line);
    return lines;
  }
  const SCRAMBLE = "#@$%&8WM*+=";

  const letter = {
    grid: HI, done: false, extra: 0, skip: 0,
    start() { this.done = false; this.extra = 0; this.skip = 0; say(C.letter.join(" ") + " Scroll, swipe or press the down arrow to walk into the garden."); },
    scroll(d) {
      if (!this.done) { this.skip += Math.max(0, d) * 0.015; return; }            // scrolling fast-forwards the envelope and the typing
      { this.extra = clamp(this.extra + d / 600, 0, 1); if (this.extra >= 1) goto(6); } },
    frame(t0) {
      const t = t0 + this.skip;
      backdrop(t);
      const wide = innerWidth >= 820, p = PIC.letter;
      const fA = fitPic(p, 28, 60, 1.4), fB = wide ? fitPic(p, 32, COLS * 0.5 + 10, 1.2) : fA * 0.85;
      const e = easeInOut((t - TL.slide) / TL.slideD);
      const f = fA + (fB - fA) * e, w = picW(p, f), h = p.rows * f;
      const cx = COLS / 2 + ((wide ? COLS * 0.27 : COLS / 2) - COLS / 2) * e;
      const top = (ROWS - h) / 2 + FLICK * 1.6 * Math.sin(t * 0.9);
      const dim = wide ? 1 : 1 - 0.88 * smoothstep(TL.pop, TL.pop + 1, t);      // on narrow screens the envelope fades behind the letter
      drawPic(p, f, cx, top, (i, a, col, nu, nv, r, c) => {
        if (!reduce && col[0] + col[1] + col[2] > 2.4 && hash3(r, c, Math.floor(t * 4)) % 600 === 0) { set(i, 1, [1, 1, 0.95]); return; }
        const T0 = (1 - nv) * 1.2 + 0.5 * noise2(nu, nv), show = smoothstep(T0, T0 + 0.5, t);
        if (show > 0) paintCell(i, a * show * dim, col, sweep(nu, nv, t) * 1.5);
      }, (nv) => wind(nv, t * 1.4, 0.012 * COLS, 1.0));
      fireflies(t, 0.6);

      // ---- the letter: an ASCII frame and typed text, drawn on the canvas so it glows like everything else
      const fs = innerWidth < 520 ? 12 : 15, boxMax = wide ? Math.min(600, innerWidth * 0.46) : Math.min(560, innerWidth * 0.92);
      actx.font = `${fs}px Menlo, Consolas, "DejaVu Sans Mono", monospace`;
      const cw = actx.measureText("M").width, n = Math.max(16, Math.floor(boxMax / cw) - 4), lh = fs * 1.62;
      const body = [];
      C.letter.forEach((txt, pi) => { if (pi) body.push(null); wrap(txt, n).forEach((ln) => body.push({ ln, pi })); });
      const boxW = (n + 4) * cw, boxH = (body.length + 4) * lh;
      const fx_ = wide ? innerWidth * 0.52 + boxW / 2 : innerWidth / 2, fy_ = wide ? innerHeight / 2 : innerHeight * 0.5;
      const mouth = toPx(cx + 0.1 * w / 2, top + 0.34 * h);                  // where the letter sticks out of the envelope
      const pp = easeBack((t - TL.pop) / TL.popD), sc = Math.max(0.02, pp), vis = t >= TL.pop;
      const mv = easeInOut((t - TL.pop) / TL.popD), cxp = mouth.x + (fx_ - mouth.x) * mv, cyp = mouth.y + (fy_ - mouth.y) * mv - Math.sin(Math.PI * mv) * 28, rot = (1 - mv) * -0.14;
      let typedAny = -1, lastX = 0, lastY = 0, done = t > TL.type + letterEnd;
      const tt = t - TL.type;
      overlays.push((g) => {
        g.textBaseline = "top"; g.font = `${fs}px Menlo, Consolas, "DejaVu Sans Mono", monospace`;
        if (t > 1.2 && t < TL.slide + 1) {                                   // a little caption while the envelope sits alone
          g.fillStyle = `rgba(255,220,160,${0.8 * smoothstep(1.2, 2, t) * (1 - smoothstep(TL.slide - 0.4, TL.slide + 0.6, t))})`;
          const msg = "- a letter, just for you -";
          g.fillText(msg, innerWidth / 2 - msg.length * cw / 2, innerHeight * 0.9);
        }
        if (!vis) return;
        g.save(); g.translate(cxp, cyp); g.rotate(rot); g.scale(sc, sc); g.translate(-boxW / 2, -boxH / 2);
        g.fillStyle = "rgba(255,225,185,0.035)"; g.fillRect(0, 0, boxW, boxH);
        const bc = "rgba(255,184,96,0.85)";
        g.fillStyle = bc;
        const label = " a letter to myself ", pad = Math.max(0, n + 4 - 3 - label.length - 1);
        g.fillText("+--" + label + "-".repeat(pad) + "+", 0, 0);
        g.fillText("+" + "-".repeat(n + 2) + "+", 0, boxH - lh);
        for (let r = 1; r < body.length + 3; r++) { g.fillText("|", 0, r * lh); g.fillText("|", (n + 3) * cw, r * lh); }
        if (sc > 0.7 && tt > 0) {
          body.forEach((row, ri) => {
            if (!row) return;
            const y = (2 + ri) * lh;
            row.ln.forEach((cell, ci) => {
              const at = letterTimes[row.pi][cell.k];
              if (tt < at) return;
              const age = tt - at, x = (2 + ci) * cw;
              if (cell.ch === " ") return;
              const fresh = Math.max(0, 1 - age * 3);
              g.fillStyle = row.pi === 0 ? "rgb(255,150,185)" : fresh > 0 ? `rgb(255,${200 + 40 * (1 - fresh) | 0},${120 + 90 * (1 - fresh) | 0})` : "rgb(255,238,205)";
              g.fillText(age < 0.09 && !reduce ? SCRAMBLE[(ci * 7 + ri * 3 + Math.floor(t * 30)) % SCRAMBLE.length] : cell.ch, x, y);
              typedAny = row.pi; lastX = x + cw; lastY = y;
            });
          });
          if (!done && typedAny >= 0 && Math.floor(t * 2.5) % 2 === 0) { g.fillStyle = "rgb(255,200,110)"; g.fillText("_", lastX, lastY); }
        }
        g.restore();
      });
      this.done = done;
      setCap(done ? "Scroll on to walk into the garden  \u2193" : t > 1 ? "Scroll to read faster  \u2193" : "");
    },
  };

  // ============================================================ scene 4: garden (art/bouquet.jpg)
  const GROW = reduce ? 0.2 : 4.5, FIRST = reduce ? 0.3 : 6, EVERY = reduce ? 0.3 : 1.6, CPT = 24;
  const PETALS = [[1, 0.72, 0.82], [1, 0.86, 0.92], [0.95, 0.58, 0.72], [1, 0.8, 0.7]];

  const garden = {
    grid: HI, btn: 0, notes: [],
    start() {
      this.btn = 0;
      this.notes = C.affirmations.map((msg, k) => {
        const el = document.createElement("div");
        el.className = "note " + (k % 2 === 0 ? "left" : "right");
        ui.notes.append(el);
        return el;
      });
      say("A bouquet. Each flower carries a message: " + C.affirmations.join(" "));
    },
    frame(t) {
      backdrop(t);
      const p = PIC.bouquet, f = fitPic(p, 40, 16, 1.3), w = picW(p, f), h = p.rows * f, cx = COLS / 2, n = C.affirmations.length;
      const ground = ROWS - 8, top = Math.max(14, Math.round(ground - 4 - h));   // the garden sits at the bottom of the screen
      const fh = f * picX(), gw = clamp(t / 2.6, 0, 1);
      // stems: the bundle at the bottom of the picture carries on down into the ground
      if (!p.stem) {                                       // find where the real stems end (once)
        const row = Math.floor(0.9 * p.rows); let lo = p.cols, hi = 0;
        for (let x = Math.floor(p.cols * 0.3); x < p.cols * 0.7; x++) {
          const j = (row * p.cols + x) * 4;
          if (p.px[j + 3] > 128 && p.px[j + 1] > p.px[j] * 1.05) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
        }
        p.stem = hi > lo ? [lo, hi] : [p.cols * 0.46, p.cols * 0.54];
      }
      const sr0 = Math.round(top + 0.9 * h), sg = easeOut(clamp((t - 0.3) / 2.4));
      for (let k = 0; k < 7; k++) {
        const x0 = cx + (p.stem[0] + (p.stem[1] - p.stem[0]) * k / 6 - p.cols / 2) * fh;
        for (let r = ground - Math.round(sg * (ground - sr0)); r <= ground; r++) {
          const s2 = (r - sr0) / (ground - sr0), c = Math.round(x0 + (cx - x0) * 0.25 * s2 + 2.5 * Math.sin(s2 * 3 + k));
          for (let d = 0; d < 3; d++) glyph(r, c + d, "|!l"[(k + r + d) % 3], 0.7 + 0.15 * (d === 1), lerp3([0.25, 0.6, 0.3], [0.6, 0.92, 0.45], (k % 3) / 3 + d * 0.25));
        }
      }
      const shift = (nv) => wind(nv, t, 0.045 * COLS, 0.85);
      drawPic(p, f, cx, top, (i, a, col, nu, nv, r, c) => {
        const green = isGreen(col);                        // stems and leaves grow up from the bottom first
        const T0 = 0.5 + (green ? (1 - nv) * 2.4 : 2.4 + 3.6 * noise2(nu, nv));   // flowers: each patch swells and opens in its own time
        const show = smoothstep(T0, T0 + 0.5, t);
        if (show <= 0) return;
        const ripe = green ? 1 : smoothstep(T0 + 0.2, T0 + 2, t);
        if (!reduce && ripe > 0.9 && col[0] + col[1] + col[2] > 2.2 && hash3(r, c, Math.floor(t * 5)) % 450 === 0) { set(i, 1, [1, 1, 0.95]); return; }   // twinkle
        paintCell(i, a * show, ripe < 1 ? lerp3(BUD, col, ripe) : col, sweep(nu, nv, t) - 0.2 * (1 - ripe));
      }, shift);
      // the garden, bottom to top: layered soil, a solid mat of grass, swaying blades, and evenly spaced wildflowers
      const soilDepth = Math.min(6, ROWS - ground - 1);
      for (let r = ground + 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const d = r - ground, hs = hash3(r, c, 21) % 100, i = r * COLS + c;
        if (d <= soilDepth) { if (hs < 70 - d * 5) glyph(r, c, hs % 3 === 0 ? ":" : hs % 3 === 1 ? "." : "'", (0.34 - d * 0.025) * gw, [0.6, 0.4, 0.25]); }
        else if (hs < 3) set(i, 0.1 * gw, [0.5, 0.36, 0.24]);
      }
      for (let c = 0; c < COLS; c++) {
        for (let k = 0; k < 3; k++) glyph(ground - k, c, "|!l/"[(c + k * 2) % 4], (0.5 + 0.06 * k) * gw, [0.1 + 0.03 * k, 0.4 + 0.05 * k, 0.17]);   // the mat
        for (let layer = 0; layer < 2; layer++) {          // tall back blades, shorter front blades
          const hgt = (layer ? 3 + 6 * rnd(c, 14) : 6 + 12 * rnd(c, 12)) * gw * (1 + 0.15 * FLICK * Math.sin(t * 2 + c * 0.3 + layer));
          const lean = FLICK * Math.sin(t * 1.5 + c * 0.2 + layer + 0.4 * Math.sin(t * 0.7)) * 2.6;
          for (let k = 0; k < hgt; k++) {
            const q = k / hgt, cc = c + Math.round(lean * q * q), ch = "|/\\!l"[(c * 3 + k + layer) % 5];
            glyph(ground - k + layer * 2, cc, ch, 0.55 + 0.3 * q, lerp3(layer ? [0.12, 0.5, 0.2] : [0.1, 0.36, 0.18], [0.75, 0.9, 0.42], q * q * (layer ? 0.9 : 1)));
          }
        }
      }
      const FLOWER_COLS = [[0.9, 0.3, 0.5], [0.95, 0.7, 0.12], [0.6, 0.38, 0.95], [0.95, 0.38, 0.28], [0.85, 0.82, 0.9]];
      const gap = 24, count = Math.floor(COLS / gap);
      for (let k = 0; k < count; k++) {                    // one wildflower every ~24 columns, with a little jitter in position and height
        const c0 = Math.round((k + 0.5) * gap + (rnd(k, 31) - 0.5) * 8), hgt = 12 + rnd(k, 32) * 8;
        const grown = smoothstep(2.4 + (k % 7) * 0.5, 4 + (k % 7) * 0.5, t);
        if (grown <= 0) continue;
        const q = grown * hgt, c1 = c0 + Math.round(FLICK * Math.sin(t * 1.5 + c0 * 0.2) * 2.6 * (q / 20) * (q / 20)), row = ground - Math.round(q);
        for (let d = 0; d < q; d++) glyph(ground - d, c0 + Math.round((c1 - c0) * (d / q) ** 2), "|", 0.6, [0.3, 0.7, 0.35]);
        if (grown > 0.6) {
          const bloom = FLOWER_COLS[k % FLOWER_COLS.length];
          glyph(row, c1, "@", 0.8, [0.95, 0.75, 0.2]);
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -2], [0, 2], [-1, -2], [-1, 2], [1, -2], [1, 2]]) glyph(row + dr, c1 + dc, "*", 0.7 * grown, bloom);
        }
      }
      if (!reduce) for (let k = 0; k < 40; k++) {          // petals drifting down
        const speed = 3 + rnd(k, 2) * 3, y = top - 4 + (t * speed + rnd(k, 3) * 200) % (ground - top + 4);
        const x = cx + (rnd(k, 1) - 0.5) * w * 1.2 + 4 * Math.sin(t * 0.9 + k);
        glyph(Math.round(y), Math.round(x), "~*.`"[k % 4], 0.55 * smoothstep(GROW, GROW + 1.5, t), PETALS[k % PETALS.length]);
      }
      fireflies(t, smoothstep(1, 4, t));
      // messages: down both sides of the bouquet on wide windows, one at a time underneath on narrow ones
      const L = toPx(cx - w / 2, top), R = toPx(cx + w / 2, top), hpx = h * CH * L.k, room = L.x - 30;
      let end;
      setTitle(t > 0.3 ? "Happy birthday, " + C.name : "");
      if (room >= 190) {
        setCap("");
        const rows = Math.ceil(n / 2);
        C.affirmations.forEach((msg, k) => {
          const el = this.notes[k], typed = Math.floor((t - (FIRST + k * EVERY)) * CPT), left = k % 2 === 0, idx = Math.floor(k / 2);
          const y = L.y + hpx * (0.1 + (0.8 / Math.max(1, rows)) * idx + (left ? 0 : 0.1)), wd = Math.min(330, room);
          el.style.width = wd + "px"; el.style.top = y + "px";
          el.style.left = (left ? L.x - 24 - wd : R.x + 24) + "px";
          if (typed > 0) typedSpans(el, msg, typed, false);
        });
        end = FIRST + (n - 1) * EVERY + 30 / CPT + 1.2;
      } else {
        const per = reduce ? 0.8 : 3, k = Math.min(n - 1, Math.max(0, Math.floor((t - FIRST) / per)));
        ui.cap.style.bottom = "auto"; ui.cap.style.top = "13vh";   // in the empty sky, clear of the bouquet and grass
        if (t >= FIRST) setCap(C.affirmations[k].slice(0, Math.floor((t - FIRST - k * per) * CPT)));
        end = FIRST + n * per + 0.5;
      }
      if (t > end && !this.btn) { this.btn = 1; showBtn("Replay", () => goto(0), true); }
    },
  };

  // ============================================================ scene manager
  const scenes = [countdown, curtain, party, magic, cake, letter, garden];
  let cur = Number(Q.get("scene")) || 0, t0 = performance.now() - (Number(Q.get("t")) || 0) * 1000, exiting = null;
  const sceneTime = () => (performance.now() - t0) / 1000;
  const fadeEls = [ui.cap, ui.title, ui.notes];

  function showBtn(label, fn, corner) {
    btn.classList.toggle("corner", !!corner);              // corner: bottom-right, out of the way of the picture
    btn.textContent = label; btn.hidden = false;
    btn.onclick = () => { btn.hidden = true; fn(); };
    btn.focus({ preventScroll: true });
  }
  let touchY = null;
  const feed = (d) => { if (!exiting && scenes[cur].scroll) scenes[cur].scroll(d); };
  addEventListener("wheel", (e) => { feed(e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY); }, { passive: true });
  addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  addEventListener("touchmove", (e) => { if (touchY !== null) { const y = e.touches[0].clientY; feed((touchY - y) * 2.2); touchY = y; } }, { passive: true });
  addEventListener("touchend", () => { touchY = null; });
  addEventListener("keydown", (e) => { if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { feed(260); e.preventDefault(); } });
  function goto(i) { if (!exiting) { btn.hidden = true; exiting = { to: i, at: performance.now() }; } }
  function enter(i, now) {
    clearUI(); cur = i; t0 = now;
    useGrid(scenes[cur].grid); scenes[cur].start();
  }

  useGrid(scenes[cur].grid); scenes[cur].start();
  let lastDraw = -1e9;
  function tick(now) {
    if (now - lastDraw >= 1000 / FPS - 2) {
      lastDraw = now;
      const t = (now - t0) / 1000;
      const res = scenes[cur].frame(t, sceneTime);
      if (res === "next") goto((cur + 1) % scenes.length);
      let fade = smoothstep(0, 0.6, t);
      if (exiting) {
        const ef = (now - exiting.at) / 450;
        fade *= 1 - clamp(ef);
        for (const el of fadeEls) el.style.opacity = String(1 - clamp(ef));
        if (ef >= 1) { enter(exiting.to, now); exiting = null; for (const el of fadeEls) el.style.opacity = ""; }
      }
      if (fade < 1) for (let i = 0; i < N; i++) lum[i] *= fade;
      curFade = fade;
      draw(Math.floor(t * FPS));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  let resizeTimer = 0;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 250); });
})();
