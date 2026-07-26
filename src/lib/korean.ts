/**
 * 한국어 조사 선택.
 *
 * "저녁 약속을(를) 추가했어요"처럼 두 형태를 함께 쓰면 읽기 나쁘다. 앞 글자에
 * 받침이 있는지 보고 하나만 고른다.
 *
 * 한글 음절은 U+AC00부터 28개 종성 단위로 배열돼 있어서, 그 나머지가 0이면 받침이
 * 없다. 숫자와 영문은 읽는 소리를 기준으로 판단한다 (1은 "일", L은 "엘" — 받침 있음).
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 받침으로 끝나는 숫자: 0(영) 1(일) 3(삼) 6(육) 7(칠) 8(팔) */
const DIGITS_WITH_FINAL = new Set(['0', '1', '3', '6', '7', '8']);

/** 받침으로 끝나는 알파벳: l(엘) m(엠) n(엔) r(알) 등 */
const LETTERS_WITH_FINAL = new Set(['l', 'm', 'n', 'r']);

/** 마지막 글자에 받침이 있는가. 판단할 수 없으면 null. */
function hasFinalConsonant(word: string): boolean | null {
  const last = word.trim().slice(-1).toLowerCase();
  if (!last) return null;

  const code = last.charCodeAt(0);
  if (code >= HANGUL_START && code <= HANGUL_END) {
    return (code - HANGUL_START) % 28 !== 0;
  }

  if (/[0-9]/.test(last)) return DIGITS_WITH_FINAL.has(last);
  if (/[a-z]/.test(last)) return LETTERS_WITH_FINAL.has(last);

  return null;
}

/**
 * 조사를 붙인다. 판단할 수 없는 글자(기호·이모지 등)로 끝나면 받침 없는 쪽을 쓴다 —
 * 둘 중 하나는 골라야 하고, "를"이 덜 어색하다.
 */
export function withParticle(word: string, withFinal: string, withoutFinal: string): string {
  return `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`;
}

/** 목적격 조사 — 저녁 약속을 / 이사를 */
export function objectParticle(word: string): string {
  return withParticle(word, '을', '를');
}

/** 주격 조사 — 민준이 / 앨리스가 */
export function subjectParticle(word: string): string {
  return withParticle(word, '이', '가');
}

/** 보조사 — 일정은 / 회의는 */
export function topicParticle(word: string): string {
  return withParticle(word, '은', '는');
}
