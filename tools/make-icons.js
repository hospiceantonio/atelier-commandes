/* =========================================================
   Génère les icônes PNG de la PWA (aiguille + fil doré).
   Aucune dépendance : rendu par fonctions de distance + encodeur PNG maison.
   Usage : node tools/make-icons.js
   ========================================================= */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---------- Encodeur PNG minimal (RGBA, sans entrelacement) ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtre "None"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- Fonctions de distance (coordonnées normalisées 0..1) ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function sdRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - halfW + r;
  const qy = Math.abs(py - cy) - halfH + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Segment à rayon variable (aiguille effilée), échantillonné. */
function sdTaperedSegment(px, py, ax, ay, bx, by, r1, r2, steps = 160) {
  let d = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = mix(ax, bx, t);
    const y = mix(ay, by, t);
    d = Math.min(d, Math.hypot(px - x, py - y) - mix(r1, r2, t));
  }
  return d;
}

/** Distance à une courbe de Bézier cubique épaissie (le fil). */
function sdThread(px, py, pts, r) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    d = Math.min(d, Math.hypot(px - pts[i][0], py - pts[i][1]) - r);
  }
  return d;
}

function bezierPoints(p0, p1, p2, p3, steps = 220) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

/* ---------- Composition de l'icône ---------- */
const INDIGO_TOP = [46, 49, 146];
const INDIGO_BOTTOM = [17, 19, 74];
const SILVER_LIGHT = [246, 247, 252];
const SILVER_DARK = [178, 186, 214];
const GOLD = [240, 180, 41];

/* Aiguille : base épaisse en haut à droite, pointe effilée en bas à gauche. */
const NEEDLE_BASE = [0.755, 0.225];
const NEEDLE_TIP = [0.275, 0.805];

/* Le fil part au-delà de la base, traverse le chas puis retombe en boucle. */
const THREAD = bezierPoints([0.715, 0.275], [0.33, 0.30], [0.20, 0.74], [0.56, 0.79]);

/* Le chas est posé exactement sur le fil : il le traverse vraiment. */
const EYE = (() => {
  const target = [
    mix(NEEDLE_BASE[0], NEEDLE_TIP[0], 0.11),
    mix(NEEDLE_BASE[1], NEEDLE_TIP[1], 0.11),
  ];
  let best = THREAD[0];
  let bestD = Infinity;
  for (const p of THREAD) {
    const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
})();

function shade(base, t) {
  return [
    Math.round(mix(base[0], 255, t)),
    Math.round(mix(base[1], 255, t)),
    Math.round(mix(base[2], 255, t)),
  ];
}

function over(dst, src, alpha) {
  dst[0] = mix(dst[0], src[0], alpha);
  dst[1] = mix(dst[1], src[1], alpha);
  dst[2] = mix(dst[2], src[2], alpha);
}

/**
 * @param {number} size    côté en pixels
 * @param {boolean} maskable  true = fond plein bord à bord + motif réduit (zone sûre)
 */
function renderIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const aa = 1.1 / size; // lissage ≈ 1 pixel
  const scale = maskable ? 0.72 : 1; // marge de sécurité pour les icônes masquables
  const bgRadius = maskable ? 0.5 : 0.22;
  const bgHalf = maskable ? 0.5 : 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;
      // Motif recentré/réduit pour laisser respirer la zone sûre des icônes masquables.
      const mx = 0.5 + (px - 0.5) / scale;
      const my = 0.5 + (py - 0.5) / scale;

      const bgTint = mix(0, 1, clamp((px * 0.35 + py * 0.75), 0, 1));
      const color = [
        mix(INDIGO_TOP[0], INDIGO_BOTTOM[0], bgTint),
        mix(INDIGO_TOP[1], INDIGO_BOTTOM[1], bgTint),
        mix(INDIGO_TOP[2], INDIGO_BOTTOM[2], bgTint),
      ];

      const dBg = sdRoundedBox(px, py, 0.5, 0.5, bgHalf, bgHalf, bgRadius);
      const bgAlpha = clamp(0.5 - dBg / aa, 0, 1);

      // Halo doux derrière le motif
      const dHalo = sdCircle(mx, my, 0.5, 0.52, 0.40);
      over(color, [255, 255, 255], clamp(0.5 - dHalo / 0.32, 0, 1) * 0.07);

      // Aiguille (chas visible : disque soustrait)
      const dNeedle = sdTaperedSegment(
        mx, my,
        NEEDLE_BASE[0], NEEDLE_BASE[1],
        NEEDLE_TIP[0], NEEDLE_TIP[1],
        0.046, 0.003
      );
      const dEye = sdCircle(mx, my, EYE[0], EYE[1], 0.032);
      const dMetal = Math.max(dNeedle, -dEye);
      const metalTint = clamp((mx - my + 0.55) * 0.9, 0, 1);
      const metal = [
        mix(SILVER_DARK[0], SILVER_LIGHT[0], metalTint),
        mix(SILVER_DARK[1], SILVER_LIGHT[1], metalTint),
        mix(SILVER_DARK[2], SILVER_LIGHT[2], metalTint),
      ];
      over(color, metal, clamp(0.5 - dMetal / aa, 0, 1));

      // Fil doré, passant par le chas
      const dThread = sdThread(mx, my, THREAD, 0.020);
      over(color, shade(GOLD, clamp((0.78 - my) * 0.5, 0, 0.35)), clamp(0.5 - dThread / aa, 0, 1));

      const i = (y * size + x) * 4;
      buf[i] = Math.round(color[0]);
      buf[i + 1] = Math.round(color[1]);
      buf[i + 2] = Math.round(color[2]);
      buf[i + 3] = Math.round(bgAlpha * 255);
    }
  }
  return encodePNG(size, size, buf);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
];

for (const [name, size, maskable] of targets) {
  const png = renderIcon(size, maskable);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`${name} — ${size}×${size} — ${(png.length / 1024).toFixed(1)} Ko`);
}
