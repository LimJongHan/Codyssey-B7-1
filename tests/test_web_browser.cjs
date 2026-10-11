// 실행: NODE_PATH=<Playwright가 설치된 node_modules> node tests/test_web_browser.cjs
// 임시 DB와 tests/browser_app.py만 사용한다. 실제 API 키나 사용자 DB는 읽지 않는다.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const screenshots = process.env.WEB_TEST_SCREENSHOTS;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, message) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error(message);
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), 'positive-bot-browser-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(path.join(root, '.venv/bin/python'), [
    '-m', 'uvicorn', 'browser_app:app', '--app-dir', 'tests', '--host', '127.0.0.1', '--port', String(port),
  ], {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root, DATABASE_PATH: path.join(directory, 'test.db'), AI_API_KEY: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverErrors = '';
  server.stderr.on('data', chunk => { serverErrors += chunk; });
  let browser;
  try {
    await until(() => fetch(`${base}/api/health`).then(r => r.ok).catch(() => false), '테스트 서버 시작 실패');
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const credentials = { username: 'browser_test', password: 'test-password-123' };
    assert.equal((await context.request.post(`${base}/api/auth/signup`, { data: credentials })).status(), 201);
    assert.equal((await context.request.post(`${base}/api/auth/login`, { data: credentials })).status(), 200);
    await page.goto(base);
    await page.locator('#btnLogout').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#headerAuthArea').isVisible(), false);

    async function send(question) {
      await page.locator('#msgInput').fill(question);
      await page.locator('#btnSend').click();
    }
    async function idle() {
      await until(async () => !(await page.locator('#msgInput').isDisabled()), '전송 상태가 끝나지 않음');
    }
    async function layoutFits(label) {
      await page.evaluate(() => {
        const feed = document.querySelector('#chatFeed');
        feed.scrollTop = feed.scrollHeight;
      });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const layout = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const feed = box('#chatFeed');
        const dock = box('.input-dock');
        const last = document.querySelector('#msgList').lastElementChild.getBoundingClientRect();
        return { feedBottom: feed.bottom, dockTop: dock.top, lastBottom: last.bottom,
          dockBottom: dock.bottom, height: innerHeight, width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth };
      });
      assert.ok(layout.feedBottom <= layout.dockTop + 1, `${label}: 피드와 입력창 겹침 ${JSON.stringify(layout)}`);
      assert.ok(layout.lastBottom <= layout.feedBottom + 1, `${label}: 마지막 메시지가 가려짐`);
      assert.ok(layout.dockBottom <= layout.height + 1, `${label}: 입력창이 화면 밖으로 벗어남 ${JSON.stringify(layout)}`);
      assert.ok(layout.scrollWidth <= layout.width, `${label}: 가로 넘침`);
    }

    await send('브라우저 스트리밍 확인');
    await until(() => page.locator('.is-streaming .msg-bubble').count(), '첫 조각이 완료 전에 보이지 않음');
    assert.match(await page.locator('.is-streaming .msg-bubble').innerText(), /오늘도 수고했어요/);
    assert.equal(await page.locator('#msgInput').isDisabled(), true);
    assert.equal(await page.locator('#btnLogout').isDisabled(), true);
    await page.locator('#chatForm').evaluate(form => form.requestSubmit());
    await idle();
    assert.equal(await page.locator('.msg-row--bot').count(), 1);
    assert.equal(await page.locator('.is-streaming').count(), 0);
    const rooms = await (await context.request.get(`${base}/api/rooms`)).json();
    const historyUrl = `${base}/api/rooms/${rooms[0].id}/messages`;
    assert.equal((await (await context.request.get(historyUrl)).json()).length, 1);
    // 내역 조회 중 연속 클릭해도 요청과 말풍선을 중복 생성하지 않는다.
    let historyRequests = 0;
    let releaseHistory;
    const historyGate = new Promise(resolve => { releaseHistory = resolve; });
    const historyPattern = '**/api/rooms/*/messages';
    await page.route(historyPattern, async route => {
      historyRequests++;
      await historyGate;
      await route.continue();
    });
    await page.locator('.chat-item').first().dblclick();
    await until(() => historyRequests > 0, '내역 조회 요청 없음');
    await page.locator('#btnNewChat').click();
    assert.equal(await page.locator('.chat-item.is-active').count(), 1);
    releaseHistory();
    await until(() => page.locator('.msg-row--bot').count(), '내역 조회 완료 실패');
    assert.equal(historyRequests, 1);
    assert.equal(await page.locator('.msg-row--user').count(), 1);
    assert.equal(await page.locator('.msg-row--bot').count(), 1);
    await page.unroute(historyPattern);
    await layoutFits('데스크톱');
    if (screenshots) await page.screenshot({ path: path.join(screenshots, 'chat-desktop.png') });
    await page.locator('#msgInput').fill('입력창 높이 확인\n'.repeat(15));
    await layoutFits('여러 줄 입력');
    await page.setViewportSize({ width: 390, height: 844 });
    await layoutFits('모바일 여러 줄 입력');
    if (screenshots) await page.screenshot({ path: path.join(screenshots, 'chat-mobile.png') });
    await page.locator('#headerTitle').evaluate(title => { title.textContent = '긴 대화 제목을 표시할 때 로그아웃 버튼도 보여야 합니다'; });
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await layoutFits(`${viewport.width}×${viewport.height}`);
      const logout = await page.locator('#btnLogout').boundingBox();
      assert.ok(logout.x >= 0 && logout.x + logout.width <= viewport.width, '로그아웃 버튼이 화면 밖에 있음');
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await page.locator('.chat-item').first().click();
    await until(() => page.locator('.msg-row--bot').count(), '저장된 내역을 불러오지 못함');
    assert.equal(await page.locator('.msg-row--user').count(), 1);

    const streamUrl = '**/api/rooms/*/messages/stream';
    for (const status of [500, 503]) {
      const detail = `서버 안내 ${status}: 잠시 후 시도해 주세요.`;
      await page.route(streamUrl, route => route.fulfill({ status, json: { detail } }));
      await send(`HTTP ${status} 확인`);
      await idle();
      assert.ok((await page.locator('.err-txt').last().innerText()).includes(detail));
      assert.equal(await page.locator('.btn-retry').count(), 0);
      await page.unroute(streamUrl);
    }
    for (const status of [500, 503]) {
      const detail = `스트림 안내 ${status}`;
      await page.route(streamUrl, route => route.fulfill({
        contentType: 'text/event-stream', body: 'event: delta\ndata: {"text":"미완성 조각"}\n\n'
          + `event: error\ndata: ${JSON.stringify({ detail, status_code: status })}\n\n`,
      }));
      await send(`SSE ${status} 확인`);
      await idle();
      assert.ok((await page.locator('.err-txt').last().innerText()).includes(detail));
      assert.equal(await page.locator('.btn-retry').count(), 0);
      assert.match(await page.locator('.msg-row--incomplete').last().innerText(), /완료되지 않은 응답/);
      await page.unroute(streamUrl);
    }
    await page.route(streamUrl, route => route.fulfill({
      contentType: 'text/event-stream', body: 'event: delta\ndata: {"text":"연결 중단 조각"}\n\n',
    }));
    await send('종료 이벤트 누락 확인');
    await idle();
    assert.match(await page.locator('.err-txt').last().innerText(), /완료를 확인하지 못했습니다/);
    await page.unroute(streamUrl);
    assert.equal((await (await context.request.get(historyUrl)).json()).length, 1);

    await page.route('**/api/auth/logout', route => route.fulfill({ status: 500, json: { detail: '로그아웃 저장소 오류 안내' } }));
    await page.locator('#btnLogout').click();
    await until(async () => (await page.locator('#toastContainer').innerText()).includes('로그아웃 저장소 오류 안내'), '로그아웃 실패 안내 없음');
    assert.equal(await page.locator('#btnLogout').isVisible(), true);
    assert.equal((await context.request.get(`${base}/api/auth/me`)).status(), 200);
    await page.unroute('**/api/auth/logout');
    await page.locator('#btnLogout').click();
    await page.waitForURL(`${base}/auth`);
    assert.equal((await context.request.get(`${base}/api/auth/me`)).status(), 401);
    assert.equal((await context.request.get(historyUrl)).status(), 401);
    await page.locator('#userId').fill(credentials.username);
    await page.locator('#userPw').fill(credentials.password);
    await page.locator('#submitBtn').click();
    await page.waitForURL(`${base}/`);
    await page.locator('#btnLogout').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    console.log('PASS: 실제 세션·SSE 순차 표시·중복 전송 차단·저장/재조회·데스크톱/모바일 배치·HTTP/SSE 500/503·중단·로그아웃');
  } catch (error) {
    console.error(serverErrors);
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null && server.signalCode === null) {
      await new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); });
    }
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
