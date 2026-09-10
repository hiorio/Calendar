import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createAgentDeviceClient } from 'agent-device';

const [udid, bundleId, evidenceArgument] = process.argv.slice(2);
if (!udid || !bundleId || !evidenceArgument) {
  throw new Error('usage: verify-ios-large-widget.mjs <simulator-udid> <bundle-id> <evidence-directory>');
}

const evidenceDirectory = resolve(evidenceArgument);
mkdirSync(evidenceDirectory, { recursive: true });
const transcriptPath = resolve(evidenceDirectory, 'transcript.log');
const session = `timeflower-widget-${process.env.GITHUB_RUN_ID ?? process.pid}`;
const client = createAgentDeviceClient({ cwd: process.cwd(), responseLevel: 'full', session });
const device = { platform: 'ios', udid, session };

function record(message, value) {
  const line = value === undefined
    ? message
    : `${message}\n${JSON.stringify(value, null, 2)}`;
  process.stdout.write(`${line}\n`);
  appendFileSync(transcriptPath, `${line}\n`, 'utf8');
}

function saveJson(name, value) {
  writeFileSync(resolve(evidenceDirectory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function nodeText(node) {
  return [node.label, node.value, node.identifier].filter(Boolean).join(' ').trim();
}

function findNode(snapshot, patterns, roles = []) {
  const ranked = snapshot.nodes
    .filter((node) => {
      const text = nodeText(node);
      return patterns.some((pattern) => pattern.test(text));
    })
    .sort((left, right) => {
      const leftRole = roles.some((role) => String(left.role ?? left.type).toLowerCase().includes(role)) ? 1 : 0;
      const rightRole = roles.some((role) => String(right.role ?? right.type).toLowerCase().includes(role)) ? 1 : 0;
      return rightRole - leftRole;
    });
  return ranked[0] ?? null;
}

function pinnedRef(node, snapshot) {
  const ref = node.ref.startsWith('@') ? node.ref : `@${node.ref}`;
  return snapshot.refsGeneration == null
    ? ref
    : `${ref}~s${snapshot.refsGeneration}`;
}

async function snapshot(name, options = {}) {
  const value = await client.capture.snapshot({ ...device, ...options });
  saveJson(`${name}.json`, value);
  record(`snapshot: ${name}`, {
    appBundleId: value.appBundleId,
    nodeCount: value.nodes.length,
    refsGeneration: value.refsGeneration,
    nodes: value.nodes.map((node) => ({
      ref: node.ref,
      role: node.role ?? node.type,
      label: node.label,
      value: node.value,
      identifier: node.identifier,
      rect: node.rect,
    })),
  });
  return value;
}

async function screenshot(name, pixelDensity = 2) {
  const path = resolve(evidenceDirectory, `${name}.png`);
  const value = await client.capture.screenshot({
    ...device,
    path,
    pixelDensity,
    normalizeStatusBar: true,
  });
  record(`screenshot: ${name}`, value);
  return { ...value, path };
}

function ocr(screenshotResult, name) {
  const output = execFileSync(
    'xcrun',
    ['swift', '.github/scripts/ocr-ios-screenshot.swift', screenshotResult.path],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  const lines = JSON.parse(output);
  saveJson(`${name}-ocr.json`, lines);
  record(`ocr: ${name}`, lines);
  return lines;
}

const initialScreenFailures = [
  /Supabase 설정이 필요합니다/,
  /게스트로 시작할 수 없습니다/,
  /캘린더를 불러오지 못했습니다/,
  /계정 만들기/,
];

async function waitForInitialCalendar(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const current = await client.capture.snapshot({
        ...device,
        interactiveOnly: false,
      });
      lastText = current.nodes.map(nodeText).filter(Boolean).join(' ');
      const failure = initialScreenFailures.find((pattern) => pattern.test(lastText));
      if (failure) {
        saveJson('01-app-invalid.json', current);
        throw new Error(`production app opened on an invalid first screen (${failure})`);
      }

      const calendar = current.nodes.find((node) =>
        /\d{4}년\s*\d{1,2}월\s*월간 캘린더/.test(nodeText(node)),
      );
      if (calendar) {
        saveJson('01-app-ready.json', current);
        record('production first-launch calendar verified', {
          appBundleId: current.appBundleId,
          calendar: nodeText(calendar),
          nodeCount: current.nodes.length,
        });
        return current;
      }
      lastError = null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('invalid first screen')) throw error;
      lastError = error;
    }
    await new Promise((complete) => setTimeout(complete, 1_500));
  }

  throw new Error(
    `production app did not reach its monthly calendar within ${timeoutMs}ms; ` +
      `last snapshot text=${JSON.stringify(lastText.slice(0, 1_000))}; ` +
      `last capture error=${lastError instanceof Error ? lastError.message : String(lastError ?? 'none')}`,
  );
}

async function pressNode(node, currentSnapshot, label) {
  if (!node) throw new Error(`could not find ${label} in the latest SpringBoard snapshot`);
  record(`press: ${label}`, { ref: node.ref, text: nodeText(node), role: node.role ?? node.type });
  await client.interactions.press({
    ...device,
    ref: pinnedRef(node, currentSnapshot),
    settle: true,
    timeoutMs: 20_000,
  });
}

function pagePosition(currentSnapshot) {
  for (const node of currentSnapshot.nodes) {
    const text = nodeText(node);
    const english = /page\s+(\d+)\s+of\s+(\d+)/i.exec(text);
    if (english) return { current: Number(english[1]), total: Number(english[2]), text };
    const korean = /총\s*(\d+)\s*페이지\s*중\s*(\d+)\s*페이지/.exec(text);
    if (korean) return { current: Number(korean[2]), total: Number(korean[1]), text };
    const ios26Korean = /(\d+)\s*페이지\s*\(\s*총\s*(\d+)\s*페이지\s*\)/.exec(text);
    if (ios26Korean) {
      return { current: Number(ios26Korean[1]), total: Number(ios26Korean[2]), text };
    }
    const fraction = /(?:페이지\s*)?(\d+)\s*\/\s*(\d+)/i.exec(text);
    if (fraction) return { current: Number(fraction[1]), total: Number(fraction[2]), text };
  }
  return null;
}

async function advanceWidgetPickerPage(currentPage, logicalWidth, logicalHeight) {
  const targetPage = currentPage + 1;
  const attempts = [
    {
      name: 'synthesized left swipe',
      run: () => client.interactions.swipeGesture({
        ...device,
        preset: 'left',
      }),
    },
    {
      name: 'coordinate left swipe',
      run: () => client.interactions.swipe({
        ...device,
        from: { x: logicalWidth * 0.82, y: logicalHeight * 0.50 },
        to: { x: logicalWidth * 0.18, y: logicalHeight * 0.50 },
      }),
    },
    {
      name: 'AX-free horizontal scroll',
      run: () => client.interactions.scroll({
        ...device,
        // agent-device scroll directions describe content movement. Moving the
        // picker to the next card requires the content to scroll right (a
        // right-to-left finger gesture).
        direction: 'right',
        pixels: Math.round(logicalWidth * 0.64),
        durationMs: 450,
        settle: false,
      }),
    },
  ];
  const errors = [];

  for (const [index, attempt] of attempts.entries()) {
    record(`advance widget picker page ${currentPage} -> ${targetPage}: ${attempt.name}`);
    try {
      await attempt.run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.name}: ${message}`);
      // XCTest can report a main-thread timeout after SpringBoard has already
      // accepted the gesture. Observe the page before deciding to retry.
      record('widget picker gesture warning', { attempt: attempt.name, message });
    }

    await new Promise((complete) => setTimeout(complete, 1_500));
    try {
      const current = await snapshot(
        `07-widget-size-page-${targetPage}-attempt-${index + 1}`,
        { interactiveOnly: false },
      );
      const position = pagePosition(current);
      record('widget size picker position after gesture', {
        attempt: attempt.name,
        expectedAfter: currentPage,
        position,
      });
      if (position?.current > currentPage) return { current, position };
      if (!position) errors.push(`${attempt.name}: page indicator was unavailable after gesture`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.name} observation: ${message}`);
      record('widget picker observation warning', { attempt: attempt.name, message });
    }

    await new Promise((complete) => setTimeout(complete, 1_000));
  }

  throw new Error(
    `widget size picker did not advance from page ${currentPage} after ${attempts.length} strategies: ` +
      errors.join(' | '),
  );
}

function pickSearchResult(lines, capture) {
  const density = capture.pixelDensity ?? 1;
  const logicalHeight = capture.logicalHeight ?? (capture.height ?? 0) / density;
  const matches = lines
    .map((line) => ({
      ...line,
      logicalX: (line.x + line.width / 2) / density,
      logicalY: (line.y + line.height / 2) / density,
    }))
    .filter((line) => /time\s*flower/i.test(line.text))
    // Exclude the query inside the search field and keyboard suggestions.
    .filter((line) => line.logicalY > logicalHeight * 0.14 && line.logicalY < logicalHeight * 0.58)
    .sort((left, right) => right.logicalY - left.logicalY);
  return matches[0] ?? null;
}

function countCalendarEvidence(lines) {
  const allText = lines.map((line) => line.text).join(' ');
  const dates = new Set();
  for (const match of allText.matchAll(/(?<!\d)([1-9]|[12]\d|3[01])(?!\d)/g)) {
    dates.add(Number(match[1]));
  }
  const weekdayCount = ['일', '월', '화', '수', '목', '금', '토']
    .filter((weekday) => allText.includes(weekday)).length;
  return {
    allText,
    uniqueDateCount: dates.size,
    dates: [...dates].sort((left, right) => left - right),
    weekdayCount,
    legacyAgendaSubtitleVisible: allText.includes('앱과 같은 캘린더'),
  };
}

async function waitForLargeCalendarWidget(timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastVerification = null;

  while (Date.now() < deadline) {
    attempt += 1;
    const finalCapture = await screenshot('10-system-large-calendar-proof', 3);
    const finalSnapshot = await snapshot('10-system-large-calendar-proof', {
      interactiveOnly: false,
    });
    const finalOcr = ocr(finalCapture, '10-system-large-calendar-proof');
    const verification = {
      ...countCalendarEvidence(finalOcr),
      attempt,
      screenshot: finalCapture.path,
      widgetNodes: finalSnapshot.nodes
        .filter((node) => /time\s*flower|calendar|캘린더/i.test(nodeText(node)))
        .map((node) => ({
          ref: node.ref,
          role: node.role ?? node.type,
          text: nodeText(node),
          rect: node.rect,
        })),
    };
    saveJson('verification.json', verification);
    record('calendar visual verification', verification);
    lastVerification = verification;

    if (verification.legacyAgendaSubtitleVisible) {
      throw new Error('legacy agenda-only large widget is still visible in the simulator');
    }
    if (verification.uniqueDateCount >= 10 && verification.weekdayCount >= 4) {
      return verification;
    }

    // WidgetKit may briefly render its redacted placeholder immediately after a
    // brand-new widget is added. Keep the final evidence filename stable and
    // retry until the app-published timeline replaces that placeholder.
    await new Promise((complete) => setTimeout(complete, 3_000));
  }

  throw new Error(
    `systemLarge calendar did not replace its placeholder within ${timeoutMs}ms: ` +
      `${lastVerification?.uniqueDateCount ?? 0} dates, ` +
      `${lastVerification?.weekdayCount ?? 0} weekday labels`,
  );
}

let finalError;
try {
  record('prepare simulator automation', { udid, bundleId, session });
  await client.command.prepare({ ...device, action: 'ios-runner', timeoutMs: 240_000 });

  const appOpen = await client.apps.open({
    ...device,
    app: bundleId,
    relaunch: true,
    foreground: true,
    timeoutMs: 120_000,
  });
  saveJson('01-app-open.json', appOpen);
  await waitForInitialCalendar();
  const appReadyCapture = await screenshot('01-app-ready', 3);
  ocr(appReadyCapture, '01-app-ready');
  // The calendar screen appears before the first guest's calendar/event queries
  // necessarily finish. Keep the app active long enough for WidgetSync to publish
  // its initial App Group timeline before moving to SpringBoard.
  await new Promise((complete) => setTimeout(complete, 8_000));

  const springboardOpen = await client.apps.open({
    ...device,
    app: 'com.apple.springboard',
    foreground: true,
    timeoutMs: 120_000,
  });
  saveJson('02-springboard-open.json', springboardOpen);
  const homeCapture = await screenshot('02-home-before-widget', 1);

  const logicalWidth = homeCapture.logicalWidth ?? homeCapture.width ?? 393;
  const logicalHeight = homeCapture.logicalHeight ?? homeCapture.height ?? 852;
  await client.interactions.longPress({
    ...device,
    x: logicalWidth * 0.88,
    y: logicalHeight * 0.70,
    durationMs: 1_100,
    settle: true,
    timeoutMs: 20_000,
  });
  await screenshot('03-home-edit-mode', 1);

  let current = await snapshot('03-home-edit-mode', { interactiveOnly: true });
  const directAdd = findNode(current, [/^Add Widget$/i, /^위젯 추가$/], ['button', 'cell']);
  if (!directAdd) {
    const edit = findNode(current, [/^Edit$/i, /^편집$/], ['button']);
    await pressNode(edit, current, 'Edit');
    current = await snapshot('04-edit-menu', { interactiveOnly: true });
  }

  const addWidget = findNode(current, [/^Add Widget$/i, /^위젯 추가$/], ['button', 'cell']);
  await pressNode(addWidget, current, 'Add Widget');
  await screenshot('05-widget-gallery', 1);

  current = await snapshot('05-widget-gallery', { interactiveOnly: false });
  const search = findNode(
    current,
    [/^Search$/i, /Search Widgets/i, /^검색$/, /위젯 검색/],
    ['search', 'text-field', 'textfield'],
  );
  if (!search) throw new Error('could not find the widget gallery search field');
  await client.interactions.fill({
    ...device,
    ref: pinnedRef(search, current),
    text: 'TimeFlower',
    settle: true,
    timeoutMs: 20_000,
  });

  const resultsCapture = await screenshot('06-widget-search-results', 2);
  current = await snapshot('06-widget-search-results', { raw: true });
  const semanticResult = current.nodes
    .filter((node) => /time\s*flower/i.test(nodeText(node)))
    .find((node) => !String(node.role ?? node.type).toLowerCase().includes('search'));
  if (semanticResult) {
    await pressNode(semanticResult, current, 'TimeFlower search result');
  } else {
    const lines = ocr(resultsCapture, '06-widget-search-results');
    const result = pickSearchResult(lines, resultsCapture);
    const fallback = {
      x: (resultsCapture.logicalWidth ?? logicalWidth) / 2,
      y: (resultsCapture.logicalHeight ?? logicalHeight) * 0.24,
    };
    const point = result ? { x: result.logicalX, y: result.logicalY } : fallback;
    record('press: TimeFlower search result OCR coordinate', { point, result, fallbackUsed: !result });
    await client.interactions.press({ ...device, ...point, settle: true, timeoutMs: 20_000 });
  }

  await new Promise((complete) => setTimeout(complete, 1_500));
  current = await snapshot('07-widget-size-picker', { interactiveOnly: false });
  let position = pagePosition(current);
  record('widget size picker position', position);
  const desiredPage = 3; // Calendar widget ordering: small, medium, large.
  let currentPage = position?.current ?? 1;
  if (position && position.total < desiredPage) {
    throw new Error(`widget picker exposed only ${position.total} pages; calendar large is unavailable`);
  }

  while (currentPage < desiredPage) {
    const advanced = await advanceWidgetPickerPage(currentPage, logicalWidth, logicalHeight);
    current = advanced.current;
    position = advanced.position;
    currentPage = position.current;
  }

  const pickerCapture = await screenshot('08-system-large-picker', 3);
  ocr(pickerCapture, '08-system-large-picker');
  current = await snapshot('08-system-large-picker', { interactiveOnly: true });
  const addSelectedWidget = findNode(current, [/^Add Widget$/i, /^위젯 추가$/], ['button']);
  await pressNode(addSelectedWidget, current, 'Add Widget for systemLarge');
  await new Promise((complete) => setTimeout(complete, 2_000));

  await screenshot('09-system-large-added-editing', 2);
  current = await snapshot('09-system-large-added-editing', { interactiveOnly: true });
  const done = findNode(current, [/^Done$/i, /^완료$/], ['button']);
  if (done) await pressNode(done, current, 'Done');
  await new Promise((complete) => setTimeout(complete, 1_500));

  await waitForLargeCalendarWidget();
} catch (error) {
  finalError = error;
  record('verification failed', { message: error instanceof Error ? error.stack : String(error) });
  try { await screenshot('failure-current-screen', 2); } catch (captureError) {
    record('failure screenshot also failed', { message: String(captureError) });
  }
} finally {
  try {
    await client.sessions.close({ session });
  } catch (error) {
    record('session cleanup warning', { message: String(error) });
  }
}

if (finalError) throw finalError;
