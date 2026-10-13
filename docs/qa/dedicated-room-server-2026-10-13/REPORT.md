# 별도 게임 서버 구축·검수

2026-10-13. 사용자의 별도 게임 서버 구축 범위 승인에 따라 Node.js 상주 프로세스를 준비했다. **로컬 구현·검수 완료, 공개 호스팅 생성과 프런트 연결은 계정 연결 대기**다.

## 구현

- `scripts/room-server.mjs`: 독립 HTTP/WebSocket 서비스. `/healthz`와 `/ws`, 브라우저 Origin 제한, 연결 수 제한, 공식 지형 캐시 초기 준비, SIGTERM 연결 종료를 제공한다.
- 기존 검증된 방 규칙을 그대로 사용한다. 서버가 익명 참가자 ID·역할·수용 위치·피해를 소유하며, 피해자의 `hit-confirm`은 무시한다. 공식 홍콩 지도 검사 결과가 CLEAR일 때만 피해를 적용한다.
- Supabase service_role 비밀 키를 요구하지 않는다. 클라이언트 `VITE_WS_URL`을 지정하면 해당 서비스의 방 목록과 경기를 사용한다. Supabase 방과 별도 서버 방은 각각의 서버가 관리하므로 운영 전환은 프런트 재배포 시점에 한다.
- `render-room-server.yaml`: Singapore, 단일 인스턴스, **Free** 플랜, `npm ci --omit=dev`, `node scripts/room-server.mjs`, `/healthz`. 유료 플랜을 임의로 생성하거나 결제하지 않았다.

## 검수

`node scripts/check-room-server.mjs` 통과. [전체 결과](results.json).

실제 localhost HTTP/WebSocket에 8명을 참가시켜 준비·경기·경찰 2명 배정·실제 공식 지형의 열린 경로 주먹 공격을 검사했다. 수용된 위치 업데이트로 HP 100→75→50→25를 확인했으며, 실제 지도 벽을 가로지르는 공격과 위조 승인에는 HP 25가 유지됐다. 상태 준비·허용하지 않은 Origin 거부·HTTP 메서드 제한·서버 종료도 통과했다.

캐시가 준비된 열린 경로 공격의 로컬 왕복은 최신 결과에서 약 6.5~7.9ms였다. 이 수치는 인터넷 RTT, 호스팅 휴면 복구, 새 지역 지형 최초 다운로드를 포함하지 않는다. 운영 성능 수치로 표현하지 않는다.

실제 브라우저 두 개에서 방 생성, 참가, 양쪽 준비, 경기 시작, 이동을 확인했다. 경기 HUD는 2명과 HP 100을 표시했고 원격 캐릭터가 화면에 나타났다. 브라우저 error/warn 로그 표본은 없었다. [검수 화면](two-player-game.png).

## 공개 배포의 남은 단계

1. Render 계정 연결 후 `render-room-server.yaml`로 서비스 생성. 무료 플랜으로 설정되어 있으며 상시 실행 유료 플랜 선택은 비용 승인 후에만 한다.
2. 배포된 HTTPS `/healthz` 및 WSS `/ws` 확인.
3. Vercel의 `VITE_WS_URL=wss://실제-서비스-주소/ws`를 설정하고 재배포. 로컬 주소나 가짜 호스트를 운영 설정에 넣지 않는다.
4. 두 독립 브라우저와 8인 프로토콜 검사로 공개 서버의 실제 왕복·벽 차단·재접속·비활성·종료를 재검증한다.

현재 Render 연결이 확인되지 않아 공개 서비스 주소, 운영 전용 서버 응답 지연, 프런트 전환 완료를 주장하지 않는다. 기존 Supabase 서버의 공식 지형 피격 판정 수정과 검수는 별도로 완료됐다.

Render 공식 자료: [요금](https://render.com/pricing), [무료 서비스 제한](https://render.com/docs/free), [WebSocket](https://render.com/docs/websocket). 확인 시점 Starter는 월 $7부터이며, 무료 서비스는 유휴 상태에서 잠들 수 있다. 실제 사용량 및 플랜의 부가 비용은 생성 직전 다시 확인한다.
