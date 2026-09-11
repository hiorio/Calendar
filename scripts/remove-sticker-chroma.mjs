import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error('사용법: node scripts/remove-sticker-chroma.mjs <입력 PNG> <출력 PNG>');
}

const source = PNG.sync.read(fs.readFileSync(inputPath));
const key = averageCorners(source);
const keyMode =
  key[1] > key[0] * 1.25 && key[1] > key[2] * 1.25 ? 'green' : 'magenta';
const alpha = new Uint8Array(source.width * source.height);
const opaqueChroma = 52;
const transparentChroma = 112;

let minX = source.width;
let minY = source.height;
let maxX = -1;
let maxY = -1;

for (let y = 0; y < source.height; y += 1) {
  for (let x = 0; x < source.width; x += 1) {
    const offset = (y * source.width + x) * 4;
    const chroma = chromaStrength(
      source.data[offset],
      source.data[offset + 1],
      source.data[offset + 2],
      keyMode,
    );
    const normalized = clamp(
      (transparentChroma - chroma) / (transparentChroma - opaqueChroma),
      0,
      1,
    );
    const softened = normalized * normalized * (3 - 2 * normalized);
    const nextAlpha = Math.round(source.data[offset + 3] * softened);
    alpha[y * source.width + x] = nextAlpha;

    if (nextAlpha > 8) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}

if (maxX < minX || maxY < minY) {
  throw new Error(`피사체 영역을 찾지 못했습니다: ${inputPath}`);
}

const padding = Math.max(18, Math.round(Math.max(source.width, source.height) * 0.025));
minX = Math.max(0, minX - padding);
minY = Math.max(0, minY - padding);
maxX = Math.min(source.width - 1, maxX + padding);
maxY = Math.min(source.height - 1, maxY + padding);

const cropped = new PNG({
  width: maxX - minX + 1,
  height: maxY - minY + 1,
  colorType: 6,
});

for (let y = minY; y <= maxY; y += 1) {
  for (let x = minX; x <= maxX; x += 1) {
    const sourceOffset = (y * source.width + x) * 4;
    const outputOffset = ((y - minY) * cropped.width + (x - minX)) * 4;
    const pixelAlpha = alpha[y * source.width + x];
    const edgeMix = 1 - pixelAlpha / 255;
    cropped.data[outputOffset] = Math.round(
      source.data[sourceOffset] * (1 - edgeMix) + 255 * edgeMix,
    );
    cropped.data[outputOffset + 1] = Math.round(
      source.data[sourceOffset + 1] * (1 - edgeMix) + 255 * edgeMix,
    );
    cropped.data[outputOffset + 2] = Math.round(
      source.data[sourceOffset + 2] * (1 - edgeMix) + 255 * edgeMix,
    );
    cropped.data[outputOffset + 3] = pixelAlpha;
  }
}

const output = resizeToFit(cropped, 384);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, PNG.sync.write(output));

function averageCorners(png) {
  const sampleSize = Math.max(4, Math.round(Math.min(png.width, png.height) * 0.012));
  const corners = [
    [0, 0],
    [png.width - sampleSize, 0],
    [0, png.height - sampleSize],
    [png.width - sampleSize, png.height - sampleSize],
  ];
  const totals = [0, 0, 0];
  let count = 0;

  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + sampleSize; y += 1) {
      for (let x = startX; x < startX + sampleSize; x += 1) {
        const offset = (y * png.width + x) * 4;
        totals[0] += png.data[offset];
        totals[1] += png.data[offset + 1];
        totals[2] += png.data[offset + 2];
        count += 1;
      }
    }
  }

  return totals.map((total) => total / count);
}

function chromaStrength(red, green, blue, mode) {
  return mode === 'green'
    ? green - Math.max(red, blue)
    : Math.min(red, blue) - green;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function resizeToFit(png, maximumEdge) {
  const scale = Math.min(1, maximumEdge / Math.max(png.width, png.height));
  if (scale === 1) return png;

  const width = Math.max(1, Math.round(png.width * scale));
  const height = Math.max(1, Math.round(png.height * scale));
  const resized = new PNG({ width, height, colorType: 6 });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(png.width - 1, Math.round((x + 0.5) / scale - 0.5));
      const sourceY = Math.min(png.height - 1, Math.round((y + 0.5) / scale - 0.5));
      const sourceOffset = (sourceY * png.width + sourceX) * 4;
      const outputOffset = (y * width + x) * 4;
      resized.data[outputOffset] = png.data[sourceOffset];
      resized.data[outputOffset + 1] = png.data[sourceOffset + 1];
      resized.data[outputOffset + 2] = png.data[sourceOffset + 2];
      resized.data[outputOffset + 3] = png.data[sourceOffset + 3];
    }
  }

  return resized;
}
