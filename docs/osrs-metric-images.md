# OSRS metric images

The site serves **118 original metric PNGs** locally from `public/osrs-icons/metrics/`, totaling **61,669 bytes**. No image request depends on the Wise Old Man API or its request quota.

## Source and attribution

- Upstream repository: [Wise Old Man](https://github.com/wise-old-man/wise-old-man).
- Pinned commit: [f930946d4152e7c449df1dd367405f1351f2eeaf](https://github.com/wise-old-man/wise-old-man/commit/f930946d4152e7c449df1dd367405f1351f2eeaf).
- Source directory: [app/public/img/metrics](https://github.com/wise-old-man/wise-old-man/tree/f930946d4152e7c449df1dd367405f1351f2eeaf/app/public/img/metrics).
- Display names: [upstream metric definitions](https://github.com/wise-old-man/wise-old-man/blob/f930946d4152e7c449df1dd367405f1351f2eeaf/server/src/utils/shared/metric.utils.ts).
- Repository license: [MIT](https://github.com/wise-old-man/wise-old-man/blob/f930946d4152e7c449df1dd367405f1351f2eeaf/LICENSE), notice retained below.

Old School RuneScape game artwork belongs to **Jagex**. The repository's MIT software license does not transfer ownership of Jagex's game artwork. These locally served originals are attributed fan-site game icons, with no claim of ownership or endorsement.

The catalog contains 24 skills plus Overall, 72 boss/raid metrics, 15 activity metrics, EHP and EHB, and four additional upstream images (Combat, League Points, TTM and TT200M). Historical images remain available for existing records. Original wheel assets in `public/osrs-icons/skills/` and `public/osrs-icons/bosses/` remain unchanged.

## Usage

Use `metricImage(metric)` and `metricLabel(metric)` from `lib/osrs-metrics.ts`. Images are resolved through a fixed catalog of local paths. Unknown names return `null` from `metricImage`; they cannot construct arbitrary URLs or paths.

The helper accepts case differences, spaces/hyphens and OSRS apostrophes. Explicit aliases:

- `runecraft` → `runecrafting`
- `kree_arra` → `kreearra`
- `calvar_ion` → `calvarion`
- `vet_ion` → `vetion`
- `barrows` → `barrows_chests`
- `perilous_moons` → `lunar_chests`
- `chambers_of_xeric_cm` → `chambers_of_xeric_challenge_mode`
- `theatre_of_blood_hm` → `theatre_of_blood_hard_mode`
- `tombs_of_amascut_expert_mode` → `tombs_of_amascut_expert`
- `gauntlet` → `the_gauntlet`
- `corrupted_gauntlet` → `the_corrupted_gauntlet`
- `hueycoatl` → `the_hueycoatl`
- `leviathan` → `the_leviathan`
- `royal_titans` → `the_royal_titans`
- `whisperer` → `the_whisperer`
- `the_nightmare` → `nightmare`

These are small pixel icons (16–29 pixels wide and 13–27 pixels high). Preserve their aspect ratio and use crisp pixel rendering when enlarging them.

## Verification

Every downloaded file matched its upstream byte size and Git blob SHA-1 (`SHA1("blob " + byteLength + NUL + contents)`). Each file also passed PNG signature, IHDR and positive bounded-dimension checks. The complete pinned manifest is below.

| File | Dimensions | Bytes | Git blob SHA-1 |
| --- | --- | ---: | --- |
| abyssal_sire.png | 25×25 | 420 | `05bf629c4675ba69346cee803eec5e5068cba596` |
| agility.png | 18×23 | 162 | `bf8ff6092f6dcbdb9ebdd011b7daf0defdab57ad` |
| alchemical_hydra.png | 26×25 | 569 | `1cc27fc77018545e99447c7eb6088969f6eac114` |
| amoxliatl.png | 26×26 | 607 | `0c4cff89dfb01a31ed6900dae58dcb91ceb1c618` |
| araxxor.png | 27×27 | 751 | `fb03703b3cac32ebe950d456b5b75dee2daf7bcc` |
| artio.png | 26×23 | 477 | `12430ff729e3eb6452f98d41dd1a1d7168480868` |
| attack.png | 25×25 | 200 | `bb2a69303b5f46874af1cea5ac356f0454b22d6d` |
| barrows_chests.png | 26×26 | 301 | `84794143b0ec585a1d275f7d2c346802420c8bba` |
| bounty_hunter_hunter.png | 29×27 | 400 | `d768f7c9a5b126a0be821262a83fa7954992f18d` |
| bounty_hunter_rogue.png | 29×27 | 438 | `65b4361f0299729f610b69e06f821131540a4c92` |
| brutus.png | 25×25 | 596 | `46d3860b40d0ba02bae4d47f0532c627f85a4098` |
| bryophyta.png | 26×26 | 956 | `48f1314557fbb25a335e9639639a25404aa8192d` |
| callisto.png | 26×23 | 477 | `12430ff729e3eb6452f98d41dd1a1d7168480868` |
| calvarion.png | 27×27 | 514 | `a6f244efe30085743736cc375ecfd9cbfe30eb43` |
| cerberus.png | 26×26 | 415 | `ea6bad6430baaabb49fca9b83af10fd18095ee0d` |
| chambers_of_xeric_challenge_mode.png | 26×26 | 613 | `0e06dbf10c3dac5b686582dcc85c8db62408e277` |
| chambers_of_xeric.png | 26×26 | 608 | `07e00e6ac77834a89651b2a2126db470623ea80f` |
| chaos_elemental.png | 22×25 | 538 | `2f16096141a030e57ff19864787c9147c564de66` |
| chaos_fanatic.png | 25×24 | 408 | `ccc4db0d3efaf1bc53b29d8981da3dd7ae5ae828` |
| clue_scrolls_all.png | 29×27 | 427 | `ad6c22992fa1290a8e7e6cafc259e4e2d50762f1` |
| clue_scrolls_beginner.png | 29×27 | 439 | `97b40cdf639c3ac507cf207854b840d7caf9c150` |
| clue_scrolls_easy.png | 29×27 | 438 | `de44124956a01abb80fcc5448531977795a0e580` |
| clue_scrolls_elite.png | 29×27 | 436 | `7fe8f6b36f915e62cc88c1b76818d3c76f3b10aa` |
| clue_scrolls_hard.png | 29×27 | 453 | `e0f85567062f6258a5a350e3e650178fb371b00b` |
| clue_scrolls_master.png | 29×27 | 443 | `a3596a3a683cb10faf6ce94222824f1d3ed4c7e1` |
| clue_scrolls_medium.png | 29×27 | 446 | `1ee9430a13222fe4452f8b421f2328041d23ce16` |
| collections_logged.png | 24×23 | 1150 | `e33a0892fa9e2ced1ad366b19a0ed822ba574aca` |
| colosseum_glory.png | 26×23 | 1039 | `9b931e19eec148dfe3f5a70b1a8514c31ca7de12` |
| combat.png | 22×22 | 380 | `d0d03f5159b79a149f64b44b8a41ad7329c09afe` |
| commander_zilyana.png | 26×25 | 845 | `d3239a15e5167fa4b288e44d467d9861367255a4` |
| construction.png | 25×25 | 330 | `66ab1a02c8cfaa902ef853fb89c7008e11202f88` |
| cooking.png | 19×21 | 210 | `8ee6665739af15e56ad48895bdc74657e57c4965` |
| corporeal_beast.png | 26×25 | 353 | `55342078fcadf0f125aa9dc92024dae07c3cbe93` |
| crafting.png | 24×22 | 206 | `8bc0e20f115303b1731746d688b977f4c4ba1da2` |
| crazy_archaeologist.png | 26×25 | 287 | `efc703a763a4e4b6afa34f911cc9495a309ba5d2` |
| dagannoth_prime.png | 26×25 | 403 | `f3b88f65e19a4d6ef70f170726c1cbd47f3d9729` |
| dagannoth_rex.png | 26×24 | 423 | `82d6773cdfac8bff09a41329a5280601d5cd59e3` |
| dagannoth_supreme.png | 26×25 | 392 | `432f6e450a0ffe3f634ec5be412a41e58d2eac3f` |
| defence.png | 17×19 | 165 | `d6152bc24989ead443711f2954f27864ca8296c8` |
| deranged_archaeologist.png | 25×25 | 470 | `9d4a499090dc7a5115750daec420ce0b09deadee` |
| doom_of_mokhaiotl.png | 24×23 | 738 | `f059a6cbf9218d93b90b6d5435a93b0f326b1bf1` |
| duke_sucellus.png | 24×24 | 290 | `6a28d6efd21588c54b7ca542a21cd1c6b2196f48` |
| ehb.png | 25×25 | 612 | `79494e68ed3322c4866fbaf725c674cbba674db1` |
| ehp.png | 25×25 | 551 | `8f744673ae3a86b7dfdbd5460130e6432ecb1a92` |
| farming.png | 25×23 | 290 | `acb17ba452176371d391da80be613ae8b84fd4f8` |
| firemaking.png | 23×23 | 235 | `71059eb134e55670b70311698ad1d3710c567573` |
| fishing.png | 24×23 | 239 | `e586b06ab8e11faf67a2ed4cd18c15bed53c919e` |
| fletching.png | 25×25 | 208 | `7e19d1ac430da7716f65be8b9aab8061c536fe7f` |
| general_graardor.png | 26×25 | 743 | `1dfc925765503862851ea8bc0ab7d9c25ec3d78b` |
| giant_mole.png | 27×26 | 534 | `8ff1194a7b8e04324c2f9f278796d8cd96040ec3` |
| grotesque_guardians.png | 27×26 | 444 | `97225300f2785a1fbfccadbd824a96c7d646cd80` |
| guardians_of_the_rift.png | 25×25 | 1387 | `2da077a563f131de658b04dcc2b3a0f104b3f095` |
| herblore.png | 25×17 | 208 | `c5a90d16f54a1f8e84c73fb245f2d2cc74cac110` |
| hespori.png | 27×26 | 588 | `2037f848d9d08c59af7e9a9604f6dc5ae10bfe59` |
| hitpoints.png | 23×20 | 197 | `5d8b752255adb7fbb98cc18c5a75d2a0153ea654` |
| hunter.png | 22×23 | 223 | `9ead07850ccc7774ea87eae51dcb5280a60c62f2` |
| kalphite_queen.png | 27×26 | 538 | `2f9e78516bc61e4e4d814b67713cc9c3bf5b7981` |
| king_black_dragon.png | 27×26 | 398 | `3081fbdefe898b6c801c7c7dc2bbdbff72ef10f9` |
| kraken.png | 27×26 | 433 | `26e45d437f51ac4058080a475759145e0d66b2ae` |
| kreearra.png | 27×26 | 515 | `e8af74a9464cbb576713482dfe31030c32032365` |
| kril_tsutsaroth.png | 27×22 | 639 | `463765af5c6244a8f2893365dc98082f1c00967c` |
| last_man_standing.png | 29×27 | 621 | `2a58ca67aa55a94fecd8b8e80133c4c4dea23cc7` |
| league_points.png | 29×27 | 632 | `8569b0073150a7a733a136db27c83a0dae23950e` |
| lunar_chests.png | 26×22 | 728 | `7f86dd462af6068e5a797c02cae88e8263adc806` |
| mad_angel.png | 25×25 | 321 | `669d48b9a01797c9ecfc04a5264d1e4b135653e7` |
| maggot_king.png | 25×24 | 715 | `a226bf8d83f91c0ddab78ddc3fc769e944836bb1` |
| magic.png | 25×23 | 225 | `1f4333cc938b657e3f99ad4792cb25d986e09111` |
| mimic.png | 27×25 | 479 | `375e7f76f53e0812fe6e6be44c7eb99f8577e99c` |
| mining.png | 23×23 | 213 | `c4d729452d0d76d5552747abc4edb0e5310e4916` |
| nex.png | 24×25 | 528 | `dfe132419a94f752646d3d8b2cac4fb35b1e2972` |
| nightmare.png | 27×27 | 815 | `bacb72f34475f4734328fa4e57037f0e200873c4` |
| obor.png | 27×27 | 782 | `aa9896319bc5cdede6e4bc172177f31e54fe6f9a` |
| overall.png | 23×22 | 259 | `12a4f1406af8baf10c1cdcea8b872c11728aaf1a` |
| phantom_muspah.png | 25×25 | 1181 | `215f1104b19fd16d19d43463596f8fc0fc7b76e5` |
| phosanis_nightmare.png | 27×27 | 931 | `a585ab5315a36233d3baaf91af197d6de264580a` |
| prayer.png | 23×23 | 193 | `7543dec5e2f5da7f945bb10611a1972780eb24d9` |
| pvp_arena.png | 25×25 | 1179 | `f80c39b6d4a3e754e635cd03caf373c6f1669e84` |
| ranged.png | 23×23 | 244 | `60772e26a67e74de8ead730c220de577ee02f050` |
| runecrafting.png | 25×25 | 253 | `dfb5529cfabaaf0595ae3bdb914439d9fec20379` |
| sailing.png | 23×23 | 250 | `9fca746348fe124459fb5530aeeb60402e064fc2` |
| sarachnis.png | 27×27 | 547 | `9aee7e7e240d6ecbaca7b09c10bb08b28c62038c` |
| scorpia.png | 27×27 | 385 | `bd2a26a26e682bdbb670e7cbea9916297e072af6` |
| scurrius.png | 26×25 | 803 | `c4650bcf0e654072e23e23544c7826351c131894` |
| shellbane_gryphon.png | 25×25 | 928 | `d693a7b2962d9c11df2d0be4b8e9b9dedde48181` |
| skotizo.png | 24×24 | 577 | `4969a41c6c41746ff56c9955ce1d233b3425e3b0` |
| slayer.png | 23×24 | 286 | `0730b5982cb6bb774c4ca0a6c902624b274a62c3` |
| smithing.png | 19×19 | 201 | `c7ede632498b22862ac99464f60ff449c046652c` |
| sol_heredit.png | 26×22 | 1009 | `bc255075557164597c7b95070d4f8b6705dce865` |
| soul_wars_zeal.png | 29×27 | 349 | `6159273ccecaf72bb96e92a159e61beacfb1bad0` |
| spindel.png | 27×27 | 474 | `23fb77b5d2ad3359b8540440543346371270ac39` |
| strength.png | 16×20 | 180 | `8960066775dc16cfdf78486106050a364ffa78b1` |
| tempoross.png | 25×25 | 688 | `b3eebfe20c89b772992943afa9f34acfa6347690` |
| the_corrupted_gauntlet.png | 27×26 | 568 | `ddd6b92b5852e9a27fedfd838d4ab47e3a0b3224` |
| the_fractured_archive.png | 24×24 | 322 | `c097479b780d6db860421f3e5165f24fdbf38acb` |
| the_gauntlet.png | 27×26 | 797 | `c88e104793d6698c53d3ee4fca8b79fe5588b224` |
| the_hueycoatl.png | 26×26 | 756 | `151e69095c05fc01fd77091e20ecaef49ef65846` |
| the_leviathan.png | 24×24 | 334 | `5e6ac20a698f7590040b8df4a8b50bf8f8f04f53` |
| the_royal_titans.png | 24×23 | 1035 | `11e820dcbe70dfe425af006499fd07a7efe33803` |
| the_whisperer.png | 23×23 | 310 | `17e22e119cfca69818cb37b9cd844cffb2cfad4b` |
| theatre_of_blood_hard_mode.png | 27×27 | 863 | `7c00e43096b8312057eef2e90e177521bb60fd38` |
| theatre_of_blood.png | 27×27 | 709 | `ab157b5e15af5298d73aa22171e3e91014a417ce` |
| thermonuclear_smoke_devil.png | 27×27 | 723 | `3622b93755c1495b392ed77db28b1e6466c3cc24` |
| thieving.png | 25×13 | 149 | `8fa22373c421fe5bfdd27072069104a43b99d6a8` |
| tombs_of_amascut_expert.png | 25×23 | 1047 | `3a0076003406f2b2b9c23a85f55192e984071d44` |
| tombs_of_amascut.png | 24×23 | 809 | `feccd433455fc871ab1732e6048a66a600500770` |
| tt200m.png | 25×25 | 515 | `69e6d6f47c917ea257a9e1e47493d24bc8bc66d0` |
| ttm.png | 25×25 | 473 | `4f627b5a2be2f3dcf1f549a35b992b617e727581` |
| tzkal_zuk.png | 27×27 | 669 | `b8e91819b1b61593a8f8bf55457570b14b7dad11` |
| tztok_jad.png | 27×27 | 379 | `6fe4d31d002bb9d716d60a285d2cb7cd70d252f9` |
| vardorvis.png | 24×24 | 316 | `eeb01c7dbbae4c91fa4b328e51e5be0476e778c5` |
| venenatis.png | 27×27 | 474 | `23fb77b5d2ad3359b8540440543346371270ac39` |
| vetion.png | 27×27 | 514 | `a6f244efe30085743736cc375ecfd9cbfe30eb43` |
| vorkath.png | 27×27 | 754 | `0e25fb6d4ee5c5d0b8e30a8cfa8143d5555678f6` |
| wintertodt.png | 27×27 | 560 | `8ac5ac98a93aa1c8aba2692f8a047a342c9e50f6` |
| woodcutting.png | 18×22 | 217 | `b95e637d8db184a2efd42692ba5196b741b4102e` |
| yama.png | 26×25 | 1053 | `6bd42c170a9616cdf924e56ace3b57df1b042ad1` |
| zalcano.png | 27×27 | 599 | `9fd5279ccf7aaacb6dcb7913ccb9525ffaeda121` |
| zulrah.png | 27×27 | 553 | `b1dfa0df1e7313a7c48d35adfcd38b4012e3e93e` |

## Upstream MIT notice

```text
MIT License

Copyright (c) 2020 Ruben Amendoeira

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
