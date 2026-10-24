# 割り勘アプリ 設計書

## 1. アーキテクチャ

- **React 18 + Vite + TypeScript** の SPA（静的サイト）
- 状態管理は React の `useState` / `useReducer` のみ（外部ライブラリ不要の規模）
- 計算ロジックは **UI から分離した純粋関数** として実装し、単体テストを書く（Vitest）

```
src/
├── main.tsx              # エントリポイント
├── App.tsx               # 画面全体のレイアウトと状態保持
├── components/
│   ├── TotalInput.tsx    # 合計金額入力
│   ├── MemberList.tsx    # メンバー一覧
│   ├── MemberRow.tsx     # メンバー1行（名前・役割・倍率/固定額）
│   ├── RoundingOptions.tsx # 丸め単位・差額処理の選択
│   └── ResultView.tsx    # 結果表示・テキストコピー
├── lib/
│   ├── split.ts          # 割り勘計算ロジック（純粋関数）
│   ├── split.test.ts     # 計算ロジックの単体テスト
│   └── presets.ts        # 役割プリセット定義
└── types.ts              # 型定義
```

## 2. データモデル

```typescript
/** メンバーの支払い方法 */
type PaymentMode =
  | { type: 'weight'; weight: number }   // 倍率按分（均等割りは全員 weight=1）
  | { type: 'fixed'; amount: number };   // 金額直接指定

interface Member {
  id: string;
  name: string;
  mode: PaymentMode;
  rolePreset?: RoleKey; // 表示用。選択すると weight に推奨倍率が入る
}

type RoundingUnit = 1 | 10 | 100 | 500;

/** メンバー id → 割り振る金額（円）。記載のないメンバーは 0 */
type Allocations = Record<string, number>;

/** 丸め差額の処理方法 */
type RemainderPolicy =
  | { type: 'collectUp'; allocations: Allocations }    // 全員切り上げ、余りを減額として割り振る
  | { type: 'collectDown'; allocations: Allocations }; // 全員切り捨て、不足金を上乗せとして割り振る

interface SplitInput {
  total: number;
  members: Member[];
  roundingUnit: RoundingUnit;
  remainderPolicy: RemainderPolicy;
}

interface SplitResult {
  payments: { memberId: string; amount: number; adjustment: number }[]; // adjustment = 割り振りによる増減
  collected: number;   // 集金合計
  surplus: number;     // 集金合計 − 総額（正なら余り、負なら不足）
  gap: number;         // 丸めで生じた余り / 不足金（割り振り前、0 以上）
  unallocated: number; // gap − 割り振り合計（負なら割り振りすぎ）
  isExact: boolean;    // 端数が出ないか。true なら policy を変えても結果は同じ
  warnings: string[];  // 固定額超過などの注意
}
```

### 役割プリセット（`presets.ts`）

```typescript
const ROLE_PRESETS = [
  { key: 'boss',    label: '上司・目上',  weight: 1.5 },
  { key: 'senior',  label: '先輩',        weight: 1.2 },
  { key: 'peer',    label: '同僚',        weight: 1.0 },
  { key: 'junior',  label: '後輩',        weight: 0.8 },
  { key: 'student', label: '学生・新人',  weight: 0.5 },
  { key: 'kanji',   label: '無料', weight: 0 },
] as const;
```

## 3. 計算アルゴリズム（`split.ts`）

```
1. 固定額メンバーの合計 fixedSum を求める
2. 残額 remaining = total − fixedSum
3. 倍率メンバーの weight 合計 weightSum を求める
4. 各倍率メンバーの理論値 raw = remaining × (weight / weightSum)
5. 丸め:
   - collectUp 方式: raw を丸め単位で切り上げ → gap = 丸め後合計 − total（余り）
   - collectDown 方式: raw を丸め単位で切り捨て → gap = total − 丸め後合計（不足金）
6. 割り振り:
   - 各メンバーの allocations[id]（負は 0 扱い、存在しない id は無視）を
     collectUp なら減額、collectDown なら上乗せとして支払額に反映し、adjustment に記録
   - unallocated = gap − 割り振り合計
7. 端数判定 isExact:
   - 全 raw が丸め単位の倍数（EPSILON 許容）かつ 理論上の集金合計 = total のとき true
   - true のとき丸め・差額処理はいずれも働かないため、policy によらず結果は同一
8. 検証・警告:
   - fixedSum > total → 「固定額が総額を超えています」（残額 0、倍率メンバーは 0 円）
   - unallocated < 0 → 「割り振りが ○円 多すぎます」（両方式）
   - collectDown かつ unallocated > 0 → 「不足金があと ○円 割り振られていません」
     （collectUp の未割り振りは余りとして残してよいので警告しない）
   - collectUp かつ weightSum = 0 かつ remaining > 0 → 「残額を負担するメンバーがいません」
     （collectDown ではこの残額が不足金になり、割り振りで負担させられる）
   - 支払額が負になるメンバー → 警告表示（計算はそのまま提示）
```

- 金額は**整数円**で扱う（浮動小数点の誤差を最終結果に持ち込まない。丸め前の按分のみ実数計算し、丸め時に整数化）
- 「各人を丸めてから差額を明示的に割り振る」方式のため、**必ず集金合計が検算可能**
- 割り振りを受けないメンバーは、切り上げなら理論値以上、切り捨てなら理論値以下を支払う
- 割り振りは policy の中に持たせ、処理方法の切り替え時は UI 側で `allocations: {}` にリセットする
  （減額と上乗せは意味が逆のため、引き継ぐと意図しない結果になる）
- `isExact` は policy・割り振りに依存しないため、UI 側はどの状態でも同じ判定を得られる

## 4. UI 設計（スマホファースト・1 画面）

```
┌─────────────────────────┐
│ 💰 合計金額 [  30,000 ] 円      │
├─────────────────────────┤
│ 👥 メンバー          [＋追加]   │
│ ┌─────────────────────┐ │
│ │ 田中  [上司▼] 倍率 1.5      │ │
│ │ 佐藤  [同僚▼] 倍率 1.0      │ │
│ │ 鈴木  [固定▼] 金額 5,000 円  │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ ⚙ 丸め [100円▼]  差額 [幹事が吸収▼] │
├─────────────────────────┤
│ 📋 結果                        │
│  田中: 15,000 円 (1.5x)         │
│  佐藤: 10,000 円 (1.0x)         │
│  鈴木:  5,000 円 (固定)         │
│  合計: 30,000 円 / 総額ピッタリ  │
│           [結果をコピー]        │
└─────────────────────────┘
```

- 入力のたびに結果をリアルタイム再計算（「計算」ボタンなし）
- メンバー行の役割セレクトは「プリセット or 固定額 or カスタム倍率」を切り替えるドロップダウン
- 「結果をコピー」は LINE 貼り付けを想定したプレーンテキストを生成

## 5. テスト方針

- `split.ts` に対する Vitest 単体テストを必須とする
  - 均等割り／傾斜割り／固定額混在／丸め各単位／collectUp・collectDown 両方式／割り振り（1 人・複数人・一部・過剰）
  - エッジケース: 固定額超過、weightSum=0、メンバー 1 人、総額 0、吸収者が負額
- UI は手動確認を基本とし、必要になったらコンポーネントテストを追加

## 6. デプロイ

- `vite build` の成果物を GitHub Pages に配置（`base` パス設定に注意）
- CI は任意（GitHub Actions で build + test を回す場合は後続タスクで追加）
