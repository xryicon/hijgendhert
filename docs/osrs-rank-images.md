# OSRS clan-rank images

The site serves **268 original OSRS clan-rank PNGs** in the single local SVG sprite `public/osrs-icons/clan-ranks.svg`. The embedded images total **44,002 original bytes**; every image remains byte-for-byte identical to its upstream PNG. The sprite is 113,133 bytes before compression. Loading rank icons makes no request to the Wise Old Man API.

## Source and attribution

- Upstream repository: [Wise Old Man](https://github.com/wise-old-man/wise-old-man).
- Pinned commit: [f930946d4152e7c449df1dd367405f1351f2eeaf](https://github.com/wise-old-man/wise-old-man/commit/f930946d4152e7c449df1dd367405f1351f2eeaf).
- Source directory: [app/public/img/group_roles](https://github.com/wise-old-man/wise-old-man/tree/f930946d4152e7c449df1dd367405f1351f2eeaf/app/public/img/group_roles).
- Repository license: [MIT](https://github.com/wise-old-man/wise-old-man/blob/f930946d4152e7c449df1dd367405f1351f2eeaf/LICENSE), notice retained below.

Old School RuneScape game artwork belongs to **Jagex**. The repository's MIT software license does not transfer ownership of Jagex's game artwork. These original icons are attributed fan-site game artwork; no ownership or endorsement is claimed.

## Usage

Use the default `RankIcon` component from `components/rank-icon.tsx`, with the exact Wise Old Man rank or configured progression rank ID. Its props are `rank`, `size` (default 20), `className`, and `decorative` (default true). Set `decorative={false}` when the icon needs its own accessible label.

`rankSymbol(role)` from `lib/osrs-ranks.ts` resolves only the fixed upstream catalog to a local fragment. It accepts case differences and the same spelling with spaces or hyphens instead of underscores, such as `Deputy owner` and `deputy_owner`. It does not invent rank equivalences. Generic `member`, Discord `Admin`/`Staff team`, unknown custom ranks, and missing values receive a neutral Shield fallback instead of being presented as Recruit or another OSRS rank. The exact upstream OSRS ranks `administrator` and `staff` do have their own catalog icons.

Each symbol has a 24×24 viewBox containing its original 13×13 PNG, centered with preserved aspect ratio and crisp pixel rendering. The PNG payloads are wrapped in SVG without raster editing or regeneration. No runtime role string is interpolated into an asset path or symbol ID without the allowlist lookup.

## Verification

The pinned GitHub directory manifest supplied names, byte sizes and Git blob SHA-1 values. Every fetched PNG was independently verified against its manifest byte size and Git blob hash (SHA-1 of the Git blob header followed by the exact bytes), plus the PNG signature, IHDR and 13×13 dimensions. The sprite embeds those same bytes as base64.

| Upstream file | Dimensions | Bytes | Git blob SHA-1 |
| --- | --- | ---: | --- |
| achiever.png | 13×13 | 163 | `d9dd01f955e91209187a626c0cc77494f3e7b459` |
| adamant.png | 13×13 | 164 | `a4d09711e183b1eba5b2a3ab62e36adf1c3eaa4f` |
| adept.png | 13×13 | 148 | `72c1123084f8ac3bd59c4dd14b2ed33f6eb8b777` |
| administrator.png | 13×13 | 154 | `55649dd774266e43884993b41bbc047369315250` |
| admiral.png | 13×13 | 182 | `d0ec57571c323ddc3a8bcc381a69c0ccfa6cbdc1` |
| adventurer.png | 13×13 | 163 | `9bac24ad0df9f11637796e316291a1603e169dbd` |
| air.png | 13×13 | 145 | `b980c2e88da37f3dbebd6b5184372669d88b3f6b` |
| anchor.png | 13×13 | 168 | `7995cb7cb69fd76df94eab4d801c78025c0615c8` |
| apothecary.png | 13×13 | 171 | `37b8df7c2b4e2d3471197936b7c4794fb660613e` |
| archer.png | 13×13 | 202 | `9e7a5612ac53a06df294a2e39b9e16b17719ba71` |
| armadylean.png | 13×13 | 165 | `4ddf68c6984f7eaa8ea556f1f4986edd83de7df4` |
| artillery.png | 13×13 | 170 | `0d5aa85209451d7ef04b4563218ba5290d23185b` |
| artisan.png | 13×13 | 182 | `58128f2e524bbd285159e99a6238016c14700870` |
| asgarnian.png | 13×13 | 154 | `4ddb26ed00de7fb3168546bf14858c959af185d8` |
| assassin.png | 13×13 | 151 | `fe28318ca8fa2af48688e72663781094c1b5387f` |
| assistant.png | 13×13 | 156 | `1a32ccd15c47af4c44a1a15ca672776d230930a5` |
| astral.png | 13×13 | 159 | `2655f90983f056280326f7c02c66ba9e4480a8e0` |
| athlete.png | 13×13 | 164 | `dcec7f1c23c38870ac17985be7cff28c757dd633` |
| attacker.png | 13×13 | 160 | `4994aabc33fbc5d9b0d6a2bc1175e7742d2f36c5` |
| bandit.png | 13×13 | 151 | `8f07bbb762cb02c2d87fe1690ddf5d1ace4dca1c` |
| bandosian.png | 13×13 | 156 | `3a75a4f292cecca3fb0ae78ab8ae0fd357d76939` |
| barbarian.png | 13×13 | 163 | `7387d6ac43d806875ac9626c13e6c40a4263e08d` |
| battlemage.png | 13×13 | 172 | `d99ee8ee58d847b3de2b12d2847d7bd4fd2f23ec` |
| beast.png | 13×13 | 160 | `4eb2e209fa9dd154c1b570cf69c020bf17c69aa2` |
| berserker.png | 13×13 | 167 | `a8ef5418b2bc9a45be1d4a6e6442c7fa01ffc9a6` |
| blisterwood.png | 13×13 | 159 | `013851eb0f37b92b0f95397ea2fd74900c60a903` |
| blood.png | 13×13 | 146 | `8abb77abffcda5368e24ff3a01ac1910a429d308` |
| blue.png | 13×13 | 143 | `c62f10cacd6b1c9244ffacf3b5146f43a7abeec4` |
| bob.png | 13×13 | 173 | `96006bc8cdc56339834c1341d03aec811f653590` |
| body.png | 13×13 | 159 | `9a1edd0f5e06f19bc5f5273a3c6eccf3fb121b8f` |
| brassican.png | 13×13 | 164 | `8001d39fa7f68ae4d47a682b90784b7abeedd32e` |
| brawler.png | 13×13 | 163 | `d2c9152e0963648a26cf55ada0fe048e858a7c92` |
| brigadier.png | 13×13 | 184 | `4e31fe5460bf94b9d09770047115da261789fc0d` |
| brigand.png | 13×13 | 151 | `b49f3bf70858cf11be02d1da1de7e0f94360e91c` |
| bronze.png | 13×13 | 176 | `55b7f4268fa6c8693f474ee733676d328cb231f7` |
| bruiser.png | 13×13 | 163 | `d1e3e490cdebf87571407475b65aadc06e9c0736` |
| bulwark.png | 13×13 | 161 | `8d143e643b270e2e7b3ac018becfe004f3ba82fb` |
| burglar.png | 13×13 | 151 | `06209b04a329025a991149f84438d063d520dd1f` |
| burnt.png | 13×13 | 182 | `2eebce3dd117e675192d4ef2e958f7f0dd0be5be` |
| cadet.png | 13×13 | 169 | `8e8b5123e705e85745da55371b496b3f16ce457d` |
| captain.png | 13×13 | 161 | `c993850735396ebf918049b2bf9adc4507f810c0` |
| carry.png | 13×13 | 197 | `76f8c331255b928b3a9b8adb3074b5283535bccf` |
| champion.png | 13×13 | 160 | `f5a7a3a7ea41455d343e352e288f1703dbfcb26b` |
| chaos.png | 13×13 | 166 | `be6e12ce6d5c0e1869100233ca45d9d85a5af4ea` |
| cleric.png | 13×13 | 158 | `c76b741b248644c6509f9898224fbe355048e0dd` |
| collector.png | 13×13 | 164 | `24367d5cb58964784e8eb19a777338776136b6f5` |
| colonel.png | 13×13 | 182 | `118cf3273d07ad4d3ed0bbd386abfc1bf88d00dd` |
| commander.png | 13×13 | 166 | `998d0d88cb07bf9598764593a593141483911501` |
| competitor.png | 13×13 | 174 | `eef4230ae95f654e9c74f0908c65a22e429d617f` |
| completionist.png | 13×13 | 163 | `a50fa9200843a9749813d154e65eadaf5625d728` |
| constructor.png | 13×13 | 196 | `7b5dd4a0a92598c89c92505687153fc476a5ca3f` |
| cook.png | 13×13 | 184 | `9494096e36352ef7363b569126a596c864fe5892` |
| coordinator.png | 13×13 | 156 | `9c3f0171111dc501e08df360e3643114a29cf0b4` |
| corporal.png | 13×13 | 146 | `3d07bb6a9723d78cc0056569c9d662c2f18887d3` |
| cosmic.png | 13×13 | 146 | `a48c46ce2b077c6834d0fedddd4699c5b91116b0` |
| councillor.png | 13×13 | 156 | `097cab906301877bd935a4ae254da99096a69c02` |
| crafter.png | 13×13 | 186 | `8dd597b73625cde96cbfb46483248194d272b4af` |
| crew.png | 13×13 | 146 | `6664f52c50dc9380d696fcd8692b96b49c9f5fd4` |
| crusader.png | 13×13 | 155 | `78fed837fadc51c5a0056b468ff88e611968e19b` |
| cutpurse.png | 13×13 | 151 | `640eca4dbe6dd9dad54ddfdf4ff2bce0ad0ea750` |
| death.png | 13×13 | 164 | `6fd661dfe2043be6b742cfa84e6fe9faa61c4c45` |
| defender.png | 13×13 | 148 | `c8adbb5c5a85b1502f2d0a6ac429c9b3105adba1` |
| defiler.png | 13×13 | 160 | `d83006e33a81ecd3befd511e2fc06dbc368a8ba2` |
| deputy_owner.png | 13×13 | 154 | `1fee73e94dc6de371a8da700af033cd1b2077c4c` |
| destroyer.png | 13×13 | 175 | `fe2abfdbac0ea5268cdce845258287a05d66bc0b` |
| diamond.png | 13×13 | 144 | `b3e57bea5e3adf0c60dad5345891d9f67404d6b9` |
| diseased.png | 13×13 | 159 | `774d756e7169d4409f50495bfbbd795470fbcdbe` |
| doctor.png | 13×13 | 142 | `bc2e3f0f89cb7af3238615d1573bb84260f8e60e` |
| dogsbody.png | 13×13 | 151 | `9afda426c5e2561ef27edea1a5e2686b70abf135` |
| dragon.png | 13×13 | 178 | `39673f46bcccf6852742811fd74473437bb81fec` |
| dragonstone.png | 13×13 | 144 | `5fdd3a5af46b33498b6f11b61c55268fee9cbe06` |
| druid.png | 13×13 | 158 | `341f3b5b7289cee0cb687b4dee15d8ec82a5710a` |
| duellist.png | 13×13 | 178 | `53e171a32b5972bc2f8e108ae71cba5a77604aac` |
| earth.png | 13×13 | 139 | `4a3d8224ac55f60398290c74862107d1f03b029f` |
| elite.png | 13×13 | 163 | `ddd053d60888aac001f20269b0c8452f669cea67` |
| emerald.png | 13×13 | 144 | `215eb439e646d44937d472fe6dffa4630d3537cb` |
| enforcer.png | 13×13 | 157 | `166b1aeab8d8b42b13b017e5876dba5d228a46f7` |
| epic.png | 13×13 | 160 | `4f8f3f30a889402a387c53486c023555f4eea44c` |
| executive.png | 13×13 | 172 | `7e4d5f8859d418f3f68c9038e9ad17dde0c2c34f` |
| expert.png | 13×13 | 177 | `921ba102fb57ef1292ea32b704f94935ff28b559` |
| explorer.png | 13×13 | 163 | `4d49df9fab74899d68d86cfbe04eff85923fd124` |
| farmer.png | 13×13 | 190 | `661dab77261c404d67b68e939da47b2d79bbf348` |
| feeder.png | 13×13 | 165 | `673da7e29fd15ac6ec7618a125f232a8879afbf5` |
| fighter.png | 13×13 | 163 | `0a4b76086168197c1f34cd8f51a3066ebbd7862c` |
| fire.png | 13×13 | 160 | `6b593754dd8fe80747a7d795e108913d94cfee24` |
| firemaker.png | 13×13 | 182 | `781bd9520981e0b6a353ffb719fdc637675978f9` |
| firestarter.png | 13×13 | 183 | `258cec1f7d6f5b92164a74106fff27511e8e40d4` |
| fisher.png | 13×13 | 173 | `d2ac6b8d522936846259b248a5ec744c56db11f6` |
| fletcher.png | 13×13 | 171 | `1effae07e06b3e4e65bf9dec4393f38c4278f712` |
| forager.png | 13×13 | 163 | `a7c9fa911c44d0519a9adb05df0af98590b59b93` |
| fremennik.png | 13×13 | 152 | `4bf44ce75f6e3010a57fd3a670d1928874e3cc9f` |
| gamer.png | 13×13 | 163 | `86b2b94abfdae983406ce222337a07fb8463401a` |
| gatherer.png | 13×13 | 164 | `b0e5481814e84f6a557618dfbbccfd6c20d0c8bf` |
| general.png | 13×13 | 161 | `4df8d6e1fecbb76d5769679c0542f91108395014` |
| gnome_child.png | 13×13 | 177 | `07a8e0b5ff9a24b0bd2eb18c2ce28f928a56e152` |
| gnome_elder.png | 13×13 | 177 | `eaaa54504b9cf4aa1616d5373c1050c2515f25c7` |
| goblin.png | 13×13 | 177 | `077a790a9572b41000f3dd0d594e9f2bd5861d59` |
| gold.png | 13×13 | 176 | `6737ca8debbc5393cd529450d75213b767699a74` |
| goon.png | 13×13 | 163 | `6087f2ad6ef6329c098a6a989de0ecbb676f9c00` |
| green.png | 13×13 | 143 | `f7b65a5ee2f2aac184b015be3469dee73901bf9b` |
| grey.png | 13×13 | 143 | `9b6255ddb489aae1a8588cbd3ce3b414e9043d9a` |
| guardian.png | 13×13 | 161 | `45f2485dfff5279e2547c67c74d61f3a92e43d91` |
| guthixian.png | 13×13 | 157 | `97480f5a61e8975b2e8bfba98a96261db73155f5` |
| harpoon.png | 13×13 | 157 | `72ca2be015349b4ab5b659fcc7c1f58c2242e3b1` |
| healer.png | 13×13 | 158 | `8b8ca5788cfecc7f54e2182deb0d9c3d09152eb7` |
| hellcat.png | 13×13 | 177 | `18569d73164f7d6a6d4931bedc4476bfc4e444f8` |
| helper.png | 13×13 | 172 | `2564b1629d7e83c49c1cb3b82a7189eb234c12a4` |
| herbologist.png | 13×13 | 159 | `7ffc95efd00ba32540465aab4f75fc4d099ab010` |
| hero.png | 13×13 | 160 | `c0a2e83ff0f45eca16c99727908c1353b976e57d` |
| hoarder.png | 13×13 | 164 | `dfca512332462061cb0356681ce5ac06f87deb80` |
| holy.png | 13×13 | 174 | `c103d0651627046a5a090fc8514601f829ef9d2e` |
| hunter.png | 13×13 | 166 | `c333373c49d8e4e6133124ce1255fef470b1ec27` |
| ignitor.png | 13×13 | 183 | `1b0933af9567a939c63ba826c58f3ae89bbc56a2` |
| illusionist.png | 13×13 | 176 | `295ec6497fcb59d55d0d69ca93a73c6f6c478e06` |
| imp.png | 13×13 | 210 | `b6df76a8009f91e894e9db6e4c29b101e7b284ed` |
| infantry.png | 13×13 | 184 | `b11d9c9b1440b5ef2bcd6678a4b02391e852bcc1` |
| inquisitor.png | 13×13 | 178 | `ad9633ba3c162da9edeeb73fd4aea135fce61bd3` |
| iron.png | 13×13 | 164 | `0c282f3191daa4e0356d860063866453c34d9fe0` |
| jade.png | 13×13 | 144 | `9e15eabe15713eaecbe87ce00618f6247e51cd69` |
| justiciar.png | 13×13 | 161 | `442b7c88c81a000ba9267615efff29e8b98aff15` |
| kandarin.png | 13×13 | 138 | `19c7f7afd7cd057e8e170180ff837e580e77fcb6` |
| karamjan.png | 13×13 | 141 | `1c393f082212289c05957f2ea686683ac24dde32` |
| kharidian.png | 13×13 | 170 | `827c67832c4abe365201f3e19e34848e0f467064` |
| kitten.png | 13×13 | 173 | `02367b8403682363353f492b6b56513b976b9725` |
| knight.png | 13×13 | 178 | `488aa8e32b8aa8c3f0364bf990890d45e54f0451` |
| labourer.png | 13×13 | 164 | `6b85b7a8785e6f89c7428dbb114f134ffac386e2` |
| law.png | 13×13 | 165 | `049d5696c3ac4336b37c85f0372606aa5a97c26e` |
| leader.png | 13×13 | 172 | `b7b73fb976927a4b5c9bba4a23ad439fc86a9714` |
| learner.png | 13×13 | 156 | `a0a27a64a3841a98f4c714693ebfc6f1a2d8bc5e` |
| legacy.png | 13×13 | 182 | `0c6f4a39857684887a46b48186c7940284183f3f` |
| legend.png | 13×13 | 166 | `bf8033b0d747f80af555ed88e7d3b3779ca6d327` |
| legionnaire.png | 13×13 | 146 | `0041eafe3cef409de96f670f35233b54bec1cbcc` |
| lieutenant.png | 13×13 | 161 | `3845115398cc30893f889a1d8c0c9ce0544bf001` |
| looter.png | 13×13 | 188 | `3f276c018e90712b37b4258103bc4cb2266e5468` |
| lumberjack.png | 13×13 | 171 | `fa223ae22069483ca09ed053d3c3da7e710f0168` |
| magic.png | 13×13 | 181 | `5a92243f459bc15bee60844074ebfa34af972660` |
| magician.png | 13×13 | 172 | `027a03dd102bc255c4e0cb9f182ce9d229b0a6fe` |
| major.png | 13×13 | 166 | `098357ab591d65154c263550fd28cd860f7c56a2` |
| maple.png | 13×13 | 171 | `d9d2fcf91f94f31ba1541755887f8fc3f4730921` |
| marshal.png | 13×13 | 184 | `bf50dca497367ca266b249ac79103cdd02986b7d` |
| master.png | 13×13 | 166 | `c71b55234c7b712de7e1a6964df0b1203bf81267` |
| maxed.png | 13×13 | 178 | `21a3b42a09b28f73f3c2c94f48dc2a66608a126f` |
| mediator.png | 13×13 | 175 | `ca2504f96fdea5fd07ad2379d66e1e3590bbb605` |
| medic.png | 13×13 | 160 | `dd842df6484c114aabab2f6e8e15e1959dd7396a` |
| mentor.png | 13×13 | 171 | `cc02d3061c219b91bcee6b3f8624d5f13c0d2bd3` |
| merchant.png | 13×13 | 172 | `33266edbd41de2f5c5299ebb825f6708361409a4` |
| mind.png | 13×13 | 146 | `d5dd988956ff78f34bd42bcb64f013a2b482f41a` |
| miner.png | 13×13 | 174 | `654a187dd1fc85df880d9695563efe5ab2ad2845` |
| minion.png | 13×13 | 151 | `8f858011e898c480dadb29ff93e705d0b44e6953` |
| misthalinian.png | 13×13 | 150 | `292aaf939044ffbfd95c84091b359bceaad559d0` |
| mithril.png | 13×13 | 171 | `f6cb2f3394f8d81c043a8e05c9ceaae05b9c7249` |
| moderator.png | 13×13 | 200 | `b41321b9bc1e3617a5a5abe8464ab88dcc587b66` |
| monarch.png | 13×13 | 172 | `00ceba0e9258b245ba7997be429b22ac77f4481e` |
| morytanian.png | 13×13 | 172 | `da16abbb8089b141c1523975225bed22a2b0f38a` |
| mystic.png | 13×13 | 160 | `5c85d65b6017d4060c02ed74d43b2ba8c43bbd60` |
| myth.png | 13×13 | 168 | `7413614ece73fe2b99493a569d1e90dc49b4acb9` |
| natural.png | 13×13 | 169 | `0139810a80eff7e55b8594284c15c54b1b6357c3` |
| nature.png | 13×13 | 154 | `ebba352b317091d806e4dcdd879d661b748c4d31` |
| necromancer.png | 13×13 | 172 | `70cecb8ea33a0cb8fdb44858a8f83b4e732b221a` |
| ninja.png | 13×13 | 177 | `230b0868f6dd934dd075cba4af2c38711947d087` |
| noble.png | 13×13 | 151 | `9b69d1992e7cc1ef4d3a7f9bae5e94c236908a4e` |
| novice.png | 13×13 | 156 | `06816e301a65935b436e3795a32646557e7a6d04` |
| nurse.png | 13×13 | 158 | `1d0719a58f594c906c1592a5a674aa65735c9cc2` |
| oak.png | 13×13 | 171 | `fa223ae22069483ca09ed053d3c3da7e710f0168` |
| officer.png | 13×13 | 142 | `b8d23b99592a576ff12c399dc3bc0e38aebfee96` |
| onyx.png | 13×13 | 144 | `b8ed6ed44852d340a4ab7bc639f54fecbf1c5a44` |
| opal.png | 13×13 | 144 | `aa2fc375a773b220458ad4103b3e1bcc5463794d` |
| oracle.png | 13×13 | 160 | `f90fe3b373a74c20268bf8f70ff5fedd3ae4ba4e` |
| orange.png | 13×13 | 143 | `9b4f26be52ba868a1afa2e6119036aa0e80d85d4` |
| owner.png | 13×13 | 154 | `da3ceed914a5079a3cc3ddf9124693bc409c8519` |
| page.png | 13×13 | 144 | `ac61a5c79718c6d0b74b0092f328d6e65e383e6e` |
| paladin.png | 13×13 | 174 | `8eee495534da06f7fa332d9bdda4f8923c600b36` |
| pawn.png | 13×13 | 142 | `a755d90ec5a6b2a64e9d71100ba2cd5e9541643b` |
| pilgrim.png | 13×13 | 169 | `a1a6c0f4ad859f27db21e295b1048871fb551153` |
| pine.png | 13×13 | 163 | `bfc3cc3cce388e7cd3464bb79c1195b951c2e395` |
| pink.png | 13×13 | 143 | `10e995bc10cc4bcd5e2c872d675be019f1d58d90` |
| prefect.png | 13×13 | 171 | `a7da83278a76b48b9ff8796db63a8367c7e2d7c3` |
| priest.png | 13×13 | 158 | `01d821ba78f9fc94113a08edb98b6ab0e8ca4c46` |
| private.png | 13×13 | 164 | `44efe61a8918d96668f942a4c8ad9e4ce3c677bd` |
| prodigy.png | 13×13 | 183 | `8ffbffa04d5241fb2901ee3c75d1fdade867df28` |
| proselyte.png | 13×13 | 166 | `48765504441be7aa7297cba29a15800f0f4bc3cd` |
| prospector.png | 13×13 | 164 | `4b4c2a70cac65211209daaaab1a9df574dfe12a5` |
| protector.png | 13×13 | 161 | `1421d6f109badd9df6c4092d6621eaac60c70a78` |
| pure.png | 13×13 | 160 | `50cc6e38ee6944197ea9bf930dadb014e3d670d9` |
| purple.png | 13×13 | 143 | `9ac70f1601d56d6ca084487aa996815c025b8125` |
| pyromancer.png | 13×13 | 182 | `d2a6ab25fd6a506cd3dccff5d0cbd010d98222a3` |
| quester.png | 13×13 | 163 | `f8904e06f843eb3b510853192b3ffed76e161d82` |
| racer.png | 13×13 | 169 | `b896a6724c12f9a246858c1e266cf4b8328ef04e` |
| raider.png | 13×13 | 163 | `c02419eb421a1f2eca61c491b6eade2c582add1c` |
| ranger.png | 13×13 | 192 | `c2d3049a5521f6cecb49a0431c593e3c3c982ea3` |
| record_chaser.png | 13×13 | 169 | `2f2e282e3d829674137fe5045a4ec3f30c10c9ea` |
| recruit.png | 13×13 | 136 | `fec106a5b8380a912c8c7b99b681a451656f5927` |
| recruiter.png | 13×13 | 153 | `345ff73d33415b9e7c93c4da00956ac08d296b75` |
| red_topaz.png | 13×13 | 144 | `8b692ed6979d34cffa751d8126c99615dbf15b9e` |
| red.png | 13×13 | 143 | `6ca51ecbce79db15d4e87a2e1e49830ef9310765` |
| rogue.png | 13×13 | 151 | `82eb6c6095bb5c3d800162918921f690605c4040` |
| ruby.png | 13×13 | 142 | `9f4ca3fba4e046e1c929f466976913ec9f2ef197` |
| rune.png | 13×13 | 164 | `d4e424d9509295293b5833297d457e2810515fdd` |
| runecrafter.png | 13×13 | 191 | `835add05182088ea827e2c81a5179b7ab60c5384` |
| sage.png | 13×13 | 174 | `df76fde561a21dbd5c007eaba46baa20825cdb7d` |
| sapphire.png | 13×13 | 144 | `5f4955c1d3842cff269c4980e4cbe7dbb675af63` |
| saradominist.png | 13×13 | 163 | `9b671d4e835215fdb984a3e75b5e0833513007a7` |
| saviour.png | 13×13 | 174 | `54d6e1e0561929cbaa485cf5ae24ad658aad9837` |
| scavenger.png | 13×13 | 164 | `f8712f9a03106cea939f015b397880e71da1c94f` |
| scholar.png | 13×13 | 156 | `6217c6416e31688f28f41d6d262f5355a6729fba` |
| scourge.png | 13×13 | 163 | `8db33b5856cef6ce4b02c6aeebf53fd04c7fdd18` |
| scout.png | 13×13 | 151 | `cb6c02be9797d446ef3927c4988e4b9f12ed0852` |
| scribe.png | 13×13 | 156 | `335026d5f24fef9d2fd1a0189cdd102dee79a1e4` |
| seer.png | 13×13 | 172 | `b1c7bac5a216038668971727ad6d50126cd34f3b` |
| senator.png | 13×13 | 172 | `b0828f71020cfc23f047ff01c6277bff0a5dbc2e` |
| sentry.png | 13×13 | 161 | `59e6ea22e29d41504ea085c91030901a2f94b15d` |
| serenist.png | 13×13 | 151 | `b9e91c7527159b9671bd9b54d710c7a9e0c27439` |
| sergeant.png | 13×13 | 145 | `8d3b67108993b5c802152dead4ba2b78d7f02752` |
| shaman.png | 13×13 | 158 | `069c5eb3248263ac50a3989c782098f0df4899ab` |
| sheriff.png | 13×13 | 192 | `96e543faf0d7449efca964e219be89193ed0667b` |
| short_green_guy.png | 13×13 | 177 | `633b5adf44454d9e30f5f9c343f9fd19f3c93578` |
| skiller.png | 13×13 | 167 | `5e30ce50ec7a506d769bae93845ecbfbff75c61d` |
| skulled.png | 13×13 | 177 | `d2c4cf27c84d42dc1c531c107b6da02c1db7a1da` |
| slayer.png | 13×13 | 212 | `89419b3c1b02ec237458cde6c8ed1c90d05b01a3` |
| smiter.png | 13×13 | 161 | `6a82234310aec8435ddfda0fab8f7708fb55381e` |
| smith.png | 13×13 | 172 | `a16985c8e797d505b01ceef1af83beb5b0208307` |
| smuggler.png | 13×13 | 151 | `02bfc109ac9cfb16a5ad3c86eecc38a9bff81e0d` |
| sniper.png | 13×13 | 179 | `e8074723304af07398cf0842c0e7444914156d81` |
| soul.png | 13×13 | 157 | `d816b65f2c48b8afa85192b300940d5ab908deab` |
| specialist.png | 13×13 | 183 | `b3c7b1362cf92fee31fff2ba9140871780155844` |
| speed_runner.png | 13×13 | 169 | `208707752c9fe9ac88224d312f9f43202ab78e12` |
| spellcaster.png | 13×13 | 170 | `0ae6e3f0675085270ccdddb1837aaf8610dd14f1` |
| squire.png | 13×13 | 178 | `f14eef0023e09adb928ff06e8d61115561e8d9a3` |
| staff.png | 13×13 | 146 | `fc7100c926713c9bb94d4ec068f10178cad7fb61` |
| steel.png | 13×13 | 178 | `500111221bb1c494a016b2f6558331d7e05f6f86` |
| strider.png | 13×13 | 169 | `9c40ddfb575113a48777f6a7563760704e7e1a62` |
| striker.png | 13×13 | 178 | `48ad8d3d67b63681b930b16e5495da01d932c071` |
| summoner.png | 13×13 | 172 | `038c5e4268e0900b2a8d8433834992843892ac57` |
| superior.png | 13×13 | 171 | `49ce648d688067a15d7ae3f848d20d38d1dd37bd` |
| supervisor.png | 13×13 | 170 | `157c739a9a7904468b1766289dd0367f4b160600` |
| teacher.png | 13×13 | 156 | `a2ee22abf92545681f9395d7c909ec9686c4e575` |
| templar.png | 13×13 | 167 | `70d037b4cef5e507f035d7194362f716e0923a66` |
| therapist.png | 13×13 | 158 | `8080b2e2ba7e9b1aeb98d18872c8ae440710a914` |
| thief.png | 13×13 | 151 | `752025c9e6b506d1fe353cb8210ff37da59fb197` |
| tirannian.png | 13×13 | 160 | `c07cabe04ed2a3f44edcf1ee0f100f8bf7288465` |
| trialist.png | 13×13 | 160 | `c20589fb551713a7db3be6168e16b46c5f0cfa09` |
| trickster.png | 13×13 | 172 | `c60ad17f74abc6d527e44c8d2b7485847ad29d6a` |
| tzkal.png | 13×13 | 177 | `897db225043e8ba6e4ba9702a99fc8ec8977bdc4` |
| tztok.png | 13×13 | 168 | `0bbab32a83c0b6277a87b92787de2f20330dd57e` |
| unholy.png | 13×13 | 169 | `627c48834d61d1d8edca95b5b72cbb53d4feaabc` |
| vagrant.png | 13×13 | 169 | `870c91f714eacfc331ae68a568c5b98cbd796ba6` |
| vanguard.png | 13×13 | 161 | `fab6b3cd832eeb77fb1288ce716ba542bbcc3d82` |
| walker.png | 13×13 | 169 | `1f1661cd102c234d121e42c2effb4ab0e1c56084` |
| wanderer.png | 13×13 | 169 | `c04a2ad00d641494f129618c55a878ca84f9ff95` |
| warden.png | 13×13 | 161 | `aff167195008b6f9c77ee635ba06ef86411d0c0e` |
| warlock.png | 13×13 | 172 | `1898726969d2c0a28a6002ec08123df5f4d98bad` |
| warrior.png | 13×13 | 163 | `733f2633eef260e8003f047f078acdbf7de13215` |
| water.png | 13×13 | 148 | `d98617f70496745804ea3abfd065e4ac73b9a463` |
| wild.png | 13×13 | 130 | `bd537dac9dfe693bb21f776f207c91fc375f0e70` |
| willow.png | 13×13 | 171 | `bc37097c3e7953e361ab0420f5cdcdb4ee883bae` |
| wily.png | 13×13 | 180 | `596ac732ed5831dc98776450bfe6a2ffcb512031` |
| wintumber.png | 13×13 | 172 | `02ab788a413c61c58e53a39709993eeda540d554` |
| witch.png | 13×13 | 179 | `1f12b0f9cc66be7de5a8e5b4c50421ee5e375f7d` |
| wizard.png | 13×13 | 172 | `4bb833d19817ddbbfd5d450192bf01367052f89a` |
| worker.png | 13×13 | 164 | `bf10d464c240d04202c5d23b0211ee00bdc83006` |
| wrath.png | 13×13 | 138 | `8cbe8d5a48f1ee12c3c3755676b773b13f146e56` |
| xerician.png | 13×13 | 152 | `483c66236fb35c0fde736c387209dabeb2b8a0ca` |
| yellow.png | 13×13 | 143 | `e73b681132bfd942c246d95e5a83aaba6e7d686e` |
| yew.png | 13×13 | 172 | `52fb7f7241474825d34a901e90404c52de83086a` |
| zamorakian.png | 13×13 | 168 | `16b6ea73df8d0908f58d2e889c10e4e4e99ce83b` |
| zarosian.png | 13×13 | 155 | `3f2307bf8478b6468105303f3e0e2fc51607412e` |
| zealot.png | 13×13 | 158 | `92d6caba67a0117dff7068ef2a1af081e39e91dc` |
| zenyte.png | 13×13 | 144 | `c1abcc5daa2e30f3e1c855280d54166f7eb9d47f` |

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
