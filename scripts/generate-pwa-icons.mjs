// Gera os ícones PWA (192, 512, 512 maskable, apple-touch-icon) sem
// dependências externas — encoder PNG mínimo via zlib nativo do Node.
// Desenha o mesmo glifo da marca Agentise: quadrado arredondado escuro
// (--bg-primary) com um "chat bubble" em degradê azul (--accent-primary
// → --accent-secondary), reaproveitando os tokens do design system.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'public');

const BG = [10, 10, 15]; // #0A0A0F
const ACCENT_A = [30, 58, 138]; // #1E3A8A
const ACCENT_B = [59, 130, 246]; // #3B82F6

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function roundedRectMask(x, y, w, h, r, px, py) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  if (px >= x + r && px <= x + w - r) return py >= y && py <= y + h;
  if (py >= y + r && py <= y + h - r) return px >= x && px <= x + w;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// Desenha o glifo dentro de um quadrado de lado `size`, com a marca
// ocupando a fração `scale` (permite folga extra nos ícones "maskable").
function drawIcon(size, { scale, maskable = false }) {
  const rgba = Buffer.alloc(size * size * 4);
  const bgRadius = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inBg = maskable || roundedRectMask(0, 0, size, size, bgRadius, x + 0.5, y + 0.5);
      if (!inBg) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
        continue;
      }
      rgba[i] = BG[0];
      rgba[i + 1] = BG[1];
      rgba[i + 2] = BG[2];
      rgba[i + 3] = 255;
    }
  }

  // "Chat bubble" central: quadrado arredondado em degradê azul com uma
  // pequena "cauda" — mesma linguagem visual do glass-card do produto.
  const markSize = size * scale;
  const mx = (size - markSize) / 2;
  const my = (size - markSize) / 2 - size * 0.02;
  const markRadius = markSize * 0.28;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inMark = roundedRectMask(mx, my, markSize, markSize * 0.78, markRadius, x + 0.5, y + 0.5);
      const tailY0 = my + markSize * 0.78 - markSize * 0.02;
      const tailY1 = my + markSize * 0.78 + markSize * 0.16;
      const tailX0 = mx + markSize * 0.18;
      const tailX1 = mx + markSize * 0.42;
      const inTail =
        x + 0.5 >= tailX0 &&
        x + 0.5 <= tailX1 &&
        y + 0.5 >= tailY0 &&
        y + 0.5 <= tailY1 &&
        x + 0.5 - tailX0 <= (tailX1 - tailX0) * (1 - (y + 0.5 - tailY0) / (tailY1 - tailY0));

      if (!inMark && !inTail) continue;

      const t = (y - my) / (markSize * 0.78);
      const r = Math.round(lerp(ACCENT_A[0], ACCENT_B[0], Math.min(Math.max(t, 0), 1)));
      const g = Math.round(lerp(ACCENT_A[1], ACCENT_B[1], Math.min(Math.max(t, 0), 1)));
      const b = Math.round(lerp(ACCENT_A[2], ACCENT_B[2], Math.min(Math.max(t, 0), 1)));

      const i = (y * size + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }

  return rgba;
}

const targets = [
  { name: 'pwa-192.png', size: 192, scale: 0.56 },
  { name: 'pwa-512.png', size: 512, scale: 0.56 },
  { name: 'pwa-512-maskable.png', size: 512, scale: 0.4, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, scale: 0.6 },
];

for (const t of targets) {
  const rgba = drawIcon(t.size, { scale: t.scale, maskable: t.maskable });
  const png = encodePNG(t.size, t.size, rgba);
  writeFileSync(path.join(outDir, t.name), png);
  console.log(`✓ ${t.name} (${t.size}x${t.size}, ${png.length} bytes)`);
}
