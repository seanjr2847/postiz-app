# Video Studio 포크 — 로컬 셋업 & 컴파일 검증 (Node 22)
# 사용: PowerShell 에서  ./setup-video-studio.ps1   (Volta 설치 시 관리자 권장)
# Postiz 는 Node 22 요구(>=22.12 <23). 시스템 Node 24 는 install/build 를 깨뜨림.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 1) Node 22 확보 (Volta — 레포 package.json 의 volta.node=22 를 자동 사용)
if (-not (Get-Command volta -ErrorAction SilentlyContinue)) {
  Write-Host "== Volta 설치 (winget) ==" -ForegroundColor Cyan
  winget install --id Volta.Volta -e --accept-source-agreements --accept-package-agreements
  $env:Path = "$env:LOCALAPPDATA\Volta\bin;$env:Path"
}
volta install node@22
Write-Host "node: $(node -v)  (22.x 이어야 함)" -ForegroundColor Green

# 2) 의존성 + Prisma client(MarketingBrand/Variant 포함) 생성
# Node24 로 깔린 부분 node_modules 는 버리고 Node22 로 깨끗이.
if (Test-Path node_modules) { Write-Host '== 기존 node_modules 제거(Node24 잔재) =='; Remove-Item node_modules -Recurse -Force }
corepack enable
pnpm install                # postinstall 이 prisma generate 수행
pnpm run prisma-generate    # 확실히 재생성

# 3) 컴파일 검증 — 바뀐 프로젝트만 (backend=백엔드+nestjs-libraries, frontend=페이지)
Write-Host "== build:backend (컨트롤러·서비스·Prisma 타입 검증) ==" -ForegroundColor Cyan
pnpm run build:backend
Write-Host "== build:frontend (/video-studio 페이지 검증) ==" -ForegroundColor Cyan
pnpm run build:frontend

Write-Host ""
Write-Host "✅ 컴파일 통과 — Video Studio 스캐폴드가 실제로 빌드됩니다." -ForegroundColor Green
Write-Host "다음: docker-compose(postiz-docker-compose) 로 풀 스택 기동 → REMOTION_RENDER_URL 로 렌더 서비스 연결 → /video-studio 확인" -ForegroundColor Yellow
