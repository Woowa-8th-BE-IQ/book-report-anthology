// 덕후감 펫: 모임방의 내 아바타를 바탕화면 위에 띄운다.
// 창은 투명하고 항상 위에 있으며, 아바타·말풍선·대화창이 아닌 곳의 클릭은 뒤의 앱으로 지나간다.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const updater = require('./updater');

const BASE = new URL(process.env.PET_BASE_URL || 'https://book-report-anthology.onrender.com');
const SIZE = { collapsed: { width: 260, height: 300 }, expanded: { width: 340, height: 560 } };
const WALK_SPEED = 70; // px/s

let pet = null;
let setup = null;
let tray = null;
let expanded = false;
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
    if (sameOrigin(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

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

function bottomRight(size) {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - size.width - 24, y: area.y + area.height - size.height };
}

function openPet(link) {
  if (pet) pet.destroy();
  const config = readConfig();
  const start = config.position || bottomRight(SIZE.collapsed);
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
  pet.webContents.on('did-finish-load', () => sendUpdate(updater.state()));
  // 서버가 잠들어 있거나 인터넷이 끊겼으면 잠시 뒤 다시 시도한다.
  pet.webContents.on('did-fail-load', () => setTimeout(() => pet && pet.loadURL(`${link}?to=pet`), 15000));
  pet.on('closed', () => { pet = null; stopWalk(); });
  expanded = false;
  scheduleWander();
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
  writeConfig({ ...readConfig(), position: { x, y } });
}

// ───────── 화면에서 오는 요청 ─────────

ipcMain.on('pet:interactive', (event, on) => {
  if (pet && event.sender === pet.webContents) pet.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.on('pet:expand', (event, open) => {
  if (!pet || event.sender !== pet.webContents) return;
  stopWalk();
  expanded = Boolean(open);
  const bounds = pet.getBounds();
  const size = expanded ? SIZE.expanded : SIZE.collapsed;
  const area = screen.getDisplayMatching(bounds).workArea;
  // 아래 가운데를 기준으로 커지고 줄어든다.
  let x = Math.round(bounds.x + bounds.width / 2 - size.width / 2);
  let y = bounds.y + bounds.height - size.height;
  x = Math.min(area.x + area.width - size.width, Math.max(area.x, x));
  y = Math.min(area.y + area.height - size.height, Math.max(area.y, y));
  pet.setResizable(true);
  pet.setBounds({ x, y, ...size });
  pet.setResizable(false);
  if (expanded) pet.focus();
});

ipcMain.on('pet:drag', (event, dx, dy) => {
  if (!pet || event.sender !== pet.webContents) return;
  dragging = true;
  stopWalk();
  const [x, y] = pet.getPosition();
  pet.setPosition(Math.round(x + Number(dx || 0)), Math.round(y + Number(dy || 0)));
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
        pet.setPosition(x, y);
        savePosition();
      } },
      { type: 'separator' },
      { label: '대화창 열기', click: () => command('chat') },
      { label: '캐릭터 바꾸기', click: () => command('dress') },
      { label: '모임방 열기 (브라우저)', click: () => openRoom() },
      { type: 'separator' },
      { label: '문집 추가…', click: () => openSetup() },
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
    const links = linksOf(readConfig());
    if (links.length) openPet(links.at(-1)); else openSetup();
  });
  app.on('window-all-closed', (event) => event.preventDefault()); // 트레이에 남는다
}
