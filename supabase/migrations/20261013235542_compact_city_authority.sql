-- Match the compact rendered city and Node authority: 16 buildings, 184 solids, +/-160m.
-- Private collision data, authenticated command permissions and Hong Kong worker privileges remain in force.
delete from game.city_solids;
insert into game.city_solids(id,bounds) values
(1,array[-106,-0.0000015592905384664846,-106,-74,93.99197994705712,-74]::double precision[]),
(2,array[-106,93.99197836392472,-74.80000000596047,-74,95.19197841160843,-73.99999999403954]::double precision[]),
(3,array[-106,93.99197836392472,-106.00000000596046,-74,95.19197841160843,-105.19999999403953]::double precision[]),
(4,array[-74.80000000596047,93.99197836392472,-105.19999980926514,-73.99999999403954,95.19197841160843,-74.80000019073486]::double precision[]),
(5,array[-106.00000000596046,93.99197836392472,-105.19999980926514,-105.19999999403953,95.19197841160843,-74.80000019073486]::double precision[]),
(6,array[-101.51999998092651,93.99197836392472,-101.51999998092651,-94.48000001907349,97.19197841160843,-94.48000001907349]::double precision[]),
(7,array[-90.0117816478014,93.99197836392472,-88.55563379079103,-85.0236339122057,96.19197841160843,-85.42797566205263]::double precision[]),
(8,array[-46,3.602297162785817e-7,-106,-14,60.411407830932845,-74]::double precision[]),
(9,array[-42,60.41140908123282,-102,-18,93.36308449627188,-78]::double precision[]),
(10,array[-38,93.36308583137726,-98,-22,109.8389235388968,-82]::double precision[]),
(11,array[-38,109.83892396009006,-82.80000000596047,-22,111.03892400777377,-81.99999999403954]::double precision[]),
(12,array[-38,109.83892396009006,-98.00000000596046,-22,111.03892400777377,-97.19999999403953]::double precision[]),
(13,array[-22.800000005960463,109.83892396009006,-97.19999980926514,-21.999999994039534,111.03892400777377,-82.80000019073486]::double precision[]),
(14,array[-38.000000005960466,109.83892396009006,-97.19999980926514,-37.19999999403954,111.03892400777377,-82.80000019073486]::double precision[]),
(15,array[-35.75999999046326,109.83892396009006,-95.75999999046326,-32.24000000953674,113.03892400777377,-92.24000000953674]::double precision[]),
(16,array[-32.52193169109523,109.83892396009006,-91.05560867860913,-27.52814774028957,112.03892400777377,-86.91673462465405]::double precision[]),
(17,array[-29.97682628966868,109.83892396009006,-95.02756165340543,-26.88605914451182,112.03892400777377,-91.05096219852567]::double precision[]),
(18,array[-29.5478481836617,109.83892396009006,-92.90234351530671,-24.355643708258867,112.03892400777377,-89.27491879835725]::double precision[]),
(19,array[-30.600000023841858,109.83892396996208,-90.60000002384186,-29.399999976158142,143.80148653099724,-89.39999997615814]::double precision[]),
(20,array[-30.69999998807907,143.10148652894833,-90.69999998807907,-29.30000001192093,144.50148650510647,-89.30000001192093]::double precision[]),
(21,array[14,-2.939699186299549e-7,-106,46,107.98807496237774,-74]::double precision[]),
(22,array[14,107.98807464456596,-74.80000000596047,46,109.18807469224967,-73.99999999403954]::double precision[]),
(23,array[14,107.98807464456596,-106.00000000596046,46,109.18807469224967,-105.19999999403953]::double precision[]),
(24,array[45.19999999403954,107.98807464456596,-105.19999980926514,46.000000005960466,109.18807469224967,-74.80000019073486]::double precision[]),
(25,array[13.999999994039536,107.98807464456596,-105.19999980926514,14.800000005960465,109.18807469224967,-74.80000019073486]::double precision[]),
(26,array[18.480000019073486,107.98807464456596,-101.51999998092651,25.519999980926514,111.18807469224967,-94.48000001907349]::double precision[]),
(27,array[29.17190345004201,107.98807464456596,-98.59893052279949,32.98739631846547,110.18807469224967,-95.2280375212431]::double precision[]),
(28,array[29.399999976158142,107.98807452358716,-90.60000002384186,30.600000023841858,126.20002291836255,-89.39999997615814]::double precision[]),
(29,array[29.30000001192093,125.50002278546282,-90.69999998807907,30.69999998807907,126.90002276162096,-89.30000001192093]::double precision[]),
(30,array[74,-2.8524125639250997e-7,-106,106,67.85201234903609,-74]::double precision[]),
(31,array[74,67.85201203995297,-74.80000000596047,106,69.05201208763668,-73.99999999403954]::double precision[]),
(32,array[74,67.85201203995297,-106.00000000596046,106,69.05201208763668,-105.19999999403953]::double precision[]),
(33,array[105.19999999403953,67.85201203995297,-105.19999980926514,106.00000000596046,69.05201208763668,-74.80000019073486]::double precision[]),
(34,array[73.99999999403954,67.85201203995297,-105.19999980926514,74.80000000596047,69.05201208763668,-74.80000019073486]::double precision[]),
(35,array[78.48000001907349,67.85201203995297,-101.51999998092651,85.51999998092651,71.05201208763668,-94.48000001907349]::double precision[]),
(36,array[94.05759103223681,67.85201203995297,-85.94391482695937,98.12509114667773,70.05201208763668,-82.82317417487502]::double precision[]),
(37,array[91.2353335134685,67.85201203995297,-85.00414412841201,94.74109632894397,70.05201208763668,-80.69333785399795]::double precision[]),
(38,array[96.49607695490121,67.85201206379483,-83.5199999973178,96.70392304509878,72.85201206379483,-83.28000000268221]::double precision[]),
(39,array[99.29607695490122,67.85201206379483,-83.5199999973178,99.50392304509879,72.85201206379483,-83.28000000268221]::double precision[]),
(40,array[96.49607695490121,67.85201206379483,-80.71999999731779,96.70392304509878,72.85201206379483,-80.4800000026822]::double precision[]),
(41,array[99.29607695490122,67.85201206379483,-80.71999999731779,99.50392304509879,72.85201206379483,-80.4800000026822]::double precision[]),
(42,array[95.59999990463257,72.85201206379483,-84.40000009536743,100.40000009536743,77.35201206379483,-79.59999990463257]::double precision[]),
(43,array[95.40000009536743,77.3520120876367,-84.59999990463257,100.59999990463257,79.15201203995298,-79.40000009536743]::double precision[]),
(44,array[-106,-0.000001810163070103954,-46,-74,104.82292757216115,-14]::double precision[]),
(45,array[-106,104.82292573815621,-14.800000005960465,-74,106.02292578583993,-13.999999994039536]::double precision[]),
(46,array[-106,104.82292573815621,-46.000000005960466,-74,106.02292578583993,-45.19999999403954]::double precision[]),
(47,array[-74.80000000596047,104.82292573815621,-45.19999980926514,-73.99999999403954,106.02292578583993,-14.800000190734863]::double precision[]),
(48,array[-106.00000000596046,104.82292573815621,-45.19999980926514,-105.19999999403953,106.02292578583993,-14.800000190734863]::double precision[]),
(49,array[-101.51999998092651,104.82292573815621,-41.519999980926514,-94.48000001907349,108.02292578583993,-34.480000019073486]::double precision[]),
(50,array[-93.20712297037244,104.82292573815621,-36.73170004412532,-89.5709785707295,107.02292578583993,-33.54763446375728]::double precision[]),
(51,array[-96.9291872382164,104.82292573815621,-24.59767859056592,-90.98280280828476,107.02292578583993,-19.80572121217847]::double precision[]),
(52,array[-85.35961028560996,104.82292573815621,-24.017832726240158,-80.40021535381675,107.02292578583993,-20.620471447706223]::double precision[]),
(53,array[-83.50392304509879,104.82292576199808,-23.51999999731779,-83.29607695490122,109.82292576199808,-23.280000002682208]::double precision[]),
(54,array[-80.70392304509878,104.82292576199808,-23.51999999731779,-80.49607695490121,109.82292576199808,-23.280000002682208]::double precision[]),
(55,array[-83.50392304509879,104.82292576199808,-20.719999997317792,-83.29607695490122,109.82292576199808,-20.48000000268221]::double precision[]),
(56,array[-80.70392304509878,104.82292576199808,-20.719999997317792,-80.49607695490121,109.82292576199808,-20.48000000268221]::double precision[]),
(57,array[-84.40000009536743,109.82292576199808,-24.40000009536743,-79.59999990463257,114.32292576199808,-19.59999990463257]::double precision[]),
(58,array[-84.59999990463257,114.32292578583994,-24.59999990463257,-79.40000009536743,116.12292573815623,-19.40000009536743]::double precision[]),
(59,array[-90.60000002384186,104.82292610658743,-30.600000023841858,-89.39999997615814,127.19081169618704,-29.399999976158142]::double precision[]),
(60,array[-90.69999998807907,126.49081205269732,-30.69999998807907,-89.30000001192093,127.89081202885546,-29.30000001192093]::double precision[]),
(61,array[-46,-0.0000018555905256789629,-46,-14,122.369878820679,-14]::double precision[]),
(62,array[-46,122.36987694124662,-14.800000005960465,-14,123.56987698893033,-13.999999994039536]::double precision[]),
(63,array[-46,122.36987694124662,-46.000000005960466,-14,123.56987698893033,-45.19999999403954]::double precision[]),
(64,array[-14.800000005960465,122.36987694124662,-45.19999980926514,-13.999999994039536,123.56987698893033,-14.800000190734863]::double precision[]),
(65,array[-46.000000005960466,122.36987694124662,-45.19999980926514,-45.19999999403954,123.56987698893033,-14.800000190734863]::double precision[]),
(66,array[-41.519999980926514,122.36987694124662,-41.519999980926514,-34.480000019073486,125.56987698893033,-34.480000019073486]::double precision[]),
(67,array[-36.388376604765654,122.36987694124662,-35.187130108475685,-32.33585108444095,124.56987698893033,-31.813465252518654]::double precision[]),
(68,array[-33.62311304733157,122.36987694124662,-37.861824467778206,-28.37203825637698,124.56987698893033,-34.36190600693226]::double precision[]),
(69,array[-30.600000023841858,122.36987686683395,-30.600000023841858,-29.399999976158142,145.35387802650192,-29.399999976158142]::double precision[]),
(70,array[-30.69999998807907,144.65387794016831,-30.69999998807907,-29.30000001192093,146.05387791632646,-29.30000001192093]::double precision[]),
(71,array[14,-3.483927173419943e-7,-46,46,66.79860652416588,-14]::double precision[]),
(72,array[18,66.79860581234544,-42,42,103.23420990780443,-18]::double precision[]),
(73,array[22,103.23420936266284,-38,38,121.45201141039233,-22]::double precision[]),
(74,array[22,121.4520112048366,-22.800000005960463,38,122.65201125252031,-21.999999994039534]::double precision[]),
(75,array[22,121.4520112048366,-38.000000005960466,38,122.65201125252031,-37.19999999403954]::double precision[]),
(76,array[37.19999999403954,121.4520112048366,-37.19999980926514,38.000000005960466,122.65201125252031,-22.800000190734863]::double precision[]),
(77,array[21.999999994039534,121.4520112048366,-37.19999980926514,22.800000005960463,122.65201125252031,-22.800000190734863]::double precision[]),
(78,array[24.240000009536743,121.4520112048366,-35.75999999046326,27.759999990463257,124.65201125252031,-32.24000000953674]::double precision[]),
(79,array[24.853417947888374,121.4520112048366,-34.83904849179089,30.552562788128853,123.65201125252031,-30.3238831628114]::double precision[]),
(80,array[25.571228304877877,121.4520112048366,-32.90990509092808,31.183811942115426,123.65201125252031,-29.14405120909214]::double precision[]),
(81,array[27.129838509485126,121.4520112048366,-28.20191348530352,32.45632318966091,123.65201125252031,-24.556068072095513]::double precision[]),
(82,array[29.399999976158142,121.4520110200622,-30.600000023841858,30.600000023841858,143.6525668214538,-29.399999976158142]::double precision[]),
(83,array[29.30000001192093,142.95256662475848,-30.69999998807907,30.69999998807907,144.35256660091662,-29.30000001192093]::double precision[]),
(84,array[74,0.0000016431810365702404,-46,106,85.06426403331776,-14]::double precision[]),
(85,array[74,85.06426565265693,-14.800000005960465,106,86.26426570034064,-13.999999994039536]::double precision[]),
(86,array[74,85.06426565265693,-46.000000005960466,106,86.26426570034064,-45.19999999403954]::double precision[]),
(87,array[105.19999999403953,85.06426565265693,-45.19999980926514,106.00000000596046,86.26426570034064,-14.800000190734863]::double precision[]),
(88,array[73.99999999403954,85.06426565265693,-45.19999980926514,74.80000000596047,86.26426570034064,-14.800000190734863]::double precision[]),
(89,array[78.48000001907349,85.06426565265693,-41.519999980926514,85.51999998092651,88.26426570034064,-34.480000019073486]::double precision[]),
(90,array[85.57915579155087,85.06426565265693,-29.62384294345975,90.38592182472348,87.26426570034064,-24.754684675484896]::double precision[]),
(91,array[89.65159042179585,85.06426565265693,-39.070526499301195,93.78941352665424,87.26426570034064,-34.35310830548406]::double precision[]),
(92,array[-106,-0.0000014972386850331532,14,-74,105.00396578791756,46]::double precision[]),
(93,array[-106,105.00396426683702,45.19999999403954,-74,106.20396431452073,46.000000005960466]::double precision[]),
(94,array[-106,105.00396426683702,13.999999994039536,-74,106.20396431452073,14.800000005960465]::double precision[]),
(95,array[-74.80000000596047,105.00396426683702,14.800000190734863,-73.99999999403954,106.20396431452073,45.19999980926514]::double precision[]),
(96,array[-106.00000000596046,105.00396426683702,14.800000190734863,-105.19999999403953,106.20396431452073,45.19999980926514]::double precision[]),
(97,array[-101.51999998092651,105.00396426683702,18.480000019073486,-94.48000001907349,108.20396431452073,25.519999980926514]::double precision[]),
(98,array[-95.04557472094893,105.00396426683702,22.42844469845295,-90.58389812335372,107.20396431452073,26.62337763607502]::double precision[]),
(99,array[-90.60000002384186,105.00396398054846,29.399999976158142,-89.39999997615814,126.04346135603674,30.600000023841858]::double precision[]),
(100,array[-90.69999998807907,125.34346105782726,29.30000001192093,-89.30000001192093,126.7434610339854,30.69999998807907]::double precision[]),
(101,array[-46,-0.000001135678175501198,14,-14,110.24129372516167,46]::double precision[]),
(102,array[-46,110.24129256564163,45.19999999403954,-14,111.44129261332534,46.000000005960466]::double precision[]),
(103,array[-46,110.24129256564163,13.999999994039536,-14,111.44129261332534,14.800000005960465]::double precision[]),
(104,array[-14.800000005960465,110.24129256564163,14.800000190734863,-13.999999994039536,111.44129261332534,45.19999980926514]::double precision[]),
(105,array[-46.000000005960466,110.24129256564163,14.800000190734863,-45.19999999403954,111.44129261332534,45.19999980926514]::double precision[]),
(106,array[-41.519999980926514,110.24129256564163,18.480000019073486,-34.480000019073486,113.44129261332534,25.519999980926514]::double precision[]),
(107,array[-39.00945687294006,110.24129256564163,26.675320900976658,-34.03927540779114,112.44129261332534,31.6352494135499]::double precision[]),
(108,array[-23.50392304509878,110.24129258948349,36.48000000268221,-23.296076954901217,115.24129258948349,36.71999999731779]::double precision[]),
(109,array[-20.703923045098783,110.24129258948349,36.48000000268221,-20.49607695490122,115.24129258948349,36.71999999731779]::double precision[]),
(110,array[-23.50392304509878,110.24129258948349,39.28000000268221,-23.296076954901217,115.24129258948349,39.51999999731779]::double precision[]),
(111,array[-20.703923045098783,110.24129258948349,39.28000000268221,-20.49607695490122,115.24129258948349,39.51999999731779]::double precision[]),
(112,array[-24.40000009536743,115.24129258948349,35.59999990463257,-19.59999990463257,119.74129258948349,40.40000009536743]::double precision[]),
(113,array[-24.59999990463257,119.74129261332536,35.40000009536743,-19.40000009536743,121.54129256564164,40.59999990463257]::double precision[]),
(114,array[-30.600000023841858,110.24129274827399,29.399999976158142,-29.399999976158142,136.97241571885505,30.600000023841858]::double precision[]),
(115,array[-30.69999998807907,136.27241588956647,29.30000001192093,-29.30000001192093,137.67241586572462,30.69999998807907]::double precision[]),
(116,array[14,-0.0000018593158159774248,14,46,123.11179165875059,46]::double precision[]),
(117,array[14,123.11178977559291,45.19999999403954,46,124.31178982327663,46.000000005960466]::double precision[]),
(118,array[14,123.11178977559291,13.999999994039536,46,124.31178982327663,14.800000005960465]::double precision[]),
(119,array[45.19999999403954,123.11178977559291,14.800000190734863,46.000000005960466,124.31178982327663,45.19999980926514]::double precision[]),
(120,array[13.999999994039536,123.11178977559291,14.800000190734863,14.800000005960465,124.31178982327663,45.19999980926514]::double precision[]),
(121,array[18.480000019073486,123.11178977559291,18.480000019073486,25.519999980926514,126.31178982327663,25.519999980926514]::double precision[]),
(122,array[25.474979482591152,123.11178977559291,24.462076406925917,30.00667294114828,125.31178982327663,28.79695914313197]::double precision[]),
(123,array[34.900408919900656,123.11178977559291,29.605409424751997,38.062595542520285,125.31178982327663,32.693497221916914]::double precision[]),
(124,array[30.693428874015808,123.11178977559291,30.77912051230669,35.98013627529144,125.31178982327663,35.76308400183916]::double precision[]),
(125,array[29.399999976158142,123.1117899903559,29.399999976158142,30.600000023841858,158.89800672619575,30.600000023841858]::double precision[]),
(126,array[29.30000001192093,158.1980069290378,29.30000001192093,30.69999998807907,159.59800690519594,30.69999998807907]::double precision[]),
(127,array[74,0.0000011179151044871105,14,106,80.69307057592292,46]::double precision[]),
(128,array[74,80.69307166999616,45.19999999403954,106,81.89307171767987,46.000000005960466]::double precision[]),
(129,array[74,80.69307166999616,13.999999994039536,106,81.89307171767987,14.800000005960465]::double precision[]),
(130,array[105.19999999403953,80.69307166999616,14.800000190734863,106.00000000596046,81.89307171767987,45.19999980926514]::double precision[]),
(131,array[73.99999999403954,80.69307166999616,14.800000190734863,74.80000000596047,81.89307171767987,45.19999980926514]::double precision[]),
(132,array[78.48000001907349,80.69307166999616,18.480000019073486,85.51999998092651,83.89307171767987,25.519999980926514]::double precision[]),
(133,array[91.36903573945165,80.69307166999616,35.26985822990537,94.83991338685155,82.89307171767987,38.58286105468869]::double precision[]),
(134,array[83.98009321838617,80.69307166999616,30.695851638913155,88.25463316589594,82.89307171767987,34.98443253338337]::double precision[]),
(135,array[93.65355156362057,80.69307166999616,24.773892797529697,99.37248705327511,82.89307171767987,28.36162845045328]::double precision[]),
(136,array[-106,6.507379310960459e-7,74,-74,68.39648502573793,106]::double precision[]),
(137,array[-106,68.396485652634,105.19999999403953,-74,69.59648570031771,106.00000000596046]::double precision[]),
(138,array[-106,68.396485652634,73.99999999403954,-74,69.59648570031771,74.80000000596047]::double precision[]),
(139,array[-74.80000000596047,68.396485652634,74.80000019073486,-73.99999999403954,69.59648570031771,105.19999980926514]::double precision[]),
(140,array[-106.00000000596046,68.396485652634,74.80000019073486,-105.19999999403953,69.59648570031771,105.19999980926514]::double precision[]),
(141,array[-101.51999998092651,68.396485652634,78.48000001907349,-94.48000001907349,71.59648570031771,85.51999998092651]::double precision[]),
(142,array[-99.75813871622086,68.396485652634,88.2211527749896,-94.44943100214005,70.59648570031771,92.71646355837584]::double precision[]),
(143,array[-86.87902345508337,68.396485652634,94.04735591635108,-83.51533856242895,70.59648570031771,98.48624541983008]::double precision[]),
(144,array[-86.43992939963937,68.396485652634,90.93296804651618,-80.81025782600045,70.59648570031771,93.97995844110847]::double precision[]),
(145,array[-46,-0.0000017710475219701038,74,-14,115.12496008197982,106]::double precision[]),
(146,array[-46,115.12495828709044,105.19999999403953,-14,116.32495833477415,106.00000000596046]::double precision[]),
(147,array[-46,115.12495828709044,73.99999999403954,-14,116.32495833477415,74.80000000596047]::double precision[]),
(148,array[-14.800000005960465,115.12495828709044,74.80000019073486,-13.999999994039536,116.32495833477415,105.19999980926514]::double precision[]),
(149,array[-46.000000005960466,115.12495828709044,74.80000019073486,-45.19999999403954,116.32495833477415,105.19999980926514]::double precision[]),
(150,array[-41.519999980926514,115.12495828709044,78.48000001907349,-34.480000019073486,118.32495833477415,85.51999998092651]::double precision[]),
(151,array[-24.396221298724413,115.12495828709044,85.78521685302258,-21.077700037509203,117.32495833477415,90.67456011474133]::double precision[]),
(152,array[-33.857260413467884,115.12495828709044,85.18835547566414,-29.33713311702013,117.32495833477415,89.26720049977303]::double precision[]),
(153,array[-30.600000023841858,115.1249585130293,89.39999997615814,-29.399999976158142,135.80371904159375,90.60000002384186]::double precision[]),
(154,array[-30.69999998807907,135.10371925561168,89.30000001192093,-29.30000001192093,136.50371923176982,90.69999998807907]::double precision[]),
(155,array[14,-4.541574014638172e-7,74,46,76.45938827875275,106]::double precision[]),
(156,array[14,76.45938780075349,105.19999999403953,46,77.6593878484372,106.00000000596046]::double precision[]),
(157,array[14,76.45938780075349,73.99999999403954,46,77.6593878484372,74.80000000596047]::double precision[]),
(158,array[45.19999999403954,76.45938780075349,74.80000019073486,46.000000005960466,77.6593878484372,105.19999980926514]::double precision[]),
(159,array[13.999999994039536,76.45938780075349,74.80000019073486,14.800000005960465,77.6593878484372,105.19999980926514]::double precision[]),
(160,array[18.480000019073486,76.45938780075349,78.48000001907349,25.519999980926514,79.6593878484372,85.51999998092651]::double precision[]),
(161,array[28.765114188194275,76.45938780075349,86.53008333966136,33.58327281475067,78.6593878484372,90.1757458858192]::double precision[]),
(162,array[34.80932280048728,76.45938780075349,91.19839721545577,38.458180632442236,78.6593878484372,95.34137349948287]::double precision[]),
(163,array[33.09274034574628,76.45938780075349,81.19613104686141,38.085732746869326,78.6593878484372,85.85200959071517]::double precision[]),
(164,array[36.49607695490122,76.45938782459535,96.4800000026822,36.70392304509878,81.45938782459535,96.71999999731779]::double precision[]),
(165,array[39.29607695490122,76.45938782459535,96.4800000026822,39.50392304509878,81.45938782459535,96.71999999731779]::double precision[]),
(166,array[36.49607695490122,76.45938782459535,99.28000000268221,36.70392304509878,81.45938782459535,99.5199999973178]::double precision[]),
(167,array[39.29607695490122,76.45938782459535,99.28000000268221,39.50392304509878,81.45938782459535,99.5199999973178]::double precision[]),
(168,array[35.59999990463257,81.45938782459535,95.59999990463257,40.40000009536743,85.95938782459535,100.40000009536743]::double precision[]),
(169,array[35.40000009536743,85.95938784843722,95.40000009536743,40.59999990463257,87.7593878007535,100.59999990463257]::double precision[]),
(170,array[74,9.655249613160777e-7,74,106,95.37369633906012,106]::double precision[]),
(171,array[74,95.37369728074322,105.19999999403953,106,96.57369732842693,106.00000000596046]::double precision[]),
(172,array[74,95.37369728074322,73.99999999403954,106,96.57369732842693,74.80000000596047]::double precision[]),
(173,array[105.19999999403953,95.37369728074322,74.80000019073486,106.00000000596046,96.57369732842693,105.19999980926514]::double precision[]),
(174,array[73.99999999403954,95.37369728074322,74.80000019073486,74.80000000596047,96.57369732842693,105.19999980926514]::double precision[]),
(175,array[78.48000001907349,95.37369728074322,78.48000001907349,85.51999998092651,98.57369732842693,85.51999998092651]::double precision[]),
(176,array[86.29579300805926,95.37369728074322,88.02207780629396,91.00542206689715,97.57369732842693,91.35645843297243]::double precision[]),
(177,array[81.63399520888925,95.37369728074322,80.49517082422972,87.07644430175424,97.57369732842693,84.18374251574278]::double precision[]),
(178,array[90.3585662767291,95.37369728074322,80.04972032830119,94.83335160464048,97.57369732842693,84.03830007836223]::double precision[]),
(179,array[96.49607695490121,95.37369730458508,96.4800000026822,96.70392304509878,100.37369730458508,96.71999999731779]::double precision[]),
(180,array[99.29607695490122,95.37369730458508,96.4800000026822,99.50392304509879,100.37369730458508,96.71999999731779]::double precision[]),
(181,array[96.49607695490121,95.37369730458508,99.28000000268221,96.70392304509878,100.37369730458508,99.5199999973178]::double precision[]),
(182,array[99.29607695490122,95.37369730458508,99.28000000268221,99.50392304509879,100.37369730458508,99.5199999973178]::double precision[]),
(183,array[95.59999990463257,100.37369730458508,95.59999990463257,100.40000009536743,104.87369730458508,100.40000009536743]::double precision[]),
(184,array[95.40000009536743,104.87369732842694,95.40000009536743,100.59999990463257,106.67369728074323,100.59999990463257]::double precision[]);

create or replace function public.game_command(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text := upper(trim(coalesce(p_data->>'code','')));
  v_room public.game_rooms%rowtype;
  v_player public.game_players%rowtype;
  v_target public.game_players%rowtype;
  v_count integer;
  v_now bigint := game.now_ms();
  v_x double precision; v_y double precision; v_z double precision; v_facing double precision;
  v_kind text; v_reach double precision; v_vertical double precision; v_cone double precision;
  v_cooldown integer; v_damage integer;
  v_move_budget double precision; v_move_distance double precision;
  v_result jsonb;
  v_arena jsonb;v_points jsonb;v_point jsonb;v_hit game.hit_checks%rowtype;v_ally uuid;v_id uuid;
begin
  if v_user is null then raise exception '로그인이 필요합니다.'; end if;
  perform game.cleanup();

  if p_action='create' then
    v_count := coalesce((p_data->>'capacity')::integer,0);
    if v_count not between 2 and 8 then raise exception '정원은 2~8명입니다.'; end if;
    if exists(select 1 from public.game_players where user_id=v_user) then
      raise exception '먼저 현재 방에서 나가세요.';
    end if;
    loop
      v_code := upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 6));
      exit when not exists(select 1 from public.game_rooms where code=v_code);
    end loop;
    insert into public.game_rooms(code,name,mode,city,capacity,host)
      values(v_code, left(coalesce(nullif(trim(p_data->>'name'),''),'새 방'),24),
        case when p_data->>'mode'='tag' then 'tag' else 'free' end,
        case when p_data->>'city'='hong-kong' then 'hong-kong' else 'procedural' end,
        v_count,v_user);
    insert into public.game_players(user_id,room_code,name)
      values(v_user,v_code,left(coalesce(nullif(trim(p_data->>'playerName'),''),'플레이어'),16));
    update public.game_rooms set enhanced=coalesce((p_data->>'enhanced')::boolean,false) where code=v_code;
    return game.state(v_code);
  end if;

  if p_action='join' then
    select * into v_room from public.game_rooms where code=v_code for update;
    if not found or v_room.phase<>'waiting' then raise exception '참가 가능한 방이 없습니다.'; end if;
    if v_room.city<>p_data->>'city' then
      return jsonb_build_object('type','switch-city','city',v_room.city,'code',v_code);
    end if;
    select count(*) into v_count from public.game_players where room_code=v_code;
    if v_count>=v_room.capacity then raise exception '방이 가득 찼습니다.'; end if;
    if exists(select 1 from public.game_players where user_id=v_user) then
      raise exception '먼저 현재 방에서 나가세요.';
    end if;
    insert into public.game_players(user_id,room_code,name)
      values(v_user,v_code,left(coalesce(nullif(trim(p_data->>'playerName'),''),'플레이어'),16));
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  select * into v_player from public.game_players where user_id=v_user;
  if not found then raise exception '방에 참가하지 않았습니다.'; end if;
  v_code := v_player.room_code;
  select * into v_room from public.game_rooms where code=v_code for update;
  select * into v_player from public.game_players where user_id=v_user and room_code=v_code for update;
  if not found then raise exception '방에 참가하지 않았습니다.';end if;
  v_now := game.now_ms();
  update public.game_players set last_seen=clock_timestamp() where user_id=v_user;

  if p_action='leave' then
    delete from public.game_players where user_id=v_user;
    select count(*) into v_count from public.game_players where room_code=v_code;
    if v_count=0 then delete from public.game_rooms where code=v_code;
    else
      if v_room.host=v_user then
        update public.game_rooms set host=(select user_id from public.game_players where room_code=v_code order by user_id limit 1) where code=v_code;
      end if;
      if v_room.phase='playing' and v_room.mode='tag' then
        if not exists(select 1 from public.game_players where room_code=v_code and team='runner' and not eliminated) then
          update public.game_rooms set phase='finished',winner='police',ends_at=0 where code=v_code;
        elsif not exists(select 1 from public.game_players where room_code=v_code and team='police' and not eliminated) then
          update public.game_rooms set phase='finished',winner='runner',ends_at=0 where code=v_code;
        end if;
      end if;
      perform game.publish(v_code);
    end if;
    return jsonb_build_object('type','left');
  end if;

  if p_action='heartbeat' then
    if v_room.enhanced and v_room.phase='playing' and v_now-v_room.last_pulse>20000 then
      update public.game_rooms set last_pulse=v_now,pulse_until=v_now+3500 where code=v_code;perform game.publish(v_code);
    end if;return game.state(v_code); end if;

  if p_action='ready' and v_room.phase='waiting' then
    if v_room.enhanced and coalesce((p_data->>'ready')::boolean,false) then
      if not coalesce((p_data->>'terrainReady')::boolean,false) then raise exception '지형 로딩이 완료된 뒤 준비하세요.';end if;
      if v_room.host=v_user then
        v_x:=(p_data->'spawn'->>'x')::double precision;v_y:=(p_data->'spawn'->>'y')::double precision;v_z:=(p_data->'spawn'->>'z')::double precision;
        if v_x is null or v_y is null or v_z is null or not(v_x between -2400 and 2400 and v_z between -2400 and 2400 and v_y between 0 and 900) then raise exception '안전한 시작점이 필요합니다.';end if;
        if v_room.city='procedural' and (abs(v_x)>=160 or abs(v_z)>=160) then raise exception '로컬 도시 시작점은 구역 안에 있어야 합니다.';end if;
        v_points:=p_data->'roofs';
        if v_room.city='procedural' and jsonb_typeof(v_points)='array' then
          select coalesce(jsonb_agg(point),'[]'::jsonb) into v_points from
            (select value point from jsonb_array_elements(v_points) limit 128) candidates
            where case when jsonb_typeof(point->'x')='number' and jsonb_typeof(point->'y')='number' and jsonb_typeof(point->'z')='number'
              then abs((point->>'x')::double precision)<160 and abs((point->>'z')::double precision)<160 else false end;
        end if;
        v_points:=game.arena_points(v_x,v_y,v_z,case when v_room.city='procedural' then 300 else 450 end,v_points);
        if jsonb_array_length(v_points)<2 then raise exception '추격전에 필요한 주변 옥상 지형이 아직 준비되지 않았습니다.';end if;
        update public.game_rooms set arena=jsonb_build_object('x',v_x,'y',v_y,'z',v_z,'radius',case when city='procedural' then 300 else 450 end,'points',v_points) where code=v_code;
      end if;
    end if;
    update public.game_players set ready=coalesce((p_data->>'ready')::boolean,false) where user_id=v_user;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if p_action='start' then
    if v_room.host<>v_user or v_room.phase<>'waiting' then raise exception '방장만 시작할 수 있습니다.'; end if;
    if (select count(*) from public.game_players where room_code=v_code)<2 then raise exception '최소 2명이 모여야 시작할 수 있습니다.'; end if;
    if exists(select 1 from public.game_players where room_code=v_code and not ready) then raise exception '모든 플레이어가 준비해야 합니다.'; end if;
    if v_room.enhanced and v_room.arena is null then raise exception '방장의 안전 지형 준비가 필요합니다.';end if;
    update public.game_rooms set phase='playing',winner=null,
      ends_at=case when mode='tag' then v_now+case when not enhanced then 300000 when (select count(*) from public.game_players where room_code=v_code)<=2 then 180000 when (select count(*) from public.game_players where room_code=v_code)<=6 then 240000 else 300000 end else 0 end,
      vulnerable_at=case when mode='tag' then v_now+8000 else 0 end where code=v_code;
    with shuffled as (select user_id,row_number() over(order by case when v_room.enhanced then police_rounds else 0 end,random()) as rank,
      count(*) over() as total from public.game_players where room_code=v_code)
    update public.game_players p set
      team=case when v_room.mode='free' then 'free'
        when s.rank<=case when s.total>=7 then 2 else 1 end then 'police' else 'runner' end,
      police_rounds=police_rounds+case when v_room.mode='tag' and s.rank<=case when s.total>=7 then 2 else 1 end then 1 else 0 end,progress=0,goal_at=0,rescue_target=null,rescue_since=0,
      life_epoch=life_epoch+1,health=100,eliminated=false,seen=false,x=0,y=0,z=0,facing=0,last_move_ms=0,move_budget=20,punch_ms=0,web_ms=0
    from shuffled s where p.user_id=s.user_id;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if p_action='rematch' then
    if v_room.host<>v_user or v_room.phase<>'finished' then raise exception '방장만 다시 시작할 수 있습니다.'; end if;
    update public.game_rooms set phase='waiting',round=round+1,winner=null,ends_at=0,vulnerable_at=0 where code=v_code;
    update public.game_players set life_epoch=life_epoch+1,ready=false,eliminated=false,health=100,team=null where room_code=v_code;
    perform game.publish(v_code);
    return game.state(v_code);
  end if;

  if v_room.phase<>'playing' then return null;end if;
  if p_action='hit-confirm' then return null;end if;
  if v_player.eliminated then return null; end if;

  if p_action='move' then
    v_x := (p_data->>'x')::double precision; v_y := (p_data->>'y')::double precision;
    v_z := (p_data->>'z')::double precision; v_facing := (p_data->>'facing')::double precision;
    if v_x is null or v_y is null or v_z is null or v_facing is null
      or not (v_x between -2500 and 2500) or not (v_z between -2500 and 2500)
      or not (v_y between -100 and 1000) or not (v_facing between -100000 and 100000)
      then return null; end if;
    if abs(v_x)>=(case when v_room.city='procedural' then 160 else 2400 end)
      or abs(v_z)>=(case when v_room.city='procedural' then 160 else 2400 end) then
      return jsonb_build_object('type','correction','x',v_player.x,'y',v_player.y,'z',v_player.z);end if;
    if v_room.enhanced and v_room.arena is not null and
      sqrt(power(v_x-(v_room.arena->>'x')::double precision,2)+power(v_z-(v_room.arena->>'z')::double precision,2))>(v_room.arena->>'radius')::double precision+3 then
      return jsonb_build_object('type','correction','x',v_player.x,'y',v_player.y,'z',v_player.z);end if;
    if v_now-v_player.last_move_ms<40 then return null; end if;
    v_move_distance := sqrt(power(v_x-v_player.x,2)+power(v_y-v_player.y,2)+power(v_z-v_player.z,2));
    v_move_budget := case when v_player.last_move_ms>0 then v_player.move_budget
      + greatest(0,v_now-v_player.last_move_ms)*0.072 else 20 end;
    if v_player.last_move_ms>0 and v_move_distance>v_move_budget then
      return jsonb_build_object('type','correction','x',v_player.x,'y',v_player.y,'z',v_player.z);end if;
    if v_room.enhanced and v_room.arena is not null then
      if sqrt(power(v_x-(v_room.arena->>'x')::double precision,2)+power(v_z-(v_room.arena->>'z')::double precision,2))>(v_room.arena->>'radius')::double precision+3
        or (v_room.city='procedural' and v_player.seen and game.blocked(v_player.x,v_player.y,v_player.z,v_x,v_y,v_z)) then
        return jsonb_build_object('type','correction','x',v_player.x,'y',v_player.y,'z',v_player.z);end if;
    end if;
    update public.game_players set x=v_x,y=v_y,z=v_z,facing=v_facing,seen=true,last_move_ms=v_now,
      move_budget=case when v_player.last_move_ms>0 then least(20,greatest(0,v_move_budget-v_move_distance)) else 20 end where user_id=v_user;
    if v_room.enhanced and v_room.mode='tag' and v_player.team='runner' then
      v_point:=v_room.arena->'points'->(v_player.progress % jsonb_array_length(v_room.arena->'points'));
      if v_now-v_player.goal_at>=1200 and sqrt(power(v_x-(v_point->>'x')::double precision,2)+power(v_y-(v_point->>'y')::double precision,2)+power(v_z-(v_point->>'z')::double precision,2))<7 then
        update public.game_players set progress=progress+1,goal_at=v_now where user_id=v_user;
        if v_player.progress+1>=3 then update public.game_rooms set phase='finished',winner='runner',ends_at=0 where code=v_code;end if;perform game.publish(v_code);
      end if;
      select user_id into v_ally from public.game_players where room_code=v_code and team='runner' and eliminated
        and sqrt(power(x-v_x,2)+power(y-v_y,2)+power(z-v_z,2))<3.5
        and (v_room.city<>'procedural' or not game.blocked(v_x,v_y,v_z,x,y,z)) order by user_id limit 1;
      if v_ally is not null then
        if v_player.rescue_target is distinct from v_ally or v_now-v_player.last_move_ms>500 then update public.game_players set rescue_target=v_ally,rescue_since=v_now where user_id=v_user;
        elsif v_now-v_player.rescue_since>=3000 then update public.game_players set life_epoch=life_epoch+1,health=50,eliminated=false where user_id=v_ally;update public.game_players set rescue_target=null,rescue_since=0 where user_id=v_user;perform game.publish(v_code);end if;
      else update public.game_players set rescue_target=null,rescue_since=0 where user_id=v_user;end if;
    end if;
    v_result := jsonb_build_object('type','move','id',v_user,'x',v_x,'y',v_y,'z',v_z,'facing',v_facing);
    perform realtime.send(v_result,'move','game:' || v_code,true);
    return v_result;
  end if;

  if p_action='attack' then
    if v_room.mode<>'tag' or v_player.team<>'police' or not v_player.seen or v_now<v_room.vulnerable_at then return null; end if;
    v_kind := case when p_data->>'kind'='web' then 'web' else 'punch' end;
    if v_kind='web' then v_reach:=22;v_vertical:=8;v_cone:=0.84;v_cooldown:=1600;v_damage:=15;
    else v_reach:=2.6;v_vertical:=2.2;v_cone:=0.65;v_cooldown:=560;v_damage:=25; end if;
    if v_now - (case when v_kind='web' then v_player.web_ms else v_player.punch_ms end) < v_cooldown then return null; end if;
    v_facing := coalesce((p_data->>'facing')::double precision,v_player.facing);
    if not (v_facing between -100000 and 100000) then return null; end if;
    update public.game_players set facing=v_facing,
      punch_ms=case when v_kind='punch' then v_now else punch_ms end,
      web_ms=case when v_kind='web' then v_now else web_ms end where user_id=v_user;
    select p.* into v_target from public.game_players p where p.room_code=v_code and p.team='runner'
      and not p.eliminated and p.seen and abs(p.y-v_player.y)<v_vertical
      and sqrt(power(p.x-v_player.x,2)+power(p.z-v_player.z,2))<=v_reach
      and (sqrt(power(p.x-v_player.x,2)+power(p.z-v_player.z,2))<=0.35
        or cos(atan2(p.x-v_player.x,p.z-v_player.z)-v_facing)>=v_cone)
    order by sqrt(power(p.x-v_player.x,2)+power(p.z-v_player.z,2)) limit 1 for update;
    if not found then return null; end if;
    if v_room.city='hong-kong' then
      if v_now-v_player.last_move_ms>1500 then return null;end if;
      delete from game.hit_checks where room_code=v_code and expires<v_now;
      insert into game.hit_checks(room_code,attacker,target,kind,expires,from_pos,to_pos,match_round,target_life)
        values(v_code,v_user,v_target.user_id,v_kind,v_now+10000,
          jsonb_build_object('x',v_player.x,'y',v_player.y,'z',v_player.z),
          jsonb_build_object('x',v_target.x,'y',v_target.y,'z',v_target.z),v_room.round,v_target.life_epoch) returning id into v_id;
      return jsonb_build_object('type','terrain-check','hitId',v_id,
        'from',jsonb_build_object('x',v_player.x,'y',v_player.y,'z',v_player.z),
        'to',jsonb_build_object('x',v_target.x,'y',v_target.y,'z',v_target.z));
    end if;
    if v_room.enhanced and (v_now-v_player.last_move_ms>1500 or game.blocked(v_player.x,v_player.y,v_player.z,v_target.x,v_target.y,v_target.z)) then return null;end if;
    update public.game_players set health=greatest(0,health-v_damage),eliminated=health<=v_damage
      where user_id=v_target.user_id returning * into v_target;
    v_result:=jsonb_build_object('type','hit','attacker',v_user,'target',v_target.user_id,
      'kind',v_kind,'health',v_target.health,'eliminated',v_target.eliminated);
    perform realtime.send(v_result,'hit','game:' || v_code,true);
    if not exists(select 1 from public.game_players where room_code=v_code and team='runner' and not eliminated) then
      update public.game_rooms set phase='finished',winner='police',ends_at=0 where code=v_code;
      perform game.publish(v_code);
    end if;
    return v_result;
  end if;

  raise exception '알 수 없는 요청입니다.';
end;
$$;


revoke all on function public.game_command(text,jsonb) from public,anon;
grant execute on function public.game_command(text,jsonb) to authenticated;

