# NEXT_PROMPT.md

次回エージェントが、そのまま貼り付ければ作業を再開できるプロンプトです。
レート制限後、新しいセッションで以下をそのまま貼ってください。

---

## プロンプト本体 (ここから下をコピー)

このリポジトリ (`C:\Users\sutec\ma-jan`) は、4人対戦でも世界一を本気で狙う麻雀AIを作る Next.js + TypeScript アプリです。

### まず実行

1. `AGENTS.md`, `PROJECT_STATUS.md`, `TODO.md` を読む
2. `npm install` (必要なら)
3. `npm run build` と `npm test` が通ることを確認
4. AIを触るなら `npm run selfplay -- 50 42` と `npm run tournament -- 40 42` を短く回す
5. UIを触るなら `npm run dev` でブラウザ動作確認

### 現在できていること

- 1人練習画面は動く
- `evaluateDiscards` が打牌候補をスコアリングする
- `src/lib/ai/defense.ts` に現物 / スジ / 壁 / 字牌見え枚数の危険度評価がある
- `src/lib/mahjong/match.ts` に4人 no-call 対局がある
- `scripts/tournament.ts` で random / simple-shanten / attacker / push-fold を比較できる
- リーチ後は対局エンジン側でツモ切りを強制する
- `npm test` は12件

### 直近ベンチ

`npm run selfplay -- 50 42`

- random: tenpai 0.0%, agari 0.0%, avg final shanten 3.74
- simple-shanten: tenpai 70.0%, agari 24.0%, avg final shanten 0.08
- current: tenpai 66.0%, agari 32.0%, avg final shanten 0.04

`npm run tournament -- 40 42`

- random: win 0.0%, deal-in 22.5%, avgRank 3.00, avgScore -1928
- simple-shanten: win 30.0%, deal-in 12.5%, avgRank 2.27, avgScore 830
- attacker: win 32.5%, deal-in 5.0%, avgRank 2.25, avgScore 833
- push-fold: win 17.5%, deal-in 7.5%, avgRank 2.48, avgScore 265

### 次の仕事

`TODO.md` の P0 を上から進めてください。最優先は **4人ベンチで `attacker` を上回る新エージェント** です。

候補:

1. 1シャンテン押し引きの改善
   - 相手リーチ人数、巡目、打点、受け入れ枚数、待ち質を統合
   - `push-fold` は守りすぎ、`attacker` は押しすぎなので、その中間を探す
2. モンテカルロ探索
   - 各打牌候補から1〜2手先をサンプル
   - 期待和了率と放銃期待値を `evaluateDiscards` の score に統合
3. 鳴き判断
   - 役牌ポン、喰いタン、形テンをまず入れる

### 守るべきルール

- `AGENTS.md` を必ず守る
- AI強化を最優先
- `lib/mahjong` と `lib/ai` の依存方向を逆にしない
- 終了前に `npm run build` を必ず通す
- `PROJECT_STATUS.md` / `TODO.md` を更新してから commit
- 壊れた状態で終わらない

### 作業終了時

1. `npm run build`
2. `npm test`
3. AI変更があれば `npm run selfplay -- 50 42` または `npm run tournament -- 40 42`
4. `PROJECT_STATUS.md` 更新
5. `TODO.md` 更新
6. `NEXT_PROMPT.md` 更新
7. Git commit (`feat:` / `fix:` / `chore:`)
