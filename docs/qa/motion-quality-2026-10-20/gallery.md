# 모션별 화면 검수 기록

두 외형 모두 7개 구간 × 3방향의 최종 자세를 확인했다. 모든 등록 모션은 정상 속도로 끝까지 재생했다. 수정 영향이 큰 8개 동작은 두 외형에서 0.25배속으로도 재생했다. 재생은 실제 `Character.update()`의 60 FPS 기록을 사용하며 새로 보간한 원본 클립이 아니다.

| 모션 | 확인 요소 | 와이어 외형 | 전투 외형 | 재생 |
|---|---|---|---|---|
| idle | 시선·몸통 회전과 양발 지지 | [7구간·3방향](screenshots/web-idle.jpg) | [7구간·3방향](screenshots/combat-idle.jpg) | 1× |
| walk | 좌우 지지 교대·팔과 다리의 반대 움직임 | [7구간·3방향](screenshots/web-walk.jpg) | [7구간·3방향](screenshots/combat-walk.jpg) | 1× |
| regularRun | 골반·팔 스윙과 다리 회수 | [7구간·3방향](screenshots/web-regularRun.jpg) | [7구간·3방향](screenshots/combat-regularRun.jpg) | 1× / 0.25× |
| run | 상체 기울기·무릎 회수·뒤꿈치 들기 | [7구간·3방향](screenshots/web-run.jpg) | [7구간·3방향](screenshots/combat-run.jpg) | 1× |
| stop | 짧은 감속 구간의 발 지지 | [7구간·3방향](screenshots/web-stop.jpg) | [7구간·3방향](screenshots/combat-stop.jpg) | 1× |
| runStop | 감속·골반 낮춤·정지 회복, 종아리 비틀림 수정 | [7구간·3방향](screenshots/web-runStop.jpg) | [7구간·3방향](screenshots/combat-runStop.jpg) | 1× / 0.25× |
| zip | 당기는 팔·매달린 다리·진행 방향 기울기 | [7구간·3방향](screenshots/web-zip.jpg) | [7구간·3방향](screenshots/combat-zip.jpg) | 1× / 0.25× |
| turnLeft | 좌회전 방향·골반과 발 지지 | [7구간·3방향](screenshots/web-turnLeft.jpg) | [7구간·3방향](screenshots/combat-turnLeft.jpg) | 1× |
| turnRight | 우회전 방향·골반과 발 지지 | [7구간·3방향](screenshots/web-turnRight.jpg) | [7구간·3방향](screenshots/combat-turnRight.jpg) | 1× |
| jump | 웅크림·다리 회수·상체 균형 | [7구간·3방향](screenshots/web-jump.jpg) | [7구간·3방향](screenshots/combat-jump.jpg) | 1× |
| land | 무릎과 골반 굴곡·회복 | [7구간·3방향](screenshots/web-land.jpg) | [7구간·3방향](screenshots/combat-land.jpg) | 1× |
| jumpDown | 도약·하강·웅크림 원본 전체 구간 | [7구간·3방향](screenshots/web-jumpDown.jpg) | [7구간·3방향](screenshots/combat-jumpDown.jpg) | 1× |
| drop | 하강 초기 웅크림과 팔 펼침 | [7구간·3방향](screenshots/web-drop.jpg) | [7구간·3방향](screenshots/combat-drop.jpg) | 1× |
| jumpDownVariant | 하강 변형의 전신 실루엣 | [7구간·3방향](screenshots/web-jumpDownVariant.jpg) | [7구간·3방향](screenshots/combat-jumpDownVariant.jpg) | 1× |
| swing | 어깨·팔의 지지와 골반·다리 궤적 | [7구간·3방향](screenshots/web-swing.jpg) | [7구간·3방향](screenshots/combat-swing.jpg) | 1× / 0.25× |
| fall | 낙하 자세의 팔다리 방향 | [7구간·3방향](screenshots/web-fall.jpg) | [7구간·3방향](screenshots/combat-fall.jpg) | 1× |
| fallVariant | 등록된 낙하 변형의 전신 자세 | [7구간·3방향](screenshots/web-fallVariant.jpg) | [7구간·3방향](screenshots/combat-fallVariant.jpg) | 1× |
| fallIdle | 등록된 낙하 대기의 전신 자세 | [7구간·3방향](screenshots/web-fallIdle.jpg) | [7구간·3방향](screenshots/combat-fallIdle.jpg) | 1× |
| roll | 몸 말기·회전·일어나기 | [7구간·3방향](screenshots/web-roll.jpg) | [7구간·3방향](screenshots/combat-roll.jpg) | 1× |
| injuredIdle | 숙인 상체와 느린 무게 이동 | [7구간·3방향](screenshots/web-injuredIdle.jpg) | [7구간·3방향](screenshots/combat-injuredIdle.jpg) | 1× |
| wall | 손끝 지지·전완 회전·무릎 방향·발끝 지지, 전완 급회전 수정 | [7구간·3방향](screenshots/web-wall.jpg) | [7구간·3방향](screenshots/combat-wall.jpg) | 1× / 0.25× |
| combatIdle | 가드·상체 균형·뒷발 뒤꿈치 | [7구간·3방향](screenshots/web-combatIdle.jpg) | [7구간·3방향](screenshots/combat-combatIdle.jpg) | 1× |
| jab | 전진·주먹과 전완 정렬·가드 복귀 | [7구간·3방향](screenshots/web-jab.jpg) | [7구간·3방향](screenshots/combat-jab.jpg) | 1× |
| guard | 어깨·팔꿈치·주먹 위치와 지지 | [7구간·3방향](screenshots/web-guard.jpg) | [7구간·3방향](screenshots/combat-guard.jpg) | 1× |
| slam | 올려 모으기·내려찍기·상체 접힘 | [7구간·3방향](screenshots/web-slam.jpg) | [7구간·3방향](screenshots/combat-slam.jpg) | 1× |
| slamLand | 착지 낮춤·지지 다리·회복, 종아리 비틀림 수정 | [7구간·3방향](screenshots/web-slamLand.jpg) | [7구간·3방향](screenshots/combat-slamLand.jpg) | 1× / 0.25× |
| hook | 몸통 회전·타격 팔·가드 복귀, 종아리 비틀림 수정 | [7구간·3방향](screenshots/web-hook.jpg) | [7구간·3방향](screenshots/combat-hook.jpg) | 1× / 0.25× |
| heavy | 등록된 강공격의 전신 타격과 회복 | [7구간·3방향](screenshots/web-heavy.jpg) | [7구간·3방향](screenshots/combat-heavy.jpg) | 1× |
| hitHead | 머리·상체 피격 반응과 지지 | [7구간·3방향](screenshots/web-hitHead.jpg) | [7구간·3방향](screenshots/combat-hitHead.jpg) | 1× |
| rightHook | 보관된 파생 훅의 가드와 팔꿈치 궤적 | [7구간·3방향](screenshots/web-rightHook.jpg) | [7구간·3방향](screenshots/combat-rightHook.jpg) | 1× |
| cross | 골반·몸통 회전과 뒷손 직선 타격 | [7구간·3방향](screenshots/web-cross.jpg) | [7구간·3방향](screenshots/combat-cross.jpg) | 1× |
| airTrick | 몸 말기·전방 회전·다리 펼침 | [7구간·3방향](screenshots/web-airTrick.jpg) | [7구간·3방향](screenshots/combat-airTrick.jpg) | 1× / 0.25× |
| special | 전신 준비·타격·가드 복귀 | [7구간·3방향](screenshots/web-special.jpg) | [7구간·3방향](screenshots/combat-special.jpg) | 1× |
