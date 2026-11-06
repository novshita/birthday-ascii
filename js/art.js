// Shared maths and static art data. Scenes are drawn in main.js.
window.ART = (function () {
  const TAU = Math.PI * 2;
  const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const lerp3 = (a, b, k) => {
    k = clamp(k);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  function hash3(a, b, c) {                    // stable pseudo-random: same input, same output
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  const rnd = (k, salt = 0) => hash3(k, 911 + salt, 37) / 4294967296;   // 0..1

  // Characters ordered from thin to dense. The renderer picks one by brightness.
  const BUCKETS = [" ", ".'`", ":;,-~", "!/\\|()[]{}<>?+=", "tfjrxnuvczil", "XYUJCLQ0OZmwqpdbkhao", "#MW&8%B", "@$"];
  const LEVELS = [0.06, 0.15, 0.30, 0.45, 0.60, 0.75, 0.90];

  // 5x7 block font for the big countdown digits.
  const DIGITS = {
    0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  };

  // Flower colours: deep (centre of petal) -> mid -> tip (rim).
  const PALETTES = [
    { deep: [0.62, 0.02, 0.30], mid: [0.96, 0.28, 0.55], tip: [1.00, 0.84, 0.92] },   // rose
    { deep: [0.92, 0.50, 0.04], mid: [1.00, 0.76, 0.16], tip: [1.00, 0.94, 0.62] },   // amber
    { deep: [0.36, 0.14, 0.70], mid: [0.68, 0.52, 1.00], tip: [0.90, 0.84, 1.00] },   // lilac
    { deep: [0.10, 0.34, 0.70], mid: [0.40, 0.72, 1.00], tip: [0.86, 0.95, 1.00] },   // sky
    { deep: [0.80, 0.22, 0.02], mid: [1.00, 0.48, 0.10], tip: [1.00, 0.76, 0.46] },   // orange
    { deep: [0.62, 0.78, 0.40], mid: [0.96, 0.96, 0.90], tip: [1.00, 1.00, 0.98] },   // white
    { deep: [0.88, 0.30, 0.22], mid: [1.00, 0.56, 0.46], tip: [1.00, 0.86, 0.78] },   // coral
  ];

  return { TAU, clamp, smoothstep, easeOut, lerp3, mul, hash3, rnd, BUCKETS, LEVELS, DIGITS, PALETTES };
})();
