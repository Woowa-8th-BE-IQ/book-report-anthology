// 펫 스스로 업데이트하기.
// GitHub 릴리스에서 새 버전(pet-v…)을 찾아 뒤에서 받아 두고, 준비되면 알린다.
// 사람이 "다시 시작"을 누르면 바로, 아니면 펫을 끌 때 바꿔 끼운다.
// (서명·공증을 하지 않는 앱이라 Squirrel 대신 직접 바꿔 끼운다.)
const { app, net } = require('electron');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { promisify } = require('node:util');

const run = promisify(execFile);
const REPO = 'Woowa-8th-BE-IQ/book-report-anthology';
const FIRST_CHECK_MS = 15 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const NEED_BYTES = 420 * 1024 * 1024;
const RETRY_MS = 30 * 60 * 1000;

let state = { status: 'idle', version: null, staged: null, error: null, checkedAt: null };

// 업데이트 과정을 파일로 남긴다(문제가 생기면 이 파일을 보면 된다)
const logFile = () => path.join(app.getPath('userData'), 'update.log');
function log(message) {
  try {
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // 기록 실패는 무시한다
  }
}
let listener = () => {};
let applyingOnQuit = false;

const newer = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

function set(next) {
  state = { ...state, ...next };
  listener(state);
}

function assetName(version) {
  if (process.platform === 'darwin') {
    return `book-report-pet-${version}-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}.zip`;
  }
  if (process.platform === 'win32') return `book-report-pet-${version}-win-x64.exe`;
  return null;
}

/** 지금 실행 중인 .app 경로. 개발 실행(npm start)이면 null. */
function installedApp() {
  if (process.platform !== 'darwin' || !app.isPackaged) return null;
  const bundle = path.resolve(process.execPath, '..', '..', '..');
  return bundle.endsWith('.app') ? bundle : null;
}

async function latestRelease() {
  const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'book-report-pet' },
  });
  if (!response.ok) throw new Error(`릴리스 목록 ${response.status}`);
  const releases = await response.json();
  return releases.find((release) => /^pet-v\d+\.\d+\.\d+$/.test(release.tag_name) && !release.draft);
}

async function download(url, file) {
  const response = await net.fetch(url);
  if (!response.ok || !response.body) throw new Error(`받기 실패 ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file));
}

function freeBytes(dir) {
  try {
    const stats = fs.statfsSync(dir);
    return stats.bavail * stats.bsize;
  } catch {
    return Infinity;
  }
}
const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)}MB`;

async function check() {
  if (!app.isPackaged || ['checking', 'downloading', 'ready', 'applying'].includes(state.status)) return;
  try {
    set({ status: 'checking', error: null });
    log(`확인 시작 (지금 ${app.getVersion()})`);
    const release = await latestRelease();
    const version = release && release.tag_name.replace(/^pet-v/, '');
    if (!version || !newer(version, app.getVersion())) {
      log(`새 버전 없음 (최신 ${version || '-'})`);
      set({ status: 'idle', version: null, checkedAt: Date.now() });
      return;
    }
    const name = assetName(version);
    const asset = release.assets.find((item) => item.name === name);
    if (!asset) {
      log(`${version}에 ${name} 파일이 없음`);
      set({ status: 'idle', version: null });
      return;
    }
    const dir = path.join(app.getPath('temp'), `book-report-pet-update-${version}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const free = freeBytes(dir);
    if (free < NEED_BYTES) {
      const message = `저장 공간이 모자라요. 남은 공간 ${mb(free)}, 필요한 공간 약 ${mb(NEED_BYTES)}. `
        + '시스템 설정 → 일반 → 저장 공간에서 정리하면 다음 확인 때 받아요.';
      log(`공간 부족: ${mb(free)}`);
      set({ status: 'idle', version, error: message });
      setTimeout(check, RETRY_MS); // 정리했을 수 있으니 조금 뒤 다시 본다
      return;
    }
    log(`${version} 받는 중`);
    set({ status: 'downloading', version });
    const file = path.join(dir, name);
    await download(asset.browser_download_url, file);

    let staged = file;
    if (process.platform === 'darwin') {
      const out = path.join(dir, 'out');
      await run('ditto', ['-x', '-k', file, out]);
      fs.rmSync(file, { force: true });
      const bundle = fs.readdirSync(out).find((entry) => entry.endsWith('.app'));
      if (!bundle) throw new Error('받은 파일에 앱이 없어요');
      staged = path.join(out, bundle);
      await run('xattr', ['-cr', staged]);
      await run('codesign', ['--verify', '--deep', '--strict', staged]); // 서명이 깨졌으면 바꿔 끼우지 않는다
    }
    log(`${version} 준비됨: ${staged}`);
    set({ status: 'ready', version, staged, error: null });
  } catch (error) {
    const message = String(error && error.message || error);
    log(`실패: ${message}`);
    set({ status: 'idle', error: `업데이트 중 문제가 생겼어요: ${message}` });
    setTimeout(check, RETRY_MS);
  }
}

/**
 * 받아 둔 새 버전으로 바꿔 끼운다. 이 앱이 끝난 뒤에 도는 작은 스크립트가 바꿔 끼우고,
 * relaunch면 새 앱을 띄운다.
 */
function apply({ relaunch }) {
  if (state.status !== 'ready') return false;
  if (process.platform === 'darwin') {
    const target = installedApp();
    if (!target) return false;
    const script = path.join(os.tmpdir(), `book-report-pet-swap-${Date.now()}.sh`);
    fs.writeFileSync(script, `#!/bin/bash
PID="$1"; TARGET="$2"; NEW="$3"; RELAUNCH="$4"
for i in $(seq 1 100); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
# 공간을 아끼려고 예전 앱은 지우고, 받아 둔 새 앱을 제자리로 옮긴다(같은 디스크라 복사하지 않는다)
rm -rf "$TARGET"
mv "$NEW" "$TARGET" 2>/dev/null || ditto "$NEW" "$TARGET"
xattr -cr "$TARGET"
rm -rf "$(dirname "$(dirname "$NEW")")"
[ "$RELAUNCH" = "1" ] && open "$TARGET"
rm -f "$0"
`, { mode: 0o755 });
    spawn('/bin/bash', [script, String(process.pid), target, state.staged, relaunch ? '1' : '0'],
      { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    // NSIS 설치 파일: /S는 조용히 설치, --force-run은 설치 뒤 앱을 띄운다
    const args = relaunch ? ['/S', '--force-run'] : ['/S'];
    spawn(state.staged, args, { detached: true, stdio: 'ignore' }).unref();
  } else {
    return false;
  }
  log(`${state.version} 적용 (다시 켜기: ${relaunch})`);
  set({ status: 'applying' });
  return true;
}

module.exports = {
  start(onChange) {
    listener = onChange || (() => {});
    setTimeout(check, FIRST_CHECK_MS);
    setInterval(check, CHECK_EVERY_MS);
    // 받아 두기만 하고 누르지 않았으면, 끌 때 조용히 바꿔 끼운다(다음 실행부터 새 버전)
    app.on('before-quit', () => {
      if (state.status === 'ready' && !applyingOnQuit) {
        applyingOnQuit = true;
        apply({ relaunch: false });
      }
    });
  },
  check,
  apply,
  logFile,
  state: () => state,
};
