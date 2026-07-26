/**
 * Node ESM 로더 훅.
 *
 * Node 24는 TypeScript 타입을 스스로 벗겨내지만(=별도 빌드 불필요), 모듈 해석은
 * 여전히 ESM 규칙을 따른다. 이 저장소의 코드는 Metro/tsconfig 기준으로 쓰여 있어서
 * 두 가지가 맞지 않는다.
 *
 *   · `./date`   처럼 확장자가 없다
 *   · `@/lib/…`  처럼 별칭을 쓴다
 *
 * 순수 함수(반복 전개, 타임존)를 앱을 띄우지 않고 검사하려고 그 차이만 메운다.
 * 프로덕션 번들과는 무관하다.
 */
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const SRC = resolvePath(process.cwd(), 'src');

/**
 * rrule의 기본 진입점은 CommonJS라 Node ESM에서 named import가 안 된다.
 * 같은 패키지가 함께 배포하는 ESM 빌드를 직접 가리킨다. (Metro는 알아서 처리한다)
 */
const BARE_OVERRIDES = {
  rrule: resolvePath(process.cwd(), 'node_modules/rrule/dist/esm/index.js'),
};

export async function resolve(specifier, context, nextResolve) {
  if (BARE_OVERRIDES[specifier]) {
    return nextResolve(pathToFileURL(BARE_OVERRIDES[specifier]).href, context);
  }

  // '@/lib/date' → '<cwd>/src/lib/date'
  const target = specifier.startsWith('@/')
    ? pathToFileURL(resolvePath(SRC, specifier.slice(2))).href
    : specifier;

  if (target.startsWith('.') || target.startsWith('file:')) {
    const base = target.startsWith('.')
      ? pathToFileURL(resolvePath(dirname(fileURLToPath(context.parentURL)), target)).href
      : target;

    // 확장자 없는 상대 경로를 메운다. .ts는 우리 코드, .js는 rrule의 ESM 빌드.
    const candidates = [base, `${base}.ts`, `${base}.js`, `${base}/index.ts`, `${base}/index.js`];

    for (const candidate of candidates) {
      // 디렉터리는 건너뛴다. './iter'는 폴더로도 존재하지만 원하는 것은
      // './iter/index.js'다.
      if (isFile(candidate)) return nextResolve(candidate, context);
    }
  }

  return nextResolve(target, context);
}

function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}
