// 펫 스스로 업데이트하기.
// GitHub 릴리스에서 새 버전(pet-v…)을 찾아 뒤에서 받아 두고, 준비되면 알린다.
// 사람이 "다시 시작"을 누르면 바로, 아니면 펫을 끌 때 바꿔 끼운다.
// (서명·공증을 하지 않는 앱이라 Squirrel 대신 직접 바꿔 끼운다.)
const { app, net, powerMonitor } = require('electron');
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
const CHECK_EVERY_MS = 30 * 60 * 1000;
const NEED_BYTES = 420 * 1024 * 1024;
const RETRY_MS = 30 * 60 * 1000;
const OFFLINE_RETRY_MS = 2 * 60 * 1000;
// 잠자기에서 막 깼거나 와이파이가 잠깐 끊긴 것처럼, 조금 뒤 저절로 풀리는 실패. 사람에게 알리지 않고 다시 본다
const passing = (message) => /ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|NETWORK_IO_SUSPENDED|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE|TIMED_OUT|CONNECTION_\w+|PROXY_\w+|SSL_PROTOCOL_ERROR)|fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|릴리스 목록 (403|429|5\d\d)|받기 실패 (403|429|5\d\d)/.test(message);
let retryTimer = null;
const retryIn = (ms) => { clearTimeout(retryTimer); retryTimer = setTimeout(check, ms); };

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

/** 받으면서 진행률(0~100)을 알린다. 너무 자주 알리지 않게 2%마다. */
async function download(url, file, onProgress) {
  const response = await net.fetch(url);
  if (!response.ok || !response.body) throw new Error(`받기 실패 ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  let received = 0;
  let reported = -1;
  const counting = new (require('node:stream').Transform)({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (total > 0) {
        const percent = Math.min(100, Math.floor((received / total) * 100));
        if (percent >= reported + 2 || percent === 100) {
          reported = percent;
          onProgress(percent);
        }
      }
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), counting, fs.createWriteStream(file));
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
  if (!app.isPackaged || ['checking', 'downloading', 'preparing', 'ready', 'applying'].includes(state.status)) return;
  if (!net.isOnline()) { // 인터넷이 아직 안 붙었으면 확인하지 않고 조금 뒤에 본다
    log('인터넷 연결 전이라 나중에 확인');
    retryIn(OFFLINE_RETRY_MS);
    return;
  }
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
    set({ status: 'downloading', version, progress: 0 });
    const file = path.join(dir, name);
    await download(asset.browser_download_url, file, (progress) => set({ status: 'downloading', version, progress }));
    set({ status: 'preparing', version, progress: 100 });

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
    if (passing(message)) {
      log(`잠깐 연결이 안 됨, 조금 뒤 다시: ${message}`);
      set({ status: 'idle', error: null });
      retryIn(OFFLINE_RETRY_MS);
      return;
    }
    log(`실패: ${message}`);
    set({ status: 'idle', error: `업데이트 중 문제가 생겼어요: ${message}` });
    retryIn(RETRY_MS);
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
    // 잠자기에서 깨면 인터넷이 다시 붙을 틈을 주고 확인한다
    powerMonitor.on('resume', () => retryIn(30 * 1000));
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
