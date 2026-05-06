# 麻雀AIトレーナー (ma-jan)

Next.js + TypeScript 製の、できるだけ強い麻雀AIを目指すブラウザ麻雀アプリです。
1 人用の手牌練習画面で、現在局面で AI が推奨する打牌・受け入れ・候補比較・理由を表示します。

## 起動

```bash
npm install
npm run dev   # http://localhost:3000 を開く
```

ビルド:

```bash
npm run build
```

テスト:

```bash
npm test
```

AI ベンチ:

```bash
npm run selfplay -- 50 42
npm run tournament -- 40 42
```

## 画面でできること

- 13 枚の手牌が配られ、ツモ牌が 1 枚増えて 14 枚
- 任意の牌をクリックすると打牌 → 自動で次のツモ
- 「AI の推奨で打つ」を押すとおすすめ牌を自動打牌
- 右パネルに以下が表示されます:
  - おすすめアクション (打牌 / リーチ + 打牌)
  - 攻撃 / バランス / 守備 タグ
  - シャンテン推移
  - 受け入れ枚数 / 種類
  - 期待打点 (han 数)
  - 各候補の評価値とランキング
  - 候補ごとの自然言語の理由
  - 受け入れ牌の一覧と残り枚数

## ディレクトリ

```
src/
  app/                    Next.js App Router (画面)
  components/             Tile / Hand / River / GameInfo / AIPanel
  lib/
    mahjong/              types, tiles, wall, shanten, ukeire, score, match, win, yaku
    ai/                   evaluator, defense, 4人対戦用 agents
    game/                 1人練習用ステート (trainer)
test/                     Node test runner のテスト
scripts/                  自己対戦・4人対戦ベンチ
python/                   学習・分析スクリプト置き場 (今後)
```

詳細は [`AGENTS.md`](./AGENTS.md), [`PROJECT_STATUS.md`](./PROJECT_STATUS.md), [`TODO.md`](./TODO.md) を参照。
