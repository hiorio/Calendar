/**
 * TimeFlower 브랜드 이미지 파생 자산 생성기.
 *
 *   npm run icons
 *
 * 사용자가 확정한 원본은 assets/brand/timeflower-icon-source.png 한 곳에 둔다.
 * 앱 아이콘·스플래시·파비콘은 Expo가 실제 빌드에 사용하는 크기로만 리샘플링한다.
 * 원본의 손그림 형태와 색을 임의로 다시 그리지 않는다.
 */
import { generateImageAsync, getPngInfo } from '@expo/image-utils';
import Jimp from 'jimp-compact';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const PROJECT_ROOT = process.cwd();
const SOURCE = 'assets/brand/timeflower-icon-source.png';
const BACKGROUND = '#F8F1E1';

async function renderPng(destination, size) {
  const { source } = await generateImageAsync(
    {
      projectRoot: PROJECT_ROOT,
      cacheType: 'timeflower-brand-icons',
    },
    {
      src: SOURCE,
      name: basename(destination),
      resizeMode: 'cover',
      backgroundColor: BACKGROUND,
      removeTransparency: true,
      width: size,
      height: size,
    },
  );

  const output = resolve(PROJECT_ROOT, destination);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, source);
  console.log(`  ${destination}  ${size}×${size}  ${(source.length / 1024).toFixed(1)} KB`);
}

async function renderTransparentFlower(destination, size, { scale = 1, monochrome = false } = {}) {
  const image = await Jimp.read(resolve(PROJECT_ROOT, SOURCE));
  const contentSize = Math.round(size * scale);
  image.resize(contentSize, contentSize, Jimp.RESIZE_BICUBIC);

  const background = Jimp.intToRGBA(Jimp.cssColorToHex(BACKGROUND));
  // A1 원본의 미세한 아이보리 톤 차이를 제거하고 꽃 가장자리만 짧게 페더링한다.
  const transparentDistance = 30;
  const opaqueDistance = 70;

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (_x, _y, index) => {
    const red = image.bitmap.data[index];
    const green = image.bitmap.data[index + 1];
    const blue = image.bitmap.data[index + 2];
    const distance = Math.sqrt(
      (red - background.r) ** 2 +
        (green - background.g) ** 2 +
        (blue - background.b) ** 2,
    );

    if (distance <= transparentDistance) {
      image.bitmap.data[index + 3] = 0;
      return;
    }

    if (distance < opaqueDistance) {
      image.bitmap.data[index + 3] = Math.round(
        ((distance - transparentDistance) / (opaqueDistance - transparentDistance)) * 255,
      );
    }

    if (monochrome) {
      image.bitmap.data[index] = 255;
      image.bitmap.data[index + 1] = 255;
      image.bitmap.data[index + 2] = 255;
    }
  });

  const canvas = new Jimp(size, size, 0x00000000);
  const inset = Math.round((size - contentSize) / 2);
  canvas.composite(image, inset, inset);
  const output = resolve(PROJECT_ROOT, destination);
  mkdirSync(dirname(output), { recursive: true });
  await canvas.writeAsync(output);
  console.log(`  ${destination}  ${size}×${size}  transparent background`);
}

const sourceInfo = await getPngInfo(resolve(PROJECT_ROOT, SOURCE));
if (sourceInfo.width !== sourceInfo.height) {
  throw new Error(`아이콘 원본은 정사각형이어야 합니다: ${sourceInfo.width}×${sourceInfo.height}`);
}

console.log('TimeFlower 아이콘 생성');
await renderPng('assets/images/icon.png', 1024);
await renderTransparentFlower('assets/images/splash-icon.png', 512);
await renderPng('assets/images/favicon.png', 96);
// Adaptive 아이콘의 마스크가 달라져도 꽃잎과 잎이 잘리지 않도록 중앙 안전 영역에 둔다.
await renderTransparentFlower('assets/images/android-icon-foreground.png', 1024, { scale: 0.6 });
await renderTransparentFlower('assets/images/android-icon-monochrome.png', 1024, {
  scale: 0.6,
  monochrome: true,
});
await new Jimp(1024, 1024, BACKGROUND).writeAsync(
  resolve(PROJECT_ROOT, 'assets/images/android-icon-background.png'),
);
console.log('완료');
