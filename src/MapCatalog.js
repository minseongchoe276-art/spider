// One identity for geometry, navigation, maps and per-map exploration saves.
export const LOCAL_MAPS = Object.freeze([
  {id:'procedural',name:'네온 도심',en:'Neon Core',tag:'추천 · 균형형',tagEn:'Recommended · Balanced',description:'중층과 고층을 잇는 스윙 루프',descriptionEn:'A swing loop between mid-rise blocks and towers',seed:0x5f3759df,height:1,street:28,block:32,accent:'#65e8ed',sky:0x93c5dc,glass:0x8eb8ca,brick:0xba959d,dark:0x707fa4},
  {id:'harbor',name:'선셋 항만',en:'Sunset Harbor',tag:'여유로운 시야',tagEn:'Open sightlines',description:'해안 크레인과 컨테이너, 낮은 창고 지대',descriptionEn:'Waterfront cranes, containers and low warehouse rooftops',seed:27182,height:.48,street:36,block:24,accent:'#ffbc80',sky:0xe9b89a,glass:0xc3b7a2,brick:0xc07b60,dark:0x536c86},
  {id:'gardens',name:'스카이 가든',en:'Sky Gardens',tag:'탐험 · 입문',tagEn:'Explore · Beginner',description:'중앙 공원을 둘러싼 계단식 옥상 정원',descriptionEn:'Stepped roof gardens surrounding a central park',seed:31415,height:.68,street:30,block:30,accent:'#a9e6a0',sky:0xa4d4cb,glass:0xa5cab8,brick:0xc5b994,dark:0x638f81},
  {id:'old-town',name:'브릭 구시가지',en:'Brick Quarter',tag:'근접 전투',tagEn:'Close combat',description:'엇갈린 골목과 시장 광장의 벽 이동 루트',descriptionEn:'Staggered alleys and wall routes around a market square',seed:16180,height:.56,street:18,block:42,accent:'#eda993',sky:0xcbd0d8,glass:0xc9b8a0,brick:0xb8755d,dark:0x797989},
  {id:'skyline',name:'크라운 금융가',en:'Crown Skyline',tag:'고도 · 숙련',tagEn:'Altitude · Advanced',description:'중앙 첨탑과 공중 연결로의 수직 스윙',descriptionEn:'Vertical swings around a central spire and skywalks',seed:57721,height:1.3,street:26,block:34,accent:'#b6adff',sky:0xa2b1d4,glass:0xa9b8df,brick:0xa2a7bd,dark:0x6c7299},
]);
export function localMap(id){return LOCAL_MAPS.find(map=>map.id===id)||LOCAL_MAPS[0];}
export function mapName(id,language='ko'){return id==='hong-kong'?(language==='en'?'Hong Kong':'홍콩'):localMap(id)[language==='en'?'en':'name'];}
