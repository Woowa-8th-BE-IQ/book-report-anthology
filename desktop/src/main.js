// 덕후감 펫: 모임방의 내 아바타를 바탕화면 위에 띄운다.
// 창은 투명하고 항상 위에 있으며, 아바타·말풍선·대화창이 아닌 곳의 클릭은 뒤의 앱으로 지나간다.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, nativeImage, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const updater = require('./updater');

// 메인 프로세스에서 예상 못 한 오류가 나도 무서운 오류 창을 띄우지 않고 기록만 한다
process.on('uncaughtException', (error) => console.error('펫 오류', error));

const BASE = new URL(process.env.PET_BASE_URL || 'https://book-report-anthology.onrender.com');
const SIZE = { collapsed: { width: 260, height: 300 }, expanded: { width: 340, height: 560 } };
const WALK_SPEED = 70; // px/s
// 창 안에서 아바타가 차지하는 띠의 높이(아바타 92 + 여백 6). 보통은 창 맨 아래, 뒤집히면 맨 위에 있다.
const ZONE = 98;

let pet = null;
let setup = null;
let tray = null;
let expanded = false;
let flip = false; // 화면 위쪽이라 아바타를 창 위에 두고 말풍선을 아래로 띄우는 중
let restoreTo = null; // 대화창을 열려고 펫이 내려왔으면, 접을 때 돌아갈 아바타 자리
let dragging = false;
let walking = null;
let wanderOn = true;
let wanderTimer = null;
let refreshTray = () => {};

// ───────── 설정(개인 링크) ─────────

const configFile = () => path.join(app.getPath('userData'), 'config.json');
const readConfig = () => {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { return {}; }
};
const writeConfig = (config) => {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2));
};

/** 붙여 넣은 개인 링크들(문집마다 하나). 예전 설정(link 하나)도 읽는다. */
const linksOf = (config) => {
  const links = Array.isArray(config.links) ? config.links : [];
  if (config.link && !links.includes(config.link)) links.push(config.link);
  return links.filter((link) => personalLink(link));
};

/** 이 서비스의 개인 링크(/me/토큰)만 받는다. 다른 사이트 주소는 열지 않는다. */
function personalLink(text) {
  try {
    const url = new URL(String(text).trim());
    if (url.origin !== BASE.origin || !/^\/me\/[A-Za-z0-9_-]{8,}$/.test(url.pathname)) {
      return null;
    }
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

// ───────── 창 ─────────

const sameOrigin = (target) => {
  try { return new URL(target).origin === BASE.origin; } catch { return false; }
};

function guard(win) {
  // 이 서비스 밖으로는 창 안에서 이동하지 않고, 새 창 링크는 기본 브라우저로 연다.
  win.webContents.on('will-navigate', (event, target) => {
    if (!sameOrigin(target) && !target.startsWith('file://')) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url) || webLink(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// 대화에 붙은 웹 주소(http·https)만 기본 브라우저로 연다. 파일·앱 주소 같은 건 열지 않는다.
const webLink = (target) => {
  try { return ['http:', 'https:'].includes(new URL(target).protocol); } catch { return false; }
};
ipcMain.on('pet:open-link', (event, url) => {
  if (pet && event.sender === pet.webContents && webLink(url)) shell.openExternal(url);
});

function openSetup(message) {
  if (setup) { setup.show(); app.focus({ steal: true }); setup.focus(); return; }
  setup = new BrowserWindow({
    width: 420, height: 330, resizable: false, title: '덕후감 펫', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  guard(setup);
  setup.loadFile(path.join(__dirname, 'setup.html'), { query: { base: BASE.origin, message: message || '' } });
  // 독 아이콘이 없는 앱이라 창이 다른 앱 뒤에 숨기 쉽다. 맨 앞으로 끌어온다.
  setup.once('ready-to-show', () => {
    setup.show();
    if (process.platform === 'darwin') app.focus({ steal: true });
    setup.focus();
  });
  setup.on('closed', () => { setup = null; });
}

// ───────── 아바타 기준 배치 ─────────
// 아바타의 자리(가운데 x, 띠의 윗변 top)를 기준으로 창을 놓는다.
// 접혀 있을 때: 위로 자리가 모자라면 창을 뒤집어 말풍선을 아바타 아래에 띄운다(화면 맨 위까지 옮길 수 있다).
// 대화창을 펼칠 때: 대화창은 언제나 아바타 위. 자리가 모자라면 펫이 내려오고, 접으면 원래 자리로 돌아간다.
const avatarOf = (bounds) => ({ cx: bounds.x + bounds.width / 2, top: flip ? bounds.y : bounds.y + bounds.height - ZONE });

function setFlip(next) {
  if (flip === next) return;
  flip = next;
  if (pet && !pet.isDestroyed()) pet.webContents.send('pet:layout', { flip });
}

function placeAvatar(cx, top, size, { canFlip = true } = {}) {
  const area = screen.getDisplayNearestPoint({ x: Math.round(cx), y: Math.round(top) }).workArea;
  const above = size.height - ZONE; // 아바타 위로 펼칠 높이
  const roomAbove = top - area.y;
  const roomBelow = area.y + area.height - (top + ZONE);
  const nextFlip = canFlip && roomAbove < above && roomBelow > roomAbove;
  let y = nextFlip ? top : top - above;
  // 들어가지 않으면 창이 화면 안에 들어오게 민다(펼칠 때는 이렇게 펫이 내려온다)
  if (nextFlip) y = Math.min(y, area.y + area.height - size.height);
  else if (roomAbove < above) y = Math.max(y, area.y);
  return { x: Math.round(cx - size.width / 2), y: Math.round(y), flip: nextFlip };
}

function moveWindow(target, size, animate = false) {
  setFlip(target.flip);
  try {
    if (size) {
      pet.setResizable(true);
      pet.setBounds({ x: target.x, y: target.y, ...size }, animate && process.platform === 'darwin');
      pet.setResizable(false);
    } else {
      pet.setPosition(target.x, target.y);
    }
  } catch (error) {
    console.error('펫을 옮기지 못했어요', error); // 한 번 실패해도 오류 창을 띄우지 않는다
  }
}

function bottomRight(size) {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - size.width - 24, y: area.y + area.height - size.height };
}

function openPet(link) {
  if (pet) pet.destroy();
  const config = readConfig();
  flip = false;
  const saved = config.avatar && Number.isFinite(config.avatar.cx) && Number.isFinite(config.avatar.top)
    ? placeAvatar(config.avatar.cx, config.avatar.top, SIZE.collapsed) : null;
  if (saved) flip = saved.flip;
  const start = saved ? { x: saved.x, y: saved.y } : config.position || bottomRight(SIZE.collapsed);
  pet = new BrowserWindow({
    ...SIZE.collapsed, ...start,
    transparent: true, frame: false, resizable: false, movable: true, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, show: false,
    backgroundColor: '#00000000', title: '덕후감 펫',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  pet.setAlwaysOnTop(true, 'floating');
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pet.setIgnoreMouseEvents(true, { forward: true });
  guard(pet);
  pet.loadURL(`${link}?to=pet`);
  pet.once('ready-to-show', () => pet.showInactive());
  pet.webContents.on('did-finish-load', () => {
    sendUpdate(updater.state());
    pet.webContents.send('pet:layout', { flip }); // 새로 그린 화면에도 지금 배치를 알린다
    // 지난번과 버전이 다르면(업데이트로 다시 켜졌으면) "바뀌었어요"를 확인할 때까지 띄운다
    const config = readConfig();
    if (config.lastVersion && config.lastVersion !== app.getVersion()) {
      pet.webContents.send('pet:update', { status: 'updated', version: app.getVersion() });
    }
    if (config.lastVersion !== app.getVersion()) writeConfig({ ...config, lastVersion: app.getVersion() });
  });
  // 서버가 잠들어 있거나 인터넷이 끊겼으면 잠시 뒤 다시 시도한다.
  pet.webContents.on('did-fail-load', () => setTimeout(() => pet && pet.loadURL(`${link}?to=pet`), 15000));
  pet.on('closed', () => { pet = null; stopWalk(); });
  expanded = false;
  scheduleWander();
}

// ───────── 서버가 새로 배포되면 화면을 새로 고친다 ─────────
// 펫 화면(웹)이 스스로 새로 고치지만, 화면 스크립트가 예전 것이어도 바뀌도록 앱에서도 한 번 더 본다.
let lastBuild = null;
async function watchBuild() {
  try {
    const response = await net.fetch(new URL('/pet/build', BASE).toString(), { cache: 'no-store' });
    if (!response.ok) return;
    const build = (await response.text()).trim();
    if (lastBuild && build && build !== lastBuild && pet && !pet.isDestroyed() && !expanded && !pet.isFocused()) {
      pet.webContents.reload(); // 접힌 채로 쉬고 있을 때만(쓰던 말을 잃지 않게)
    }
    if (build) lastBuild = build;
  } catch {
    // 서버가 잠들었거나 인터넷이 끊겼으면 다음에 다시 본다
  }
}

// ───────── 걷기 ─────────

function stopWalk() {
  if (walking) clearInterval(walking);
  walking = null;
  if (pet) pet.webContents.send('pet:walk', { walking: false });
}

function walkTo(targetX) {
  if (!pet || expanded || dragging) return;
  stopWalk();
  const [, y] = pet.getPosition();
  let [x] = pet.getPosition();
  const facing = targetX < x ? 'left' : 'right';
  pet.webContents.send('pet:walk', { walking: true, facing });
  const step = (WALK_SPEED / 60) * (facing === 'left' ? -1 : 1);
  walking = setInterval(() => {
    if (!pet || expanded || dragging) { stopWalk(); return; }
    x += step;
    if ((facing === 'left' && x <= targetX) || (facing === 'right' && x >= targetX)) {
      pet.setPosition(Math.round(targetX), y);
      stopWalk();
      savePosition();
      return;
    }
    pet.setPosition(Math.round(x), y);
  }, 1000 / 60);
}

function scheduleWander() {
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(() => {
    if (pet && wanderOn && !expanded && !dragging) {
      const area = screen.getDisplayMatching(pet.getBounds()).workArea;
      const [x] = pet.getPosition();
      const width = pet.getBounds().width;
      const distance = 80 + Math.random() * 240;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const target = Math.min(area.x + area.width - width, Math.max(area.x, x + direction * distance));
      walkTo(target);
    }
    scheduleWander();
  }, 20000 + Math.random() * 25000);
}

function savePosition() {
  if (!pet || expanded) return;
  const [x, y] = pet.getPosition();
  const { cx, top } = avatarOf(pet.getBounds());
  writeConfig({ ...readConfig(), position: { x, y }, avatar: { cx: Math.round(cx), top: Math.round(top) } });
}

// ───────── 화면에서 오는 요청 ─────────

ipcMain.on('pet:interactive', (event, on) => {
  if (pet && event.sender === pet.webContents) pet.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.on('pet:expand', (event, open) => {
  if (!pet || event.sender !== pet.webContents) return;
  stopWalk();
  const was = expanded;
  expanded = Boolean(open);
  const size = expanded ? SIZE.expanded : SIZE.collapsed;
  const now = avatarOf(pet.getBounds());
  let { cx, top } = now;
  if (!expanded && restoreTo) ({ cx, top } = restoreTo); // 내려왔던 펫은 제자리로
  const area = screen.getDisplayNearestPoint({ x: Math.round(cx), y: Math.round(top) }).workArea;
  // 옆으로는 창이 화면 안에 들어오게만 민다
  const x = Math.min(area.x + area.width - size.width / 2, Math.max(area.x + size.width / 2, cx));
  const target = placeAvatar(x, top, size, { canFlip: !expanded });
  if (expanded && !was) {
    // 펼치느라 펫이 움직였으면(위로 자리가 모자라 내려왔거나 옆으로 밀렸으면) 접을 때 돌아갈 자리를 기억한다
    const moved = target.y !== Math.round(top - (size.height - ZONE)) || Math.round(x) !== Math.round(cx);
    restoreTo = moved ? now : null;
  } else if (!expanded) {
    restoreTo = null;
  }
  moveWindow(target, size, was !== expanded);
  if (expanded) pet.focus();
  else savePosition();
});

ipcMain.on('pet:drag', (event, dx, dy) => {
  if (!pet || event.sender !== pet.webContents) return;
  dragging = true;
  stopWalk();
  const mx = Number(dx);
  const my = Number(dy);
  if (!Number.isFinite(mx) || !Number.isFinite(my) || Math.abs(mx) > 400 || Math.abs(my) > 400) return;
  const { cx, top } = avatarOf(pet.getBounds());
  // 아바타가 모든 화면을 합친 범위 안에 있게(맨 위 가장자리까지 옮길 수 있다)
  const area = screen.getAllDisplays().reduce((box, display) => {
    const b = display.bounds;
    return { left: Math.min(box.left, b.x), top: Math.min(box.top, b.y),
      right: Math.max(box.right, b.x + b.width), bottom: Math.max(box.bottom, b.y + b.height) };
  }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  const nx = Math.min(Math.max(cx + mx, area.left), area.right);
  const ntop = Math.min(Math.max(top + my, area.top), area.bottom - ZONE / 2);
  restoreTo = null; // 직접 옮겼으면 그 자리에 둔다
  moveWindow(placeAvatar(nx, ntop, pet.getBounds(), { canFlip: !expanded }));
});

ipcMain.on('pet:drag-end', (event) => {
  if (!pet || event.sender !== pet.webContents) return;
  dragging = false;
  savePosition();
});

ipcMain.on('pet:attention', (event) => {
  if (pet && event.sender === pet.webContents && process.platform === 'darwin' && app.dock) app.dock.bounce('informational');
});

ipcMain.on('pet:relink', () => openSetup());

ipcMain.on('pet:apply-update', (event) => {
  if (!pet || event.sender !== pet.webContents) return;
  if (updater.apply({ relaunch: true })) app.quit();
});

function sendUpdate(state) {
  if (pet && !pet.isDestroyed()) {
    pet.webContents.send('pet:update', {
      status: state.status, version: state.version, problem: state.error, progress: state.progress,
    });
  }
}

ipcMain.on('pet:quit', (event) => {
  if (pet && event.sender === pet.webContents) app.quit();
});

/** 펫 화면에서 지금 보고 있는 문집의 모임방 주소. */
async function currentRoomUrl() {
  if (!pet) return null;
  try {
    return await pet.webContents.executeJavaScript(
      "(document.querySelector('.pet-view:not([hidden]) .pet-open') || document.querySelector('.pet-open') || {}).href || null");
  } catch {
    return null;
  }
}

ipcMain.on('pet:hide', (event) => {
  if (pet && event.sender === pet.webContents) { pet.hide(); refreshTray(); }
});
ipcMain.on('pet:add', () => openSetup());

ipcMain.handle('setup:submit', (event, text) => {
  if (!setup || event.sender !== setup.webContents) return { ok: false };
  const link = personalLink(text);
  if (!link) {
    const hint = /\/anthologies\//.test(String(text))
      ? '문집·모임방 주소가 아니라 개인 링크(…/me/…)가 필요해요. 모임방 화면 위쪽 "바탕화면 펫에 연결하기"에서 복사할 수 있어요.'
      : `${BASE.host}/me/… 꼴의 개인 링크를 붙여 넣어 주세요. 모임방 화면 위쪽 "바탕화면 펫에 연결하기"에 있어요.`;
    return { ok: false, message: hint };
  }
  const config = readConfig();
  const links = linksOf(config).filter((existing) => existing !== link);
  links.push(link);
  const { link: _legacy, ...rest } = config;
  writeConfig({ ...rest, links });
  // 링크를 열면 이 문집의 출입증이 펫에 하나 더 쌓이고, 펫 화면에 탭이 하나 늘어난다
  if (pet) pet.loadURL(`${link}?to=pet`); else openPet(link);
  setup.close();
  return { ok: true };
});

// ───────── 트레이 ─────────

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build',
    process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('덕후감 펫');
  const openRoom = async () => {
    const url = await currentRoomUrl();
    if (url && sameOrigin(url)) shell.openExternal(url);
  };
  const command = (name) => {
    if (!pet) return;
    pet.showInactive();
    pet.webContents.send('pet:command', name);
  };
  refreshTray = () => {
    const update = updater.state();
    const updateItems = update.status === 'ready'
      ? [{ label: `새 버전 ${update.version} 설치하고 다시 시작`, click: () => { if (updater.apply({ relaunch: true })) app.quit(); } }]
      : update.status === 'downloading' || update.status === 'preparing'
        ? [{ label: update.status === 'preparing' ? `새 버전 ${update.version} 설치 준비 중…`
          : `새 버전 ${update.version} 받는 중… ${update.progress || 0}%`, enabled: false }]
        : [
          ...(update.error ? [{ label: `업데이트 못 함 · ${update.error}`.slice(0, 80), enabled: false }] : []),
          { label: update.status === 'checking' ? '확인 중…' : '업데이트 확인', enabled: update.status !== 'checking',
            click: () => updater.check() },
          { label: '업데이트 기록 보기', click: () => shell.openPath(updater.logFile()) },
        ];
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `덕후감 펫 ${app.getVersion()}`, enabled: false },
      ...updateItems,
      { type: 'separator' },
      ...(pet && pet.isVisible() ? [] : [{ label: '펫 다시 띄우기', click: () => {
        if (!pet) { const links = linksOf(readConfig()); links.length ? openPet(links.at(-1)) : openSetup(); }
        else pet.showInactive();
        refreshTray();
      } }]),
      { label: '산책하기', type: 'checkbox', checked: wanderOn, click: (item) => { wanderOn = item.checked; if (!wanderOn) stopWalk(); } },
      { label: '제자리로', click: () => {
        if (!pet) return;
        const { x, y } = bottomRight(pet.getBounds());
        setFlip(false);
        pet.setPosition(x, y);
        savePosition();
      } },
      { type: 'separator' },
      { label: '대화창 열기', click: () => command('chat') },
      { label: '캐릭터 바꾸기', click: () => command('dress') },
      { label: '모임방 열기 (브라우저)', click: () => openRoom() },
      { type: 'separator' },
      { label: '문집 열기·참여…', click: () => command('create') },
      { label: '개인 링크로 연결…', click: () => openSetup() },
      { label: '로그인할 때 열기', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
      { type: 'separator' },
      { label: '펫 끄기', role: 'quit' },
    ]));
  };
  refreshTray();
  tray.on('click', refreshTray);
}

// ───────── 시작 ─────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // 숨긴 펫을 다시 보이게: 응용 프로그램에서 다시 열면 맥은 새로 켜지 않고 activate만 보낸다
  const reveal = () => {
    if (pet) {
      pet.showInactive();
      refreshTray();
    } else {
      const links = linksOf(readConfig());
      if (links.length) openPet(links.at(-1)); else openSetup();
    }
  };
  app.on('second-instance', reveal);
  app.on('activate', reveal);
  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();
    buildTray();
    updater.start((state) => { refreshTray(); sendUpdate(state); });
    watchBuild();
    setInterval(watchBuild, 5 * 60 * 1000);
    const links = linksOf(readConfig());
    if (links.length) openPet(links.at(-1)); else openSetup();
  });
  app.on('window-all-closed', (event) => event.preventDefault()); // 트레이에 남는다
}
