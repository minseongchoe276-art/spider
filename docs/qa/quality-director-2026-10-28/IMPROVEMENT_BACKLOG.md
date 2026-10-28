# 개선 백로그

유형은 지시문의 BUG, POLISH, PERFORMANCE, GAMEPLAY, VISUAL, ACCESSIBILITY, SECURITY, DESIGN_PROPOSAL이다. 자동 수정은 하지 않은 항목이다.

## BUG로 보지 않은 것

하늘 중앙에 줄이 안 붙는 것. 재현: 피치를 -1.1까지 올리고 좌클릭. 문구가 뜨고 낙하한다. 피치 -0.9에서 같은 클릭은 붙는다. 원인: 판정이 화면 중앙 광선이다.

## POLISH

1. 차량 호출 바가 전투와 스윙 화면 하단을 항상 가린다.  
   위치: 현재 작업 트리의 차량 UI. `06-special.png`, `10-settled-swing.png`.  
   영향: 능력 아이콘과 발밑이 경쟁한다.  
   난이도: 낮음. 부작용: 호출을 숨기면 탑승을 못 찾을 수 있다.  
   우선순위: 차량 작업이 끝난 뒤.  
   검증: 스윙 중에는 바가 없고, 차 옆에서는 생긴다.

2. 훅 리뷰 45% 프레임이 직선 주먹으로 읽힌다.  
   위치: `motion-hook.png`, 클립 hook.  
   영향: E의 이름과 실루엣이 다를 수 있다. 한 프레임이라 확정은 아니다.  
   난이도: 모션 수정은 중간.  
   우선순위: 중. REVIEW_REQUIRED.  
   검증: 타격 구간 세 장을 정면·측면에서 다시 찍는다.

3. `webFailureReason`이 부착 성공 뒤에도 “대상 없음”으로 남는다.  
   위치: `SwingPhysics.findBestAnchor` 첫 줄. `aim-sweep.json`의 성공 행.  
   영향: 플레이어 토스트는 실패 때만 뜬다. 진단만 헷갈린다.  
   난이도: 한 줄.  
   우선순위: 낮음. 다음 진단 패스에서 AUTO_FIX 후보.

## PERFORMANCE

점프·낙하에서 프레임 하나가 약 100ms였다. 1% 저하 10fps. 원인 미분리. 패치하지 않음. 같은 구간을 Chrome 성능 패널로 한 번 찍는 것이 다음 일이다.

## GAMEPLAY

점프 초기 수직 속도 26m/s. 1.5초에 고도가 약 12m 올랐다. 의도된 도약이면 유지. 줄 없이 지붕을 넘는 느낌이 세다. 물리 값 변경은 APPROVAL_REQUIRED.

## VISUAL

절차 도시 스폰이 기둥과 원통뿐이다. 미니맵은 더 빽빽하다. 첫 화면의 도시 밀도를 스폰 요 변경으로 올릴지는 DESIGN_PROPOSAL에 가깝다. 그래픽 제안은 `GRAPHICS_REVIEW.md`.

## ACCESSIBILITY

PageUp, PageDown, Home, End로 시선이 움직인다. Pointer Lock 없이 플레이가 가능하다. 안내가 그 키를 첫 화면에 보여 주는지는 확인하지 않았다. 다음 검사: 레슨 문장에 키보드 시선이 있는지.

## SECURITY

`vite.config.js`는 `GAME_ADMIN_TOKEN`이 없으면 개발용 토큰을 넣는다. 운영 서버의 토큰을 바꾸거나 로그를 보지 않았다. 키 교체와 운영 배포는 APPROVAL_REQUIRED.

## DESIGN_PROPOSAL

- 중앙 광선만 인정하는 스윙을 유지할지, 건물 실루엣이 화면의 큰 부분을 차지할 때 가까운 면을 집게 할지는 조작 정체성 문제다. 에너지 와이어는 조준 스윙이므로 자동 보정은 승인 없이 넣지 않는다.
- 57개 모션 목표는 현재 37개 카탈로그와 맞지 않는다. 개수를 늘리기 전에 어떤 37개가 플레이에 쓰이는지 정리하는 편이 맞다.
