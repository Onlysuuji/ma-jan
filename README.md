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

外部Web画面の読み取り:

```bash
python3 -m pip install -r python/screen_reader/requirements.txt
cp python/screen_reader/config.example.yml python/screen_reader/config.yml
python3 python/screen_reader/reader.py --config python/screen_reader/config.yml
```

`config.yml` の固定座標と `python/screen_reader/templates/` の牌画像を対象サイトに合わせると、画面上の「外部読み取り」タブにAI推奨が表示されます。テンプレートは通常34種に加えて、赤5を使うサイトでは `0m.png`, `0p.png`, `0s.png` も置けます。

AI ベンチ:

```bash
npm run selfplay -- 50 42
npm run tournament -- 40 42
```

`tournament` は同じ山 seed を4席ローテーションして、席順・配牌ブレを抑えた4人 no-call ベンチを出します。

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
# 4人対戦サイトの使い方 (2026-05-06)

`npm run dev` で起動し、ブラウザで `http://localhost:3000` を開いてください。画面上部の `4人対戦` タブから、4人対戦の最小版を使えます。

- 初期状態は自分だけ `人間 + AI推奨`、他3人は `AI自動`
- 各席の切り替えで、敵も味方も `人間 + AI推奨` / `AI自動` を変更可能
- `人間 + AI推奨` の席では、推奨牌を見ながら手牌クリックまたは `推奨で打つ` で打牌
- `AIを進める` でAI席の手番をまとめて進行
- 現状は no-call の4人対戦です。鳴き、連荘、本場、供託などは今後の拡張対象です。
