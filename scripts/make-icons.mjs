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
const BACKGROUND = '#EBE5DC';

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

async function renderTransparentSplash(destination, size) {
  const image = await Jimp.read(resolve(PROJECT_ROOT, SOURCE));
  image.resize(size, size, Jimp.RESIZE_BICUBIC);

  const background = { r: 0xeb, g: 0xe5, b: 0xdc };
  // 원본의 아이보리 배경에는 가장자리로 갈수록 약 28 RGB 거리의 미세한 그라데이션이 있다.
  // 그 범위를 전부 투명하게 만들고 꽃의 안티앨리어싱 픽셀만 짧게 페더링한다.
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
  });

  const output = resolve(PROJECT_ROOT, destination);
  mkdirSync(dirname(output), { recursive: true });
  await image.writeAsync(output);
  console.log(`  ${destination}  ${size}×${size}  transparent background`);
}

const sourceInfo = await getPngInfo(resolve(PROJECT_ROOT, SOURCE));
if (sourceInfo.width !== sourceInfo.height) {
  throw new Error(`아이콘 원본은 정사각형이어야 합니다: ${sourceInfo.width}×${sourceInfo.height}`);
}

console.log('TimeFlower 아이콘 생성');
await renderPng('assets/images/icon.png', 1024);
await renderTransparentSplash('assets/images/splash-icon.png', 512);
await renderPng('assets/images/favicon.png', 96);
console.log('완료');
