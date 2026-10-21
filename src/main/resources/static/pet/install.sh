#!/bin/bash
# 남의 독후감 펫 설치 (맥)
#   curl -fsSL https://book-report-anthology.onrender.com/pet/install.sh | bash
# 최신 펫을 받아 /Applications/BookReportPet.app 에 설치하고 바로 띄운다.
# 공간을 아끼려고 새 앱을 먼저 받아 검증한 뒤, 예전 펫은 지우고 새 앱을 제자리로 옮긴다.
# (설정·개인 링크는 ~/Library/Application Support 에 있어서 그대로 남는다.)
set -euo pipefail

REPO="Woowa-8th-BE-IQ/book-report-anthology"
APP="/Applications/BookReportPet.app"
NEED_KB=420000   # 받은 zip(약 100MB) + 풀어 둔 앱(약 270MB) + 여유. 예전 앱은 교체할 때 지운다

say() { printf '\033[1;33m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || fail "맥에서만 쓸 수 있어요. 윈도우는 PowerShell 명령을 써 주세요."
ARCH=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64)

FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
if [ "${FREE_KB:-0}" -lt "$NEED_KB" ]; then
  fail "저장 공간이 모자라요. 남은 공간 $((FREE_KB / 1024))MB, 필요한 공간 약 $((NEED_KB / 1024))MB예요. 시스템 설정 → 일반 → 저장 공간에서 정리한 뒤 다시 실행해 주세요."
fi

say "최신 펫을 찾는 중…"
TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=30" 2>/dev/null \
  | grep -o '"tag_name": *"pet-v[^"]*"' | head -1 | sed 's/.*"\(pet-v[^"]*\)"/\1/' || true)
TAG=${TAG:-pet-v0.1.4}
VERSION=${TAG#pet-v}
URL="https://github.com/$REPO/releases/download/$TAG/book-report-pet-$VERSION-mac-$ARCH.zip"

# 같은 디스크 안에 풀어 두면 /Applications 로 옮길 때 복사 없이 자리만 바뀐다
WORK=$(mktemp -d "${TMPDIR:-/tmp}/book-report-pet.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

say "받는 중 ($VERSION, $ARCH)…"
curl -fL --progress-bar -o "$WORK/pet.zip" "$URL" || fail "받지 못했어요: $URL"
ditto -x -k "$WORK/pet.zip" "$WORK/out" || fail "압축을 풀지 못했어요. 저장 공간을 확인해 주세요."
rm -f "$WORK/pet.zip"
NEW=$(ls -d "$WORK"/out/*.app 2>/dev/null | head -1)
[ -n "$NEW" ] || fail "받은 파일 안에 앱이 없어요."
xattr -cr "$NEW"
codesign --verify --deep --strict "$NEW" 2>/dev/null || fail "받은 앱의 서명이 깨져 있어요. 잠시 뒤 다시 시도해 주세요."

# 켜져 있는 예전 펫은 끄고, 예전 앱은 지운다(새 앱은 이미 받아 검증했다)
pkill -x BookReportPet 2>/dev/null || true
pkill -f "남의 독후감 펫.app" 2>/dev/null || true
sleep 1
for OLD in "$APP" "/Applications/남의 독후감 펫.app"; do
  if [ -d "$OLD" ]; then rm -rf "$OLD"; fi
done

say "설치하는 중…"
mv "$NEW" "$APP" 2>/dev/null || ditto "$NEW" "$APP" || fail "/Applications 에 넣지 못했어요."
xattr -cr "$APP"

open "$APP"
printf '\n\033[1;32m✓ 펫을 띄웠어요 (%s)\033[0m\n' "$VERSION"
printf '  처음이면 창이 떠요. 문집 화면의 "내 개인 링크"를 복사해 붙여 넣어 주세요.\n'
printf '  메뉴 막대의 책 얼굴 아이콘에서 숨기기·산책·끝내기를 할 수 있어요.\n'
