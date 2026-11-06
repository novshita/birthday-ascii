(function () {
  "use strict";
  const C = window.CONFIG, A = window.ART;
  const { TAU, clamp, smoothstep, easeOut, lerp3, mul, hash3, rnd, BUCKETS, LEVELS, DIGITS, PALETTES } = A;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const Q = new URLSearchParams(location.search);          // debug: ?scene=1&t=4  (&blown for the cake)

  // ============================================================ grid + canvas
  const FPS = 30, FONT_SIZE = 12;
  const FONT = `${FONT_SIZE}px Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace`;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = FONT;
  const CW = Math.max(1, Math.round(probe.measureText("M").width)), CH = Math.round(FONT_SIZE * 1.15);
  const ASPECT = CW / CH;                                  // a cell is about half as wide as it is tall
  const BG = "#0b0919";

  const view = document.getElementById("view"), ctx = view.getContext("2d");
  const btn = document.getElementById("next"), sr = document.getElementById("sr");
  const ascii = document.createElement("canvas"), actx = ascii.getContext("2d");
  const glows = [2, 4, 8].map((s) => ({ s, el: document.createElement("canvas") }));
  let COLS, ROWS, N, W, H, S, lum, rgb, fx, img, px32, stars;

  function layout() {
    ROWS = Math.max(40, Math.floor(innerHeight / CH));
    COLS = Math.max(36, Math.floor(innerWidth / CW));
    N = COLS * ROWS; W = COLS * CW; H = ROWS * CH;
    S = Math.min(ROWS / 72, (COLS * ASPECT) / 88);         // art is drawn in a 72-row space, scaled to fit
    view.width = ascii.width = W; view.height = ascii.height = H;
    for (const g of glows) { g.el.width = Math.ceil(W / g.s); g.el.height = Math.ceil(H / g.s); }
    lum = new Float32Array(N); rgb = new Float32Array(N * 3); fx = new Int32Array(N);
    img = actx.createImageData(W, H); px32 = new Uint32Array(img.data.buffer);
    stars = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const h = hash3(r, c, 5);
      if (h % 100 < 2) stars.push({ i: r * COLS + c, p: (h >>> 8) % 628 / 100, warm: h % 3 === 0 });
    }
  }
  layout();

  // virtual (art) space <-> cells. Virtual x is centred, virtual y = 36 is the middle of the screen.
  const vX = (c) => (c + 0.5 - COLS / 2) * ASPECT / S;
  const vY = (r) => (r + 0.5 - ROWS / 2) / S + 36;
  const cOf = (x) => x * S / ASPECT + COLS / 2 - 0.5;
  const rOf = (y) => (y - 36) * S + ROWS / 2 - 0.5;
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
    const i = r * COLS + c; set(i, l, col); fx[i] = ch.codePointAt(0);
  }
  function text(r, c, str, l, col) {
    for (let k = 0; k < str.length; k++) if (str[k] !== " ") glyph(r, c + k, str[k], l, col);
  }
  const textC = (r, str, l, col) => text(r, Math.round((COLS - str.length) / 2), str, l, col);

  // ============================================================ renderer (cells -> characters -> glow)
  const CHARS = BUCKETS.join(""), START = [], COUNT = BUCKETS.map((b) => b.length);
  BUCKETS.reduce((s, b, k) => { START[k] = s; return s + b.length; }, 0);
  const masks = new Map();
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
  const BUCKET_CODES = [...CHARS].map((ch) => ch.codePointAt(0));
  const GLOW = 0.7;

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
    const off = Math.floor(t * 4);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (lum[i] < 0.1 && hash3(c, r + off, 77) % 1000 < 2) set(i, 0.5 * a, [1, 0.8, 0.4]);
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
      set(i, l, col);
    });
  }

  const countdown = {
    start() { say("Counting down to " + C.age); },
    frame(t) {
      backdrop(t);
      const n = C.countdownFrom;
      if (t < n) {
        const step = Math.floor(t), lt = t - step;
        drawNumber(String(n - step), 32, 1 + 0.35 * (1 - easeOut(lt * 3)), 1 - smoothstep(0.78, 1, lt), t, false);
        textC(rowAt(58), "Counting down to " + C.age, 0.7, [0.7, 0.75, 1]);
      } else {
        const lt = t - n;
        drawNumber(String(C.age), 32, 1 + 0.5 * (1 - easeOut(lt * 2.2)), smoothstep(0, 0.35, lt), t, true);
        if (!reduce) confetti(lt, 0, 32, 90, 3);
        const a = smoothstep(0.8, 1.6, lt);
        if (a > 0) textC(rowAt(58), "Happy birthday, " + C.name, 0.9 * a, CREAM);
        if (lt > 4.2) return "next";
      }
    },
  };

  // ============================================================ scene 2: cake
  const CANDLES = [-16, -8, 0, 8, 16];
  const CANDLE_COLS = [[1, 0.5, 0.65], [0.55, 0.8, 1], [1, 0.85, 0.4], [0.7, 0.55, 1], [0.5, 0.9, 0.6]];
  const drip = (x) => 2.2 + 2.4 * (0.5 + 0.5 * Math.sin(x * 0.55)) + 2.0 * Math.max(0, Math.sin(x * 1.35 + 1.1));

  function tier(hw, yTop, yBot, sponge, frost, warm) {
    paint(-hw - 1, yTop - 3, hw + 1, yBot + 3, (i, x, y) => {
      const ex = x / hw, ey = (y - yTop) / 2.6, cyl = Math.sqrt(Math.max(0, 1 - ex * ex));
      if (Math.abs(ex) < 1 && ex * ex + ey * ey < 1) {     // top face
        set(i, (0.5 + 0.14 * (1 - ey * ey)) * warm, frost); return;
      }
      if (Math.abs(ex) >= 1 || y < yTop || y > yBot + 2.4 * cyl) return;
      const yd = y - yTop, h = yBot - yTop;
      let col, l = (0.3 + 0.4 * cyl) * warm;
      if (yd < drip(x)) { col = lerp3(frost, [0.9, 0.45, 0.62], 0.3 * (1 - cyl)); l += 0.1; }
      else if (yd > h * 0.5 && yd < h * 0.5 + 1.5) { col = [0.95, 0.3, 0.42]; l += 0.05; }
      else if (yd > h * 0.5 - 1.8 && yd <= h * 0.5) { col = [1, 0.92, 0.78]; }
      else col = sponge;
      set(i, clamp(l), col);
    });
  }

  const cake = {
    blowAt: null, btn: 0, btn2: 0,
    start() { this.blowAt = Q.has("blown") ? 0 : null; this.btn = this.btn2 = 0; say("A cake with five candles. Make a wish."); },
    frame(t, T) {
      backdrop(t);
      const out = (k) => this.blowAt === null ? 0 : smoothstep(this.blowAt + k * 0.16, this.blowAt + k * 0.16 + 0.4, t);
      let alive = 0;
      for (let k = 0; k < CANDLES.length; k++) alive += 1 - out(k);
      const flick = 0.93 + 0.07 * Math.sin(t * 11 * FLICK) * Math.sin(t * 5.3 * FLICK);
      const warm = 0.62 + 0.38 * (alive / CANDLES.length) * flick;
      // plate
      paint(-42, 55, 42, 62, (i, x, y) => {
        const q = (x / 41) ** 2 + ((y - 58.5) / 3) ** 2;
        if (q < 1) set(i, (0.35 + 0.35 * (1 - q)) * warm, [0.78, 0.8, 0.9]);
      });
      tier(30, 41, 56, [0.5, 0.26, 0.14], [0.95, 0.6, 0.74], warm);
      tier(20, 27, 41, [0.55, 0.3, 0.16], [0.9, 0.66, 0.9], warm);
      for (let px = -26; px <= 26; px += 5.2) {            // pearls on the bottom tier
        paint(px - 1.4, 51, px + 1.4, 54, (i, x, y) => {
          const q = ((x - px) / 1.2) ** 2 + ((y - 52.8) / 1.1) ** 2;
          if (q < 1) set(i, (0.7 - 0.2 * q) * warm, [0.95, 0.85, 0.65]);
        });
      }
      // candles, flames, smoke
      CANDLES.forEach((cx, k) => {
        paint(cx - 1.3, 16, cx + 1.3, 28, (i, x, y) => {
          if (Math.abs(x - cx) < 1.15 && y > 17 && y < 27.6) {
            const stripe = Math.floor((y + 40) / 1.7) % 2;
            set(i, (0.55 + 0.25 * (1 - Math.abs(x - cx) / 1.15)) * warm, mul(CANDLE_COLS[k], stripe ? 1 : 0.62));
          } else if (Math.abs(x - cx) < 0.35 && y > 15.8 && y <= 17) set(i, 0.5, [0.3, 0.25, 0.25]);
        });
        const life = 1 - out(k);
        if (life > 0.02) {
          const h = 8.5 * life * (1 + 0.14 * FLICK * Math.sin(t * 13 + k * 3)), sway = FLICK * (0.8 * Math.sin(t * 9 + k * 2) + 0.5 * Math.sin(t * 15 + k));
          paint(cx - 4, 16.5 - h - 1, cx + 4, 17, (i, x, y) => {
            const u = (16.5 - y) / h;
            if (u < 0 || u > 1) return;
            const hw = 1.7 * Math.sin(Math.PI * Math.pow(u, 0.6)) * (1 - 0.3 * u) * life, dx = x - (cx + sway * u * u);
            if (Math.abs(dx) > hw) return;
            const core = 1 - Math.abs(dx) / (hw + 1e-3);
            const col = u < 0.14 ? [0.45, 0.65, 1] : lerp3([1, 0.5, 0.1], [1, 0.95, 0.6], core * 1.2 - u * 0.4);
            set(i, clamp(0.7 + 0.35 * core), col);
          });
        } else if (this.blowAt !== null) {                  // smoke after the flame goes out
          const age = t - (this.blowAt + k * 0.16 + 0.3), a = 1 - smoothstep(2, 3.4, age);
          if (age > 0 && a > 0) for (let d = 0; d < Math.min(15, age * 7); d++) {
            const sx = cx + 1.8 * Math.sin(d * 0.55 - t * 2) * (d / 14 + 0.25);
            glyph(Math.round(rOf(16 - d)), Math.round(cOf(sx)), d % 3 === 0 ? "~" : d % 3 === 1 ? "'" : ".", 0.4 * a * (1 - d / 16), [0.7, 0.7, 0.8]);
          }
        }
      });
      fireflies(t, smoothstep(1, 3, t) * warm);
      textC(rowAt(66), alive > 0 ? "Make a wish." : "May every wish come true.", 0.85, CREAM);
      if (this.blowAt === null && !this.btn && t > 2.4) {
        this.btn = 1;
        showBtn("Blow out the candles", () => { this.blowAt = T(); });
      }
      if (this.blowAt !== null && !this.btn2 && t > this.blowAt + 2.6) {
        this.btn2 = 1;
        showBtn("Open your letter", () => goto(2));
      }
    },
  };

  // ============================================================ scene 3: letter
  const CPS = reduce ? 1e6 : 28;
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

  function wrap(str, width) {                              // words -> lines of {ch, k} (k = index in the paragraph)
    const words = [...str.matchAll(/\S+/g)], lines = [];
    let line = [], len = 0;
    for (const w of words) {
      if (line.length && len + 1 + w[0].length > width) { lines.push(line); line = []; len = 0; }
      if (line.length) { line.push({ ch: " ", k: w.index - 1 }); len++; }
      for (let q = 0; q < w[0].length; q++) line.push({ ch: w[0][q], k: w.index + q });
      len += w[0].length;
    }
    if (line.length) lines.push(line);
    return lines;
  }

  const letter = {
    btn: 0,
    start() { this.btn = 0; say(C.letter.join(" ")); },
    frame(t) {
      backdrop(t);
      const width = Math.min(66, COLS - 12);
      const body = [];
      C.letter.forEach((p, pi) => { if (pi) body.push(null); wrap(p, width).forEach((ln) => body.push({ ln, pi })); });
      const bw = width + 6, bh = body.length + 4;
      const top = Math.max(1, Math.floor((ROWS - bh) / 2) - 1), left = Math.floor((COLS - bw) / 2);
      const edge = [0.8, 0.6, 0.35], ea = smoothstep(0, 0.8, t) * 0.5;
      const label = " a letter to myself ";
      for (let c = 0; c < bw; c++) {                       // frame
        const ch = c % 4 === 0 ? "+" : "-";
        glyph(top, left + c, ch, ea, edge); glyph(top + bh - 1, left + c, ch, ea, edge);
      }
      for (let r = 1; r < bh - 1; r++) { glyph(top + r, left, "|", ea, edge); glyph(top + r, left + bw - 1, "|", ea, edge); }
      const lc = left + Math.floor((bw - label.length) / 2);
      for (let k = 0; k < label.length; k++) glyph(top, lc + k, label[k] === " " ? " " : label[k], label[k] === " " ? 0 : ea * 1.8, GOLD);
      let lastR = -1, lastC = 0, typed = 0;
      body.forEach((row, ri) => {
        if (!row) return;
        const r = top + 2 + ri;
        row.ln.forEach((cell, ci) => {
          const at = letterTimes[row.pi][cell.k];
          if (t < at) return;
          const fresh = Math.max(0, 1 - (t - at) * 3);
          const c = left + 3 + ci;
          glyph(r, c, cell.ch, 0.8 + 0.3 * fresh, row.pi === 0 ? ROSE : lerp3(CREAM, GOLD, fresh));
          lastR = r; lastC = c + 1; typed++;
        });
      });
      const done = t > letterEnd;
      if (!done && lastR >= 0 && Math.floor(t * 2.5) % 2 === 0) glyph(lastR, lastC, "_", 0.9, GOLD);
      fireflies(t, 0.6);
      if (done && !this.btn) { this.btn = 1; showBtn("Walk into the garden", () => goto(3)); }
    },
  };

  // ============================================================ scene 4: garden
  const GROUND = 60, STEM_T = 1.1, BLOOM_T = 1.4, GAP_T = reduce ? 0.3 : 1.5, T0 = reduce ? 0.3 : 0.8;
  const STEM_COL = [0.25, 0.58, 0.28], LEAF_D = [0.08, 0.36, 0.14], LEAF_L = [0.4, 0.78, 0.34];
  const sway = (y, i, t) => FLICK * (1.2 * Math.sin(t * 1.6 + i * 0.8) + 0.5 * Math.sin(t * 3.1 + i)) * Math.pow(clamp((GROUND - y) / 36), 1.5);

  function wrapPlain(str, width) {
    const out = []; let line = "";
    for (const w of str.split(" ")) {
      if (line && (line + " " + w).length > width) { out.push(line); line = w; } else line = line ? line + " " + w : w;
    }
    if (line) out.push(line);
    return out;
  }

  const garden = {
    btn: 0, flowers: [],
    start() {
      this.btn = 0;
      say("A garden. Each flower blooms with a message: " + C.affirmations.join(" "));
    },
    build() {
      const n = C.affirmations.length, widthU = COLS * ASPECT / S;
      const spacing = Math.min(19, (widthU - 8) / n);
      this.spacing = spacing;
      this.flowers = C.affirmations.map((msg, i) => ({
        msg, i, x: (i - (n - 1) / 2) * spacing, yt: 24 + Math.round(rnd(i, 4) * 14), size: Math.min(8.5, spacing * 0.46),
        bulge: (rnd(i, 5) - 0.5) * 5, pal: PALETTES[i % PALETTES.length], spin: rnd(i, 6) * TAU,
        s: T0 + i * GAP_T,
      }));
    },
    stemX(f, s, y, t) { return f.x + f.bulge * Math.sin(Math.PI * s) * 1 + sway(y, f.i, t); },
    frame(t) {
      backdrop(t);
      this.build();
      const textCols = Math.floor(this.spacing * S / ASPECT) - 2, under = textCols >= 14;
      const wrapW = Math.min(26, textCols);
      // stems and leaves
      for (const f of this.flowers) {
        const g = easeOut((t - f.s) / STEM_T);
        if (g <= 0) continue;
        const H0 = GROUND - f.yt, yTip = GROUND - g * H0;
        paint(f.x - 10, yTip - 1, f.x + 10, GROUND + 1, (i, x, y) => {
          const s = (GROUND - y) / H0;
          if (s < 0 || s > g) return;
          const w = 0.9 - 0.3 * s, d = Math.abs(x - this.stemX(f, s, y, t));
          if (d < w) set(i, 0.5 + 0.3 * (1 - d / w), lerp3(STEM_COL, [0.5, 0.8, 0.45], 0.4 - d / w * 0.3));
        });
        [[0.3, -1], [0.5, 1]].forEach(([ls, side], li) => {
          const gs = smoothstep(ls, ls + 0.3, g);
          if (gs <= 0) return;
          const py = GROUND - ls * H0, px = this.stemX(f, ls, py, t);
          const ang = (28 + 8 * li) * Math.PI / 180, dx = side * Math.cos(ang), dy = -Math.sin(ang);
          const a = 6.5 * gs, b = 2.1 * gs, cx = px + dx * a, cy = py + dy * a;
          paint(cx - a - 2, cy - a - 2, cx + a + 2, cy + a + 2, (i, x, y) => {
            const ex = x - cx, ey = y - cy, lx = ex * dx + ey * dy, ly = -ex * dy + ey * dx;
            const q = (lx / a) ** 2 + (ly / b) ** 2;
            if (q >= 1) return;
            const lit = ly < 0 ? 1 : 0.55, rib = Math.abs(ly) < 0.3 * gs;
            set(i, (0.38 + 0.3 * lit + 0.2 * (1 - q)) * (rib ? 1.2 : 1), lerp3(LEAF_D, LEAF_L, lit * 0.7 + (1 - q) * 0.3));
          });
        });
      }
      // flower heads
      for (const f of this.flowers) {
        const g = easeOut((t - f.s) / STEM_T);
        if (g <= 0.05) continue;
        const H0 = GROUND - f.yt, yTip = GROUND - g * H0, hx = this.stemX(f, g, yTip, t), hy = yTip;
        const open = smoothstep(f.s + STEM_T + 0.2, f.s + STEM_T + 0.2 + BLOOM_T, t);
        const R = f.size * g * (0.34 + 0.66 * easeOut(open));
        const op = smoothstep(0.15, 0.7, open), pal = f.pal;
        paint(hx - R - 1.5, hy - R - 2.5, hx + R + 1.5, hy + R + 1.5, (i, x, y) => {
          const dx = x - hx, dy = y - hy, r = Math.hypot(dx, dy);
          if (open < 0.15) {                                // closed bud
            const q = (dx / (R * 0.62)) ** 2 + ((dy + R * 0.2) / (R * 0.95)) ** 2;
            if (q < 1) set(i, 0.55 + 0.3 * (1 - q), lerp3([0.35, 0.7, 0.3], pal.mid, smoothstep(0.1, 0.9, (hy - y) / R * 0.5 + 0.5) * (0.4 + open * 4)));
            return;
          }
          const th = Math.atan2(dy, dx) + f.spin, lobe = Math.pow(Math.abs(Math.cos(4.5 * th)), 0.65);
          const Rp = R * (1 - 0.42 * op + 0.42 * op * lobe);
          if (r >= Rp) return;
          const u = r / Rp;
          if (u < 0.24) {                                   // seed disc
            const dot = hash3(Math.round(x * 3), Math.round(y * 3), 9) % 100 < 35;
            set(i, dot ? 0.75 : 0.5, lerp3([0.45, 0.25, 0.08], GOLD, (1 - u / 0.24) * 0.9 + (dot ? 0.2 : 0)));
            return;
          }
          let col = lerp3(pal.deep, pal.mid, smoothstep(0.2, 0.6, u));
          col = lerp3(col, pal.tip, smoothstep(0.62, 1, u) * 0.85);
          set(i, 0.3 + 0.28 * lobe + 0.12 * (1 - u) + (u > 0.9 ? 0.06 : 0), mul(col, 0.7 + 0.3 * lobe));
        });
      }
      // grass over the stem bases, soil underneath
      const gr = rowAt(GROUND);
      for (let c = 0; c < COLS; c++) {
        const hgt = (1.2 + 3.4 * rnd(c, 12)) * (1 + 0.25 * FLICK * Math.sin(t * 2 + c * 0.3)), lean = Math.round(FLICK * Math.sin(t * 1.5 + c * 0.2));
        for (let k = 0; k < hgt; k++) {
          const f = k / hgt, r = gr - k, cc = c + Math.round(lean * f);
          if (r < 0 || cc < 0 || cc >= COLS) continue;
          const i = r * COLS + cc;
          set(i, 0.42 + 0.35 * f, lerp3([0.2, 0.45, 0.25], [0.85, 0.78, 0.4], f * f));
          fx[i] = "\"/|'`"[Math.floor(rnd(c, 13) * 5)].codePointAt(0);
        }
        for (let r = gr + 1; r < ROWS; r++) {
          const i = r * COLS + c, h = hash3(r, c, 21) % 100;
          if (h < 14) set(i, 0.1 + 0.08 * ((h % 5) / 5), [0.45, 0.32, 0.22]);
        }
      }
      // affirmations
      this.flowers.forEach((f) => {
        const at = f.s + STEM_T + 0.2 + BLOOM_T * 0.5, typed = Math.floor((t - at) * 24);
        if (typed <= 0) return;
        const cols = lerp3(f.pal.tip, CREAM, 0.35), shown = f.msg.slice(0, typed);
        if (under) {
          const lines = wrapPlain(f.msg, wrapW);
          let n = 0;
          lines.forEach((ln, li) => {
            const part = shown.slice(n, n + ln.length + 1).slice(0, ln.length); n += ln.length + 1;
            if (!part) return;
            text(rowAt(GROUND + 4) + li, Math.round(cOf(f.x) - ln.length / 2), part, 0.9, cols);
          });
        }
      });
      if (!under) {                                        // narrow screens: one caption at a time
        const live = this.flowers.filter((f) => t > f.s + STEM_T + 0.2 + BLOOM_T * 0.5).pop();
        if (live) {
          const typed = Math.floor((t - (live.s + STEM_T + 0.2 + BLOOM_T * 0.5)) * 24), cw = Math.min(COLS - 4, 40);
          let n = 0;
          wrapPlain(live.msg, cw).forEach((ln, li) => {
            const part = live.msg.slice(n, n + ln.length).slice(0, Math.max(0, typed - n)); n += ln.length + 1;
            if (part) textC(rowAt(GROUND + 4) + li, part.padEnd(ln.length, " ").slice(0, ln.length), 0.9, lerp3(live.pal.tip, CREAM, 0.35));
          });
        }
      }
      const head = "Happy birthday, " + C.name, ha = smoothstep(0.3, 1.2, t);
      textC(rowAt(7), head, 0.95 * ha, GOLD);
      fireflies(t, smoothstep(1, 4, t));
      const last = this.flowers[this.flowers.length - 1];
      const end = last.s + STEM_T + 0.2 + BLOOM_T * 0.5 + last.msg.length / 24 + 1.2;
      if (t > end && !this.btn) { this.btn = 1; showBtn("Replay", () => goto(0)); }
    },
  };

  // ============================================================ scene manager
  const scenes = [countdown, cake, letter, garden];
  let cur = Number(Q.get("scene")) || 0, t0 = performance.now() - (Number(Q.get("t")) || 0) * 1000, exiting = null;
  const sceneTime = () => (performance.now() - t0) / 1000;

  function showBtn(label, fn) {
    btn.textContent = label; btn.hidden = false;
    btn.onclick = () => { btn.hidden = true; fn(); };
    btn.focus({ preventScroll: true });
  }
  function goto(i) { if (!exiting) { btn.hidden = true; exiting = { to: i, at: performance.now() }; } }

  scenes[cur].start();
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
        if (ef >= 1) { cur = exiting.to; exiting = null; t0 = now; scenes[cur].start(); }
      }
      if (fade < 1) for (let i = 0; i < N; i++) lum[i] *= fade;
      draw(Math.floor(t * FPS));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 250);                 // rebuild the grid, keep the scene running
  });
})();
