# 모바일 조작 검증 — 2026-10-19

적용 계획: ../../mobile-controls-plan.md

검증 완료:
- `npm run test:touch`: 포인터 소유권·스틱·동시 입력 검사 및 입력 수명주기 14개 시나리오 통과.
- `node scripts/check-gameplay.mjs`: 이동, 점프, 충돌, 프레임률 독립성 검사 통과.
- `node scripts/check-reticle-only.mjs`: 조준점 전용 부착 및 허공 발사 검사 통과.
- `npm run build`: 성공. 기존 대형 번들 경고는 남아 있음.
- 개발용 `touchReview` 화면에서 390×844 세로, 844×390 가로 배치 확인.
- 화면 조작으로 스틱 이동, 점프, 전투 전환, 보조 메뉴, 지도 열기/닫기, 일시정지/계속하기 확인.
- 가로 화면 증빙: landscape.png.

검증 한계:
- 브라우저 화면 크기 테스트와 입력 시뮬레이션이며 실제 iOS/Android 하드웨어 테스트는 아님.
- 개발용 `touchReview`는 프로덕션에서 활성화되지 않음. 실제 기기는 터치 지원을 자동 감지함.
- 운영 사이트 배포는 수행하지 않음.
