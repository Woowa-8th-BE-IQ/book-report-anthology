// 맥 앱을 묶은 직후 ad-hoc 서명을 붙인다. 애플 실리콘은 서명이 깨진 앱을 실행하지 않는다.
// (개발자 인증서가 없으므로 공증은 하지 않는다. 받은 사람은 처음 한 번 '열기'를 눌러야 한다.)
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
};
