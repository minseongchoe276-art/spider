# 별도 게임 서버 구축·검수

2026-10-13. 사용자의 별도 게임 서버 구축 범위 승인에 따라 Node.js 상주 프로세스를 준비했다. **공개 무료 서버 생성·8인 검수 완료, 운영 프런트 연결 배포 진행**다.

## 구현

- `scripts/room-server.mjs`: 독립 HTTP/WebSocket 서비스. `/healthz`와 `/ws`, 브라우저 Origin 제한, 연결 수 제한, 공식 지형 캐시 초기 준비, SIGTERM 연결 종료를 제공한다.
- 기존 검증된 방 규칙을 그대로 사용한다. 서버가 익명 참가자 ID·역할·수용 위치·피해를 소유하며, 피해자의 `hit-confirm`은 무시한다. 공식 홍콩 지도 검사 결과가 CLEAR일 때만 피해를 적용한다.
- Supabase service_role 비밀 키를 요구하지 않는다. 클라이언트 `VITE_WS_URL`을 지정하면 해당 서비스의 방 목록과 경기를 사용한다. Supabase 방과 별도 서버 방은 각각의 서버가 관리하므로 운영 전환은 프런트 재배포 시점에 한다.
- `render-room-server.yaml`: Singapore, 단일 인스턴스, **Free** 플랜, `npm ci --omit=dev`, `node scripts/room-server.mjs`, `/healthz`. 유료 플랜을 임의로 생성하거나 결제하지 않았다.

## 검수

`node scripts/check-room-server.mjs` 통과. [전체 결과](results.json).

실제 localhost HTTP/WebSocket에 8명을 참가시켜 준비·경기·경찰 2명 배정·실제 공식 지형의 열린 경로 주먹 공격을 검사했다. 수용된 위치 업데이트로 HP 100→75→50→25를 확인했으며, 실제 지도 벽을 가로지르는 공격과 위조 승인에는 HP 25가 유지됐다. 상태 준비·허용하지 않은 Origin 거부·HTTP 메서드 제한·서버 종료도 통과했다.

캐시가 준비된 열린 경로 공격의 로컬 왕복은 최신 결과에서 약 8.0~12.7ms였다. 이 수치는 인터넷 RTT, 호스팅 휴면 복구, 새 지역 지형 최초 다운로드를 포함하지 않는다. 운영 성능 수치로 표현하지 않는다.

실제 브라우저 두 개에서 방 생성, 참가, 양쪽 준비, 경기 시작, 이동을 확인했다. 경기 HUD는 2명과 HP 100을 표시했고 원격 캐릭터가 화면에 나타났다. 브라우저 error/warn 로그 표본은 없었다. [검수 화면](two-player-game.png).

`check-public-room-server.mjs`는 실제 공개 주소에서 8인 경기, 시작 8초 여유, 공식 벽 차단, 피해자의 확인 조작, 관전 상태 재접속, 테스트 방 정리를 검증하도록 준비했다. [localhost 사전 검증](protocol-local-results.json)을 통과했으며, 캐시가 만료된 첫 공격은 약 1.14초, 다음 반복은 약 5.2·11.5ms였다. 이는 공개 호스팅의 검증 결과가 아니다.

## 공개 배포

사용자가 확인한 Render 워크스페이스에 Free 플랜·Singapore·단일 인스턴스로 생성했다. [공개 서버](https://minogame-room-authority.onrender.com/healthz), [배포 기록](deployment.json). 실제 상태 확인은 HTTP 200, 공식 지형 준비는 CLEAR였다. 생성 API가 HTTP health-check 경로 설정을 제공하지 않아 Render의 관리형 검사 경로는 기본 포트 검사이며, `/healthz`는 직접 검증했다.

[공개 8인 검사](public-results.json)는 서버의 실제 8초 시작 여유·공격 cooldown을 사용했다. 열린 경로 공격 왕복은 검증 머신에서 약 130~139ms였다. 실제 벽은 피해를 차단했고, 탈락한 플레이어가 재접속해도 동일 ID·HP 0·관전 상태가 유지됐다. 검사용 방만 정리한 뒤에도 서버가 정상 응답했다. 최근 error 로그 표본은 0개, 메모리 표본은 약 103MiB였다. 장시간·다지역 부하 전체를 보장하는 수치는 아니다.

프런트는 공개 주소만 담은 `.env.production`의 `VITE_WS_URL`로 연결한다. 다른 채팅의 미커밋 변경을 포함하지 않은 커밋 소스에서 production build를 수행했고, 생성된 JS에서 실제 WSS 주소를 확인했다. [빌드](production-build.log), [번들 지문](production-bundle.json). 운영 사이트의 새 번들과 실제 브라우저 2인 경기 검증은 연결 배포 후 기록한다.

무료 서비스의 유휴 복구와 서버 재시작 시 메모리 방 소멸은 남아 있다. 유료 리소스 생성이나 결제는 수행하지 않았다. 서버 성능과 연결 검증을 전체 게임의 모든 미래 상황에 대한 무결함 판정으로 확대하지 않는다.

Render 공식 자료: [요금](https://render.com/pricing), [무료 서비스 제한](https://render.com/docs/free), [WebSocket](https://render.com/docs/websocket).
