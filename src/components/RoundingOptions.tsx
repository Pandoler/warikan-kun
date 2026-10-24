import { NumberField } from './NumberField';
import type { Member, RemainderPolicy, RoundingUnit, SplitResult } from '../types';

const UNITS: RoundingUnit[] = [1, 10, 100, 500];

interface Props {
  roundingUnit: RoundingUnit;
  policy: RemainderPolicy;
  members: Member[];
  result: SplitResult;
  onUnitChange: (unit: RoundingUnit) => void;
  onPolicyChange: (policy: RemainderPolicy) => void;
}

function yen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

export function RoundingOptions({
  roundingUnit,
  policy,
  members,
  result,
  onUnitChange,
  onPolicyChange,
}: Props) {
  const isUp = policy.type === 'collectUp';
  const gapLabel = isUp ? '余り（おつり）' : '不足金';

  const setAllocation = (memberId: string, amount: number) =>
    onPolicyChange({ ...policy, allocations: { ...policy.allocations, [memberId]: amount } });

  return (
    <div className="rounding-options">
      <h2>⚙️ 端数の設定</h2>
      <div className="option-row">
        <label htmlFor="rounding-unit">丸め単位</label>
        <select
          id="rounding-unit"
          value={roundingUnit}
          onChange={(e) => onUnitChange(Number(e.target.value) as RoundingUnit)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u === 1 ? '1円（丸めなし）' : `${u}円単位`}
            </option>
          ))}
        </select>
      </div>
      {result.isExact ? (
        <p className="exact-note">✓ ちょうど割り切れるため、差額の処理は不要です</p>
      ) : (
        <>
          <div className="option-row">
            <label htmlFor="remainder-policy">差額の処理</label>
            <select
              id="remainder-policy"
              value={policy.type}
              // 余りの減額と不足金の上乗せは意味が逆なので、切り替えたら割り振りはリセットする
              onChange={(e) =>
                onPolicyChange({
                  type: e.target.value as RemainderPolicy['type'],
                  allocations: {},
                })
              }
            >
              <option value="collectUp">切り上げて集める</option>
              <option value="collectDown">切り捨てて集める</option>
            </select>
          </div>

          <div className="allocation">
            <div className="allocation-header">
              <span>
                {gapLabel} <strong>{yen(result.gap)}</strong>
              </span>
              <span
                className={`allocation-remaining ${
                  result.unallocated < 0
                    ? 'over'
                    : result.unallocated === 0
                      ? 'done'
                      : isUp
                        ? ''
                        : 'pending'
                }`}
              >
                {result.unallocated === 0
                  ? '割り振り済み ✓'
                  : result.unallocated > 0
                    ? `未割り振り ${yen(result.unallocated)}`
                    : `${yen(-result.unallocated)} 多すぎます`}
              </span>
            </div>
            <p className="allocation-hint">
              {isUp
                ? 'おつりを受け取るメンバーに金額を入れると、その分支払額が減ります。割り振らなかった分は余りとして残ります。'
                : '不足金を負担するメンバーに金額を入れると、その分支払額に上乗せされます。全額を割り振ってください。'}
            </p>
            {members.map((m) => (
              <div className="allocation-row" key={m.id}>
                <span className="allocation-name">{m.name}</span>
                <span className="allocation-sign">{isUp ? '−' : '+'}</span>
                <NumberField
                  value={policy.allocations[m.id] ?? 0}
                  integer
                  blankWhenZero
                  step={roundingUnit}
                  placeholder="0"
                  aria-label={`${m.name} に割り振る${gapLabel}`}
                  onChange={(amount) => setAllocation(m.id, amount)}
                />
                <span className="unit">円</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
