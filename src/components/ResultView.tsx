import { useState } from 'react';
import type { Member, SplitResult } from '../types';

interface Props {
  total: number;
  members: Member[];
  result: SplitResult;
}

function yen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

function modeLabel(member: Member): string {
  if (member.mode.type === 'fixed') return '固定';
  return `${member.mode.weight}x`;
}

/** 割り振りによる増減の表示。余りの受け取りは「おつり」、不足金の負担は「不足分」 */
function adjustmentLabel(adjustment: number): string {
  return adjustment < 0 ? `おつり −${yen(-adjustment)}` : `不足分 +${yen(adjustment)}`;
}

function buildCopyText(total: number, members: Member[], result: SplitResult): string {
  const lines = [`【割り勘結果】合計 ${yen(total)}`];
  for (const p of result.payments) {
    const m = members.find((mem) => mem.id === p.memberId);
    if (!m) continue;
    const notes = [modeLabel(m)];
    if (p.adjustment !== 0) notes.push(adjustmentLabel(p.adjustment));
    lines.push(`${m.name}: ${yen(p.amount)} (${notes.join(', ')})`);
  }
  lines.push(`集金合計: ${yen(result.collected)}`);
  if (result.surplus > 0) lines.push(`余り: ${yen(result.surplus)}`);
  if (result.surplus < 0) lines.push(`不足: ${yen(-result.surplus)}`);
  return lines.join('\n');
}

export function ResultView({ total, members, result }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(buildCopyText(total, members, result));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="result-view">
      <h2>📋 結果</h2>
      {result.warnings.length > 0 && (
        <ul className="warnings">
          {result.warnings.map((w) => (
            <li key={w}>⚠️ {w}</li>
          ))}
        </ul>
      )}
      <ul className="payments">
        {result.payments.map((p) => {
          const m = members.find((mem) => mem.id === p.memberId);
          if (!m) return null;
          return (
            <li key={p.memberId} className={p.amount < 0 ? 'negative' : ''}>
              <span className="payment-name">{m.name}</span>
              {p.adjustment !== 0 && (
                <span className={`payment-adjust ${p.adjustment < 0 ? 'down' : 'up'}`}>
                  {adjustmentLabel(p.adjustment)}
                </span>
              )}
              <span className="payment-mode">{modeLabel(m)}</span>
              <span className="payment-amount">{yen(p.amount)}</span>
            </li>
          );
        })}
      </ul>
      <div className="result-summary">
        <div className="summary-row">
          <span>集金合計</span>
          <span>{yen(result.collected)}</span>
        </div>
        <div className="summary-row">
          <span>総額</span>
          <span>{yen(total)}</span>
        </div>
        {result.surplus !== 0 && (
          <div className={`summary-row surplus ${result.surplus < 0 ? 'negative' : ''}`}>
            <span>{result.surplus > 0 ? '余り（お釣り）' : '不足'}</span>
            <span>{yen(Math.abs(result.surplus))}</span>
          </div>
        )}
        {result.surplus === 0 && total > 0 && (
          <div className="summary-row ok">
            <span>総額ピッタリ ✓</span>
            <span />
          </div>
        )}
      </div>
      <button type="button" className="btn-copy" onClick={copy}>
        {copied ? 'コピーしました ✓' : '結果をコピー'}
      </button>
    </div>
  );
}
