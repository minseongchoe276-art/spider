# 홍콩 경쟁전 서버 피격 판정 재검수 — 2026-10-13

기존 SEC-01/P1(피해자가 확인을 거부하면 공격이 무효가 되는 문제)을 서버 독립 판정으로 수정했다. 운영 PostgreSQL 마이그레이션과 `hong-kong-attack` Edge Function v3에 적용하고, 실제 게스트 두 명의 별도 테스트 경기에서 확인했다. 웹 클라이언트 배포 결과는 아래 최종 배포 기록으로 보완한다.

## 실제 운영 결과

[운영 검사](operating-live.json)는 실제 Supabase Auth JWT, 운영 Edge, 공식 홍콩 지도, DB에 저장된 HP를 사용했다. 기존 사용자 대신 새 테스트 참가자만 공격했고, 종료 후 방 탈퇴와 세션 종료를 수행했다.

| 검사 | 결과 |
| --- | --- |
| 실제 공식 지도 벽 뒤 공격 + 위조 `clear:true`/공격 좌표 | BLOCKED, HP 100 유지 |
| 열린 경로 공격, 피해자 확인 응답 없음 | HP 100 → 75 |
| 피해자의 승인·거부 요청 | HP 변경 없음 |
| authenticated 사용자의 최종 피해 RPC 직접 호출 | 권한 거부 |
| 인증 없는 Edge 호출 | HTTP 401 |

마지막 운영 표본의 벽 판정은 약 2.90초, 열린 경로는 약 2.43초였다. 실제 인증·DB·네트워크를 포함한 응답 시간이며 실시간 무지연을 보장하지 않는다. 느린 판정이 방 탈퇴를 막지 않도록 공격 요청을 제어 큐에서 분리했고, 떠난 방의 늦은 응답을 무시한다.

## 수정 내용과 방어 범위

1. 서버가 거리·방향·쿨다운을 검사한 후 잠긴 DB 행에서 공격 선분과 일회성 요청을 발급한다. 플레이어가 보낸 선분, mesh, clear 값은 판정 자료로 사용하지 않는다.
2. 공식 `data.map.gov.hk`의 지형·건물·기반시설 세 층에서 선분과 겹치는 관련 하위 타일을 탐색한다. 카메라에 보이는 일부 mesh만 읽는 방식은 사용하지 않는다. 타일 transform, glTF 축, B3DM/GLB 및 RTC 중심을 클라이언트 좌표계와 맞춘다. 좌표 변환 비교의 최대 오차는 약 2.79×10⁻⁹였다.
3. 실제 원본 바이트의 SHA-256 기록을 포함한 CLEAR 결과만 service_role 전용 함수로 전달한다. BLOCKED·UNKNOWN·다운로드 실패·지원하지 않는 형식은 피해를 주지 않는다. 파일 크기·탐색량·캐시·시간 제한을 적용했다.
4. 방→요청→플레이어 순서로 잠그고 요청을 한 번 소비한다. 기한·경기 라운드·팀·참가 상태·구조 후 생명 버전을 검사해 늦은 판정과 재전송이 다음 생명이나 경기로 넘어가지 않게 했다.
5. Node/WebSocket 서버에도 독립 지형 판정을 적용했다. 브라우저의 구형 `hit-confirm`은 피해를 승인하거나 요청을 삭제하지 못한다. Edge는 실제 Supabase Auth `getUser` 인증 후에만 게임 RPC를 호출한다.

## 검증 근거

- [공식 지형 검사](official-terrain.json): 실제 벽/열린 경로, 캐시 결과 일치, 오프라인·잘못된 좌표에서 UNKNOWN.
- [25개 지도 표본](map-grid.json): x/z −2200~2200m에서 대표 선분 검사, UNKNOWN 0, 캐시 약 10.25MB. 이 표본이 모든 향후 지도 데이터를 보장하는 것은 아니다.
- [실제 PostgreSQL 권한 검사](postgres-authority.json): 피해자 조작, BLOCKED/UNKNOWN, 출처 누락, 기한 만료, 구조 후 지연, 다음 라운드 지연, 병렬 요청의 정확히 한 번 반영, 최종 함수 권한 등 9개 검사 통과. Auth 식별과 Realtime 송신만 로컬 대체이며 DB 행·권한·잠금·트랜잭션은 실제 PostgreSQL이다.
- 전체 기존 PostgreSQL 16개 이동·구조·역할·시간·목표·동시 요청 검사와 게임/모션 회귀 검사 및 production build는 [최종 합격 실행](../acceptance-2026-10-13/execution.json)에 기록한다.
- [실제 Chromium SDK 검사](browser-sdk.json): 브라우저가 실제 SupabaseRooms 모듈을 읽고 두 운영 게스트 세션으로 공격을 전송했다. hong-kong-attack 호출 1회, HP 75, page error 0. 시각적 게임플레이 검사와 구분한다.
- GLB/B3DM binary RTC·CESIUM RTC·축 변환·잘못된 데이터·크기 제한 검사와 느린 공격 중 탈퇴/응답 폐기 검사를 포함한다. Deno 타입 검사는 [로그](deno-check.log)에 기록했다.
- [운영 Edge 소스 일치](deployed-edge.json): v3의 배포 소스를 다시 읽어 로컬 index.ts, 지형 모듈, import map의 SHA-256 일치를 확인했다.

운영 SQL `prosrc` MD5는 game_command `af4efea58cb4f1a3557b8ef534d641d1`, resolver `e534dc57b664d62d9544e9135543ba4e`이다. 직접 테이블/비공개 스키마 제한과 service_role 전용 피해 확정 권한을 운영에서 재확인했다. [운영 함수 확인](../acceptance-2026-10-13/operating-verification.json).

Security Advisor는 전후 동일한 4종(총 10개 finding)이었다: RLS 정책 없음 INFO 2, 의도된 authenticated SECURITY DEFINER 호출 WARN 6, 게스트 Realtime 정책 WARN 1, 비밀번호 유출 보호 설정 WARN 1. 기존 알림을 숨기려고 권한을 확대하지 않았다. [전](advisors-before.json), [후](advisors-after.json).

최종 고정 배포본의 `npm run verify:acceptance`는 12개 필수 조건 모두 PASS였다. 공유 작업 폴더에서 별도 수정이 검사 중 바뀐 첫 실행은 소스 고정 조건에서 실패했으며, [당시 실행](acceptance-concurrent-source-changes.json)을 보존했다. 이후 이번 배포본만 격리해 전체 검사를 다시 통과했다.

## 판정과 복구

재현됐던 피해자 거부 결함은 위의 검증 범위에서 해소됐다. 이는 홍콩 전체 이동을 서버 물리로 시뮬레이션하거나 모든 기기·장시간 성능·향후 지도 변경까지 완벽하다는 판정은 아니다. 지형이 준비되지 않은 경우 공격이 보류될 수 있으며, 실제 운영 응답 지연은 위 수치대로 남아 있다.

적용 마이그레이션: `supabase/migrations/20261013063126_authoritative_hong_kong_hits.sql`. 변경 직전 운영 game_command는 [rollback-command.sql](rollback-command.sql)에 보존했다. 이전 함수로 복구하면 기존 피해자 거부 결함이 다시 생기므로 복구 후 별도 재검증이 필요하다.
