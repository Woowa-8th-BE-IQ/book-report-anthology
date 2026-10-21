# 남의 독후감 펫 설치 (윈도우)
#   irm https://book-report-anthology.onrender.com/pet/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$repo = 'Woowa-8th-BE-IQ/book-report-anthology'
Write-Host '▸ 최신 펫을 찾는 중…'
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases?per_page=30" |
  Where-Object { $_.tag_name -like 'pet-v*' } | Select-Object -First 1
$asset = $release.assets | Where-Object { $_.name -like '*win-x64.exe' } | Select-Object -First 1
if (-not $asset) { throw '윈도우용 설치 파일을 찾지 못했어요.' }
$file = Join-Path $env:TEMP $asset.name
Write-Host "▸ 받는 중 ($($release.tag_name))…"
Invoke-WebRequest $asset.browser_download_url -OutFile $file
Write-Host '▸ 설치하는 중…'
Start-Process $file -Wait
Write-Host ''
Write-Host '✓ 설치했어요. 펫 창이 뜨면 문집 화면의 "내 개인 링크"를 붙여 넣어 주세요.' -ForegroundColor Green
