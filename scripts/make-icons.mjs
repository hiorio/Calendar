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

const sourceInfo = await getPngInfo(resolve(PROJECT_ROOT, SOURCE));
if (sourceInfo.width !== sourceInfo.height) {
  throw new Error(`아이콘 원본은 정사각형이어야 합니다: ${sourceInfo.width}×${sourceInfo.height}`);
}

console.log('TimeFlower 아이콘 생성');
await renderPng('assets/images/icon.png', 1024);
await renderPng('assets/images/splash-icon.png', 512);
await renderPng('assets/images/favicon.png', 96);
console.log('완료');
