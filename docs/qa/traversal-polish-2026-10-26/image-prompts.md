# 기술 이미지 제작 기록

기본 제공 image_gen 도구로 생성하고 같은 도구로 수정했다. 최종 아틀라스는 `docs/qa/traversal-polish-2026-10-26/ability-source.png`, 게임이 읽는 압축본은 `public/images/ability-atlas-v2.jpg`다. 네 가지 그림은 CSS background-position으로 분할하여 사용한다.

최초 프롬프트:

> Use case: stylized-concept. Asset type: game HUD ability icon atlas texture, four equal square tiles in a single horizontal row, 1536 by 384 composition. Primary request: premium realistic cinematic game ability artwork on very dark charcoal backgrounds: tile 1 violet circular energy pulse; tile 2 cyan taut web tether shooting forward; tile 3 magenta explosive fist impact; tile 4 silver fast evasive footstep and curved motion trail. Material: physically rendered luminous silk, fine atmospheric particles, sharp detailed metal and energy, restrained bloom. Each motif centered within its own equal tile with generous dark margins. No text, no letters, no numbers, no borders, no vector illustration, no flat symbols, no superhero logos. These will be cropped into four separate HUD icons.

최종 수정 프롬프트:

> Edit this game HUD texture atlas. Keep the four equal vertical tile layout, dark cinematic physically rendered detailed style and first violet pulse tile and third magenta fist impact tile unchanged. In tile 2 replace the metal harpoon/spear with only a taut luminous cyan silk web tether, a bundle of fine interwoven strands extending diagonally away, no weapon or metal tip. In tile 4 replace the boot and dodge motion with a silver armored forearm raised in a defensive block, surrounded by a subtle curved translucent silver protective shield, clear guard/block ability silhouette. No text, no letters, no logos, no UI borders. Keep tile boundaries at exactly 25, 50, and 75 percent of image width.

최종 파일을 직접 열어 확인했으며 JPEG 포맷 변환으로 배포 크기를 줄였다. 최초 회피 그림은 사용하지 않는다. 현재 네 번째 그림은 B 방어다.
