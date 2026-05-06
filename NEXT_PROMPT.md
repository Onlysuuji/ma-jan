# NEXT_PROMPT.md

## 2026-05-07 作業メモ

### AI作業メモ

今回追加:

1. `world` に待ち質、1向聴の骨格、巡目、打点、相手リーチ人数を使う押し引き評価を追加
2. 平場の上位候補に軽量1手先サンプルを入れ、次ツモ後の最良シャンテン進行を評価
3. AI推奨理由に「安牌の棚」「手牌の骨格」「速度と打点の天秤」を反映

確認済み:

- `npm run build`
- `npm test`
- `npm run selfplay -- 50 42`
- `npm run tournament -- 80 42 random,simple-shanten,attacker,world`
- `npm run tournament -- 200 42 random,simple-shanten,attacker,world`

80局 seed=42:

- attacker: win 27.5%, deal-in 10.0%, avgRank 2.31, avgScore 584
- world: win 35.0%, deal-in 15.0%, avgRank 2.19, avgScore 976

200局 seed=42:

- attacker: win 32.5%, deal-in 8.5%, avgRank 2.27, avgScore 1077
- world: win 28.5%, deal-in 12.0%, avgRank 2.25, avgScore 783

結論: `world` は80局では `attacker` を上回るが、200局では平均順位/ラス率のみ上回り、勝率/平均収支は未達。次はリーチ前の攻撃力を落とさず、リーチ後の放銃率を `attacker` 近くまで下げる。

今回完了:

1. 4人対戦で終局後に全員の手牌が自動公開されるようにした
2. 終局詳細として4席の手牌、待ち、和了牌、放銃牌、点差を表示するようにした
3. 「全手牌を見る」デバッグ切替を追加した
4. `AIを進める` が現在の `人間 + AI推奨` 席でもAI代打で1手進め、その後に次の補助席/終局まで進むようにした

確認済み:

- `npm run build`
- `npm test`
- `npm run tournament -- 40 42 random,simple-shanten,attacker,world`
- `npm run dev` 起動、`wget http://localhost:3000/` でHTTP 200確認

短期ベンチ (40 hands, seed=42):

- random: win 0.0%, deal-in 27.5%, avgRank 2.95, avgScore -2075
- simple-shanten: win 27.5%, deal-in 12.5%, avgRank 2.33, avgScore 703
- attacker: win 27.5%, deal-in 10.0%, avgRank 2.40, avgScore 193
- world: win 35.0%, deal-in 22.5%, avgRank 2.33, avgScore 1180

`world` は短期では勝率・平均収支が上だが、放銃率が高い。次は200局以上で再検証し、リーチ者への1シャンテン押し引きを調整する。

## 2026-05-06 ユーザーからの追加要望

次回はまず `TODO.md` 先頭の「ユーザー要望メモ (次回最優先)」から着手すること。

1. 4人対戦でロン/終局したら全員の手牌を公開する ✅ 2026-05-07
2. 4人対戦の `AIを進める` ボタンが動かない問題を直す ✅ 2026-05-07
3. 今後のAI強化では、強い麻雀AIや上級者のコツを調べ、麻雀らしいメタファー付きの評価指標・推奨理由として実装する

次回のAI強化では、強い麻雀AIや上級者の押し引き・河読みの判断軸を調べ、`lib/ai` の評価項目名や推奨理由に落とし込む。

## 2026-05-06 追記: 4人対戦サイト

現在のUIには `1人練習` と `4人対戦` のタブがあります。`npm run dev` で起動して `http://localhost:3000` を開き、上部の `4人対戦` を押すと使えます。

- 初期設定: 東家だけ `人間 + AI推奨`、他3席は `AI自動`
- 各席のボタンで `人間 + AI推奨` / `AI自動` を切り替え可能
- 人間席はAI推奨を見ながら手牌クリック、または `推奨で打つ`
- `AIを進める` でAI席を自動進行
- まだ no-call 対戦なので、次は鳴き判断、局進行、結果履歴、UI polish を進める

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
- `scripts/tournament.ts` で random / simple-shanten / attacker / world を比較できる
- 4人ベンチは同じ山を4席ローテーションして、席順・配牌ブレを抑える
- リーチ後は対局エンジン側でツモ切りを強制する
- `npm test` は12件

### 直近ベンチ

`npm run selfplay -- 50 42`

- random: tenpai 0.0%, agari 0.0%, avg final shanten 3.74
- simple-shanten: tenpai 70.0%, agari 24.0%, avg final shanten 0.08
- current: tenpai 66.0%, agari 32.0%, avg final shanten 0.04

`npm run tournament -- 200 42`

- random: win 0.0%, deal-in 26.5%, avgRank 3.08, avgScore -2129
- simple-shanten: win 24.0%, deal-in 12.5%, avgRank 2.40, avgScore 338
- attacker: win 31.5%, deal-in 8.0%, avgRank 2.25, avgScore 1086
- world: win 31.0%, deal-in 13.5%, avgRank 2.27, avgScore 706

`world` v1 はツモ率を上げますが、200局では `attacker` が勝率・平均順位・平均収支で上です。

### 次の仕事

`TODO.md` の P0 を上から進めてください。最優先は **4人ベンチで `world` が `attacker` を上回る調整** です。

候補:

1. 1シャンテン押し引きの改善
   - 相手リーチ人数、巡目、打点、受け入れ枚数、待ち質を統合
   - `world` はラス回避は良いが平均収支が足りないので、勝ち切る押しを増やす
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
