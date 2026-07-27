/**
 * 앱 아이콘 생성기.
 *
 *   node scripts/make-icons.mjs
 *
 * 마크는 **가로 막대 세 개가 쌓인 모습**이다. 이름(TimeLine)이 말하는 "시간이 한 줄로
 * 흐른다"와, 이 앱의 실제 화면에서 하루 칸에 일정이 색 막대로 쌓이는 모습을 그대로
 * 가져왔다. 길이가 제각각인 것은 일정 길이가 제각각이기 때문이고, 투명도가 다른 것은
 * 여러 사람의 일정이 겹치기 때문이다.
 *
 * 외부 라이브러리를 쓰지 않는다. 도형이 둥근 사각형뿐이라 부호거리로 커버리지를
 * 계산하면 안티에일리어싱까지 직접 할 수 있고, PNG 인코딩은 zlib 로 끝난다.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ── 브랜드 색 (docs/design-decisions.md · 살구) ─────────────────────────
const APRICOT_TOP = [232, 115, 76];
const APRICOT_BOTTOM = [201, 85, 47];

/** 둥근 사각형까지의 부호거리. 음수면 안쪽. */
function roundRectDistance(px, py, x, y, w, h, r) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = Math.max(Math.abs(px - cx) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(py - cy) - (h / 2 - r), 0);
  return Math.hypot(dx, dy) - r;
}

function createCanvas(size) {
  return { size, data: new Float64Array(size * size * 4) };
}

/** 세로 그라디언트로 배경을 채운다 */
function fillBackground(canvas, top, bottom) {
  const { size, data } = canvas;
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = top[0] + (bottom[0] - top[0]) * t;
    const g = top[1] + (bottom[1] - top[1]) * t;
    const b = top[2] + (bottom[2] - top[2]) * t;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

/** 둥근 사각형을 얹는다. 가장자리 1px 은 부호거리로 부드럽게. */
function drawRoundRect(canvas, x, y, w, h, r, color, alpha) {
  const { size, data } = canvas;
  const x0 = Math.max(0, Math.floor(x - 2));
  const x1 = Math.min(size, Math.ceil(x + w + 2));
  const y0 = Math.max(0, Math.floor(y - 2));
  const y1 = Math.min(size, Math.ceil(y + h + 2));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const d = roundRectDistance(px + 0.5, py + 0.5, x, y, w, h, r);
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
 * 마크를 그린다. `box` 는 막대가 들어갈 정사각 영역의 비율(0~1)이다.
 * Android adaptive 아이콘은 바깥이 잘려 나가므로 좁게 잡는다.
 */
function drawMark(canvas, { box = 0.62, color = [255, 255, 255] } = {}) {
  const { size } = canvas;
  const side = size * box;
  const left = (size - side) / 2;

  // 막대 셋 + 사이 간격 둘. 간격은 막대 높이의 0.55배.
  const barH = side / (3 + 2 * 0.55);
  const gap = barH * 0.55;
  const radius = barH * 0.4;
  const top = (size - (barH * 3 + gap * 2)) / 2;

  // 시작점을 한 칸씩 밀어 대각선 흐름을 만든다.
  //
  // 셋 다 왼쪽에 붙이고 길이만 다르게 하면 햄버거 메뉴처럼 읽힌다. 이름이 말하는
  // "시간이 흘러간다"가 보이려면 **시작 위치가 달라야** 한다. 실제로도 일정은
  // 저마다 다른 시각에 시작한다.
  //
  // 투명도가 다른 것은 여러 사람의 일정이 겹치기 때문이다.
  const bars = [
    { offset: 0.0, width: 0.6, alpha: 1.0 },
    { offset: 0.2, width: 0.6, alpha: 0.74 },
    { offset: 0.4, width: 0.6, alpha: 0.48 },
  ];

  bars.forEach((bar, index) => {
    drawRoundRect(
      canvas,
      left + side * bar.offset,
      top + index * (barH + gap),
      side * bar.width,
      barH,
      radius,
      color,
      bar.alpha,
    );
  });
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
  fillBackground(c, APRICOT_TOP, APRICOT_BOTTOM);
  drawMark(c, { box: 0.58 });
  save('assets/images/icon.png', c);
}

// Android adaptive — 배경과 전경을 따로 준다.
// 전경은 바깥 33%가 잘릴 수 있어 마크를 더 좁게 넣는다.
{
  const bg = createCanvas(1024);
  fillBackground(bg, APRICOT_TOP, APRICOT_BOTTOM);
  save('assets/images/android-icon-background.png', bg);

  const fg = createCanvas(1024);
  drawMark(fg, { box: 0.42 });
  save('assets/images/android-icon-foreground.png', fg);

  // 테마 아이콘(Android 13+). 시스템이 단색으로 칠하므로 흰 실루엣만 준다.
  const mono = createCanvas(1024);
  drawMark(mono, { box: 0.42 });
  save('assets/images/android-icon-monochrome.png', mono);
}

// 스플래시 — 배경색은 app.json 이 칠하므로 마크만.
{
  const c = createCanvas(512);
  drawMark(c, { box: 0.86 });
  save('assets/images/splash-icon.png', c);
}

// 웹 파비콘
{
  const c = createCanvas(96);
  fillBackground(c, APRICOT_TOP, APRICOT_BOTTOM);
  drawMark(c, { box: 0.6 });
  save('assets/images/favicon.png', c);
}

console.log('완료');
