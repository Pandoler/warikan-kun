/** メンバーの支払い方法 */
export type PaymentMode =
  | { type: 'weight'; weight: number } // 倍率按分（均等割りは全員 weight=1）
  | { type: 'fixed'; amount: number }; // 金額直接指定

export interface Member {
  id: string;
  name: string;
  mode: PaymentMode;
  /** 表示用。プリセット選択時に weight へ推奨倍率が入る */
  rolePreset?: string;
}

export type RoundingUnit = 1 | 10 | 100 | 500;

/** メンバー id → 割り振る金額（円）。記載のないメンバーは 0 */
export type Allocations = Record<string, number>;

/**
 * 丸め差額の処理方法。
 * - collectUp: 全員切り上げ。生じた余り（お釣り）を allocations の額だけ各メンバーから減額する。
 *   割り振らなかった分は余りとして残す。
 * - collectDown: 全員切り捨て。生じた不足金を allocations の額だけ各メンバーに上乗せする。
 *   不足のままでは会計できないため、割り振り切れていなければ警告する。
 */
export type RemainderPolicy =
  | { type: 'collectUp'; allocations: Allocations }
  | { type: 'collectDown'; allocations: Allocations };

export interface SplitInput {
  total: number;
  members: Member[];
  roundingUnit: RoundingUnit;
  remainderPolicy: RemainderPolicy;
}

export interface Payment {
  memberId: string;
  /** 割り振り反映後の支払額 */
  amount: number;
  /** 割り振りによる増減（collectUp は負、collectDown は正、なしは 0） */
  adjustment: number;
}

export interface SplitResult {
  payments: Payment[];
  /** 集金合計 */
  collected: number;
  /** 集金合計 − 総額（正なら余り、負なら不足） */
  surplus: number;
  /** 丸めで生じた差額（collectUp なら余り、collectDown なら不足金）。割り振り前の値 */
  gap: number;
  /** まだ割り振られていない差額。負なら割り振りすぎ */
  unallocated: number;
  /**
   * ちょうど割り切れて端数が出ないか。
   * true のとき、どの RemainderPolicy を選んでも支払額は変わらない。
   */
  isExact: boolean;
  warnings: string[];
}
