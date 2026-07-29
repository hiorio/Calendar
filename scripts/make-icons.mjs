/**
 * 앱 아이콘 생성기.
 *
 *   node scripts/make-icons.mjs
 *
 * 마크는 **열두 장의 꽃잎이 한 점에서 퍼져 나가는 모습**이다. 이름(TimeFlower)의 두
 * 조각을 하나의 도형이 같이 말한다.
 *
 *   - 시간 — 꽃잎이 열두 장이고 30도씩 정확히 나뉜다. 시계의 열두 시각이자 열두 달이다.
 *   - 꽃 — 길이가 한 바퀴 도는 동안 완만하게 오르내려서, 기계적인 방사가 아니라 한쪽으로
 *     기울어 핀 꽃으로 읽힌다.
 *
 * 바탕은 종이 같은 크림색이고 꽃은 테라코타다. 색을 넓게 칠하는 대신 여백을 넓게 두는
 * 쪽을 골랐다 — 아이콘이 홈 화면에서 소리치지 않고 가라앉기를 바랐다.
 *
 * 외부 라이브러리를 쓰지 않는다. 도형이 부호거리로 정의되므로 안티에일리어싱까지 직접
 * 계산할 수 있고, PNG 인코딩은 zlib 로 끝난다. **PNG 를 손으로 고치지 말고 이 스크립트를
 * 고친 뒤 다시 돌릴 것.**
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ── 브랜드 색 ───────────────────────────────────────────────────────────
// `src/constants/theme.ts` 와 같은 색이다. 아이콘만 따로 예쁜 색을 쓰면 앱을 열었을 때
// 다른 앱을 연 것처럼 보인다. 바탕은 light `background`(#F5F0E7) 언저리,
// 꽃은 light `accent`(#A94E32) 를 가운데 값으로 하는 그라디언트다.
/** 종이 바탕. 위에서 아래로 아주 조금 가라앉는다. */
const PAPER_TOP = [247, 241, 232];
const PAPER_BOTTOM = [235, 225, 210];
/** 꽃잎. 위가 밝고 아래가 깊다. */
const PETAL_TOP = [206, 112, 74];
const PETAL_BOTTOM = [166, 70, 42];

// ── 부호거리 ───────────────────────────────────────────────────────────
/**
 * 굵기가 변하는 선분까지의 거리. `r1`(a 끝) 에서 `r2`(b 끝) 로 반지름이 선형으로
 * 변한다. 꽃잎은 중심 쪽이 가늘고 바깥이 도톰해야 해서 원기둥(capsule)으로는 안 된다.
 *
 * Inigo Quilez 의 round-cone 공식을 2D 로 옮긴 것.
 */
function roundConeDistance(px, py, ax, ay, bx, by, r1, r2) {
  const bax = bx - ax;
  const bay = by - ay;
  const l2 = bax * bax + bay * bay;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;

  const pax = px - ax;
  const pay = py - ay;
  const y = pax * bax + pay * bay;
  const z = y - l2;

  const qx = pax * l2 - bax * y;
  const qy = pay * l2 - bay * y;
  const x2 = qx * qx + qy * qy;
  const y2 = y * y * l2;
  const z2 = z * z * l2;

  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/**
 * 타원까지의 거리(근사). 정확한 타원 부호거리는 4차 방정식이라, 원으로 되돌린 뒤
 * 짧은 반지름을 곱해 되돌린다. 가장자리 한두 픽셀을 부드럽게 하는 용도로는 충분하다.
 */
function ellipseDistance(px, py, cx, cy, cos, sin, halfLength, halfWidth) {
  const dx = px - cx;
  const dy = py - cy;
  const along = dx * cos + dy * sin;
  const across = -dx * sin + dy * cos;
  const k = Math.hypot(along / halfLength, across / halfWidth);
  return (k - 1) * Math.min(halfLength, halfWidth);
}

/**
 * 두 부호거리를 부드럽게 잇는다. 그냥 `Math.min` 으로 합치면 두 도형이 만나는 자리에
 * 각이 생겨서 꽃잎이 마름모로 보인다. `k` 만큼의 폭에서 곡선으로 넘어가게 한다.
 */
function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ── 캔버스 ─────────────────────────────────────────────────────────────
function createCanvas(size) {
  return { size, data: new Float64Array(size * size * 4) };
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * 종이 바탕. 세로 그라디언트에 가장자리로 갈수록 아주 옅은 그늘을 얹는다.
 *
 * 그늘이 없으면 크림색 단색이 화면에서 그냥 흰 사각형으로 보인다. 값을 키우면 금세
 * 지저분해지니 눈에 겨우 걸릴 만큼만 준다.
 */
function fillPaper(canvas) {
  const { size, data } = canvas;
  const half = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    const base = lerp(PAPER_TOP, PAPER_BOTTOM, y / (size - 1));
    for (let x = 0; x < size; x++) {
      // 중심에서의 거리(0~1). 모서리가 1을 넘으므로 잘라 쓴다.
      const r = Math.min(Math.hypot((x - half) / half, (y - half) / half), 1);
      const shade = 1 - 0.05 * r * r;

      const i = (y * size + x) * 4;
      data[i] = base[0] * shade;
      data[i + 1] = base[1] * shade;
      data[i + 2] = base[2] * shade;
      data[i + 3] = 255;
    }
  }
}

/** 부호거리 함수 하나를 캔버스에 얹는다. 색은 세로 위치로 정한다. */
function drawSdf(canvas, distance, { top, bottom, from, to, alpha = 1 }) {
  const { size, data } = canvas;

  for (let py = 0; py < size; py++) {
    const t = Math.min(Math.max((py - from) / (to - from), 0), 1);
    const color = lerp(top, bottom, t);

    for (let px = 0; px < size; px++) {
      const d = distance(px + 0.5, py + 0.5);
      const coverage = Math.min(Math.max(0.5 - d, 0), 1) * alpha;
      if (coverage <= 0) continue;

      const i = (py * size + px) * 4;
      const dstA = data[i + 3] / 255;
      const outA = coverage + dstA * (1 - coverage);
      for (let c = 0; c < 3; c++) {
        data[i + c] = (color[c] * coverage + data[i + c] * dstA * (1 - coverage)) / (outA || 1);
      }
      data[i + 3] = outA * 255;
    }
  }
}

/**
 * 꽃 마크. `box` 는 꽃이 차지할 정사각 영역의 비율(0~1)이다.
 * Android adaptive 아이콘은 바깥 33% 가 잘려 나가므로 좁게 잡는다.
 */
const PETALS = 12;

function drawFlower(canvas, { box = 0.62, top = PETAL_TOP, bottom = PETAL_BOTTOM } = {}) {
  const { size } = canvas;
  const center = size / 2;
  const reach = (size * box) / 2;

  // 꽃잎이 중심에서 조금 떨어져 시작한다. 한 점에 모으면 거기만 뭉쳐 검게 보인다.
  const innerRadius = reach * 0.24;

  for (let i = 0; i < PETALS; i++) {
    // 12시부터 시계 방향으로 30도씩. 열두 시각이자 열두 달이다.
    const angle = (i / PETALS) * Math.PI * 2 - Math.PI / 2;

    // 길이를 한 바퀴에 걸쳐 완만하게 흔든다. 전부 같은 길이면 방사형 별표가 되고,
    // 무작위로 흔들면 그냥 흐트러진다. 코사인 한 주기면 왼쪽 위로 기울어 핀 꽃이 된다.
    const bloom = 0.5 + 0.5 * Math.cos(angle + Math.PI * 0.75);
    const length = reach * (0.78 + 0.22 * bloom);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // 꽃잎 하나 = 잎 모양 타원 + 중심에서 뻗어 나온 가는 대. 둘을 부드럽게 이으면
    // 밑이 가늘고 가운데가 부풀고 끝이 둥근 꽃잎이 된다. 타원만 두면 씨앗처럼
    // 떠 있고, 대만 두면 막대로 보인다.
    const halfLength = (length - innerRadius) / 2;
    const bladeCenter = innerRadius + halfLength;
    const cx = center + cos * bladeCenter;
    const cy = center + sin * bladeCenter;

    const ax = center + cos * innerRadius;
    const ay = center + sin * innerRadius;

    const width = reach * 0.088;
    const stem = reach * 0.016;
    const blend = width * 0.55;

    drawSdf(
      canvas,
      (px, py) =>
        smoothMin(
          ellipseDistance(px, py, cx, cy, cos, sin, halfLength, width),
          roundConeDistance(px, py, ax, ay, cx, cy, stem, stem),
          blend,
        ),
      { top, bottom, from: center - reach, to: center + reach },
    );
  }
}

// ── PNG 인코딩 ─────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(canvas) {
  const { size, data } = canvas;
  // 각 줄 앞에 필터 바이트(0 = None)가 붙는다
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[p++] = Math.round(Math.min(Math.max(data[i], 0), 255));
      raw[p++] = Math.round(Math.min(Math.max(data[i + 1], 0), 255));
      raw[p++] = Math.round(Math.min(Math.max(data[i + 2], 0), 255));
      raw[p++] = Math.round(Math.min(Math.max(data[i + 3], 0), 255));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function save(path, canvas) {
  mkdirSync(dirname(path), { recursive: true });
  const png = encodePng(canvas);
  writeFileSync(path, png);
  console.log(`  ${path}  ${canvas.size}×${canvas.size}  ${(png.length / 1024).toFixed(1)} KB`);
}

// ── 만들기 ─────────────────────────────────────────────────────────────
console.log('아이콘 생성');

// 스토어·iOS 용 정사각. 바깥까지 색이 차야 한다.
{
  const c = createCanvas(1024);
  fillPaper(c);
  drawFlower(c, { box: 0.72 });
  save('assets/images/icon.png', c);
}

// Android adaptive — 배경과 전경을 따로 준다.
// 전경은 바깥 33% 가 잘릴 수 있어 꽃을 더 좁게 넣는다.
{
  const bg = createCanvas(1024);
  fillPaper(bg);
  save('assets/images/android-icon-background.png', bg);

  const fg = createCanvas(1024);
  drawFlower(fg, { box: 0.50 });
  save('assets/images/android-icon-foreground.png', fg);

  // 테마 아이콘(Android 13+). 시스템이 알파를 보고 단색으로 칠하므로 실루엣만 준다.
  const mono = createCanvas(1024);
  drawFlower(mono, { box: 0.50, top: [255, 255, 255], bottom: [255, 255, 255] });
  save('assets/images/android-icon-monochrome.png', mono);
}

// 스플래시 — 배경색은 app.json 이 칠하므로 꽃만.
{
  const c = createCanvas(512);
  drawFlower(c, { box: 0.9 });
  save('assets/images/splash-icon.png', c);
}

// 웹 파비콘. 작아서 꽃잎이 뭉개지므로 조금 크게 넣는다.
{
  const c = createCanvas(96);
  fillPaper(c);
  drawFlower(c, { box: 0.80 });
  save('assets/images/favicon.png', c);
}

console.log('완료');
