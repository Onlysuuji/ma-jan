# NEXT_PROMPT.md

次回エージェントが、そのまま貼り付ければ作業を再開できるプロンプトです。
レート制限後、新しいセッションで以下をそのまま貼ってください。

---

## プロンプト本体 (ここから下をコピー)

このリポジトリ (`C:\Users\sutec\ma-jan`) は「できるだけ強い麻雀AI」を目指す Next.js + TypeScript アプリです。前回エージェントが 1 人練習用の最小完成ラインまで実装済みです。

### まず実行

1. `AGENTS.md`, `PROJECT_STATUS.md`, `TODO.md` を読む
2. `npm install` (必要なら)
3. `npm run build` と `npm test` が通ることを確認
4. `npm run dev` でブラウザ動作確認

### あなたの仕事

`TODO.md` の **P0 セクション** を上から順に実装してください。次の 1 個を完了させてからコミットして停止しても OK ですが、可能なら複数進めてください。

`scripts/selfplay.ts` は既に動きます。`npm run selfplay -- 200` で random / simple-shanten / current の 3 エージェントを比較できます。**新しい AI ロジックを足したら必ず selfplay で agari% / tenpai% が向上したことを確認**してから commit してください。

最優先は次の 2 つです:

1. **守備 AI の最低限版**: 相手河の現銃 (genbutsu) を `evaluator.ts` の `estimateSafety` に組み込み、selfplay にダミーの "相手リーチ風河" モードを追加して放銃 (相手の待ち牌を捨てた局数) を測る。
2. **モンテカルロ探索 (1〜2 手先)**: 各打牌候補から残り山をランダムサンプルし、期待 ukeire / 和了確率を score に加える。selfplay の agari% で効果検証。

### 守るべきルール

- `AGENTS.md` を必ず守る
- AI 強化を最優先 (見た目だけ作り込まない)
- `lib/mahjong` と `lib/ai` の依存方向を逆にしない
- 終了前に `npm run build` を必ず通す
- `PROJECT_STATUS.md` / `TODO.md` を更新してから commit
- 安全停止ルール (AGENTS.md) に従い、壊れた状態で終わらない

### 過去の経緯

- 前回エージェントが Next.js + TypeScript の枠を 0 から作成
- shanten 計算 (標準/七対子/国士) と ukeire 計算が既にある
- AI 推奨は `evaluateDiscards` がスコアでランキング
- 1 人用練習画面 (`src/app/page.tsx`) で AI 推奨が画面右に出る
- `test/shanten.test.ts` で計算ロジックを最低限テスト済 (6 件 pass)

### 次々回への引き継ぎ

作業を終える前に必ず:

1. `npm run build` `npm test` 通過を確認
2. Git commit (`feat: ...` などのプレフィクス)
3. `PROJECT_STATUS.md` 更新 (新機能・壊れた機能・次の優先作業)
4. `TODO.md` 更新 (完了タスクをチェック、新タスクを追加)
5. `NEXT_PROMPT.md` を次のエージェントが再開できるように更新
