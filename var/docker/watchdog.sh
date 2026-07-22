#!/bin/sh
# ponytail: 백엔드 부팅 행(zombie) 워치독 — 컨테이너가 SUCCESS 로 떠도 backend 가
# :3000 리슨을 안 하는 간헐 현상(원인 미상, pm2 restart 로 항상 즉시 회복)에 대한
# 자동 복구. 60초 주기로 살아있는지 확인하고 죽어 있으면 재시작한다.
while true; do
  sleep 60
  wget -qO- -T 5 http://localhost:3000/auth/can-register >/dev/null 2>&1 \
    || pm2 restart backend
done
