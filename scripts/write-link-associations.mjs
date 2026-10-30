import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const outputDir = 'public/.well-known';
const teamId = process.env.APPLE_TEAM_ID?.trim();
const bundleIdentifier = process.env.APP_IOS_BUNDLE_IDENTIFIER?.trim();

const missing = [
  ['APPLE_TEAM_ID', teamId],
  ['APP_IOS_BUNDLE_IDENTIFIER', bundleIdentifier],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`iOS 링크 연결 파일을 만들 수 없습니다. 누락: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

writeFileSync(
  `${outputDir}/apple-app-site-association`,
  `${JSON.stringify(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.${bundleIdentifier}`,
            components: [{ '/': '/join', comment: '캘린더 초대 링크' }],
          },
        ],
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`${outputDir}에 iOS 연결 파일을 생성했습니다.`);
