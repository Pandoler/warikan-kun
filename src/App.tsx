import { useMemo, useState } from 'react';
import { TotalInput } from './components/TotalInput';
import { MemberList } from './components/MemberList';
import { RoundingOptions } from './components/RoundingOptions';
import { ResultView } from './components/ResultView';
import { computeSplit } from './lib/split';
import type { Member, RemainderPolicy, RoundingUnit } from './types';

/** 初期表示のメンバー数（飲み会の標準的な人数） */
const INITIAL_MEMBER_COUNT = 5;

let nextId = 1;
function newMember(): Member {
  return { id: `m${nextId++}`, name: '', mode: { type: 'weight', weight: 1 }, rolePreset: 'peer' };
}

export default function App() {
  const [total, setTotal] = useState(0);
  const [members, setMembers] = useState<Member[]>(() =>
    Array.from({ length: INITIAL_MEMBER_COUNT }, newMember),
  );
  const [roundingUnit, setRoundingUnit] = useState<RoundingUnit>(100);
  const [policy, setPolicy] = useState<RemainderPolicy>({ type: 'collectUp', allocations: {} });

  // 名前未入力のメンバーには表示用の自動命名を与える
  const namedMembers = useMemo(
    () =>
      members.map((m, i) => ({
        ...m,
        name: m.name.trim() === '' ? `メンバー${i + 1}` : m.name.trim(),
      })),
    [members],
  );

  const result = useMemo(
    () =>
      computeSplit({
        total,
        members: namedMembers,
        roundingUnit,
        remainderPolicy: policy,
      }),
    [total, namedMembers, roundingUnit, policy],
  );

  const addMember = () => setMembers((ms) => [...ms, newMember()]);
  const updateMember = (updated: Member) =>
    setMembers((ms) => ms.map((m) => (m.id === updated.id ? updated : m)));
  const removeMember = (id: string) => setMembers((ms) => ms.filter((m) => m.id !== id));

  return (
    <div className="app">
      <header className="app-header">
        <h1>💰 割り勘くん</h1>
        <p className="tagline">均等割りも、傾斜割りも、その場でサッと。</p>
      </header>

      <section className="card">
        <TotalInput total={total} onChange={setTotal} />
      </section>

      <section className="card">
        <MemberList
          members={members}
          namedMembers={namedMembers}
          onAdd={addMember}
          onUpdate={updateMember}
          onRemove={removeMember}
        />
      </section>

      <section className="card">
        <RoundingOptions
          roundingUnit={roundingUnit}
          policy={policy}
          members={namedMembers}
          result={result}
          onUnitChange={setRoundingUnit}
          onPolicyChange={setPolicy}
        />
      </section>

      <section className="card">
        <ResultView total={total} members={namedMembers} result={result} />
      </section>
    </div>
  );
}
