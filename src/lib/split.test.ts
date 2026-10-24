import { describe, expect, it } from 'vitest';
import { computeSplit } from './split';
import type { Allocations, Member, RemainderPolicy, RoundingUnit } from '../types';

function weightMember(id: string, weight: number, name = id): Member {
  return { id, name, mode: { type: 'weight', weight } };
}

function fixedMember(id: string, amount: number, name = id): Member {
  return { id, name, mode: { type: 'fixed', amount } };
}

/** 切り上げて集める */
const up = (allocations: Allocations = {}): RemainderPolicy => ({ type: 'collectUp', allocations });
/** 切り捨てて集める */
const down = (allocations: Allocations = {}): RemainderPolicy => ({
  type: 'collectDown',
  allocations,
});

function split(
  total: number,
  members: Member[],
  roundingUnit: RoundingUnit = 1,
  remainderPolicy: RemainderPolicy = up(),
) {
  return computeSplit({ total, members, roundingUnit, remainderPolicy });
}

function amounts(result: ReturnType<typeof computeSplit>): number[] {
  return result.payments.map((p) => p.amount);
}

const three = () => [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)];

describe('均等割り', () => {
  it('割り切れる場合は全員同額', () => {
    const r = split(30000, [weightMember('a', 1), weightMember('b', 1), weightMember('c', 1)]);
    expect(amounts(r)).toEqual([10000, 10000, 10000]);
    expect(r.collected).toBe(30000);
    expect(r.surplus).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('メンバー1人なら全額', () => {
    const r = split(5000, [weightMember('a', 1)]);
    expect(amounts(r)).toEqual([5000]);
  });

  it('総額0なら全員0円', () => {
    const r = split(0, [weightMember('a', 1), weightMember('b', 1)]);
    expect(amounts(r)).toEqual([0, 0]);
    expect(r.warnings).toEqual([]);
  });
});

describe('傾斜割り', () => {
  it('倍率比で按分される', () => {
    const r = split(30000, [
      weightMember('boss', 1.5),
      weightMember('peer', 1),
      weightMember('junior', 0.5),
    ]);
    expect(amounts(r)).toEqual([15000, 10000, 5000]);
  });

  it('倍率0のメンバーは0円', () => {
    const r = split(20000, [weightMember('a', 1), weightMember('kanji', 0)]);
    expect(amounts(r)).toEqual([20000, 0]);
  });
});

describe('固定額との組み合わせ', () => {
  it('固定額を差し引いた残額を按分する', () => {
    const r = split(30000, [
      fixedMember('boss', 10000),
      weightMember('a', 1),
      weightMember('b', 1),
    ]);
    expect(amounts(r)).toEqual([10000, 10000, 10000]);
  });

  it('固定額 + 傾斜の混在', () => {
    const r = split(25000, [
      fixedMember('boss', 10000),
      weightMember('senior', 1.5),
      weightMember('junior', 0.5),
    ]);
    expect(amounts(r)).toEqual([10000, 11250, 3750]);
  });

  it('固定額が総額を超えると警告し、倍率メンバーは0円', () => {
    const r = split(30000, [fixedMember('boss', 40000), weightMember('a', 1)]);
    expect(amounts(r)).toEqual([40000, 0]);
    expect(r.surplus).toBe(10000);
    expect(r.warnings).toContain('固定額の合計が総額を超えています');
  });
});

describe('切り上げて集める（collectUp）', () => {
  it('全員切り上げ、割り振らなければ余りとして残る', () => {
    const r = split(10000, three(), 100, up());
    expect(amounts(r)).toEqual([3400, 3400, 3400]);
    expect(r.gap).toBe(200);
    expect(r.unallocated).toBe(200);
    expect(r.surplus).toBe(200);
    // 余りは割り振らなくてもよい（幹事の取り分・次回に回す運用）
    expect(r.warnings).toEqual([]);
  });

  it('余りを1人に割り振ると、その人の支払額が減る', () => {
    const r = split(10000, three(), 100, up({ kanji: 200 }));
    expect(amounts(r)).toEqual([3200, 3400, 3400]);
    expect(r.payments[0].adjustment).toBe(-200);
    expect(r.unallocated).toBe(0);
    expect(r.collected).toBe(10000);
    expect(r.surplus).toBe(0);
  });

  it('余りを複数人に任意の金額で割り振れる', () => {
    const r = split(10000, three(), 100, up({ kanji: 100, b: 100 }));
    expect(amounts(r)).toEqual([3300, 3300, 3400]);
    expect(r.payments.map((p) => p.adjustment)).toEqual([-100, -100, 0]);
    expect(r.surplus).toBe(0);
  });

  it('一部だけ割り振ると、残りは余りとして残る', () => {
    const r = split(10000, three(), 100, up({ kanji: 100 }));
    expect(r.unallocated).toBe(100);
    expect(r.surplus).toBe(100);
    expect(r.warnings).toEqual([]);
  });

  it('余りより多く割り振ると警告する', () => {
    const r = split(10000, three(), 100, up({ kanji: 300 }));
    expect(r.unallocated).toBe(-100);
    expect(r.surplus).toBe(-100);
    expect(r.warnings).toContain('割り振りが 100円 多すぎます');
  });

  it('割り切れる金額は切り上げで増えない（浮動小数点誤差の防止）', () => {
    const r = split(
      6000,
      [weightMember('a', 1.2), weightMember('b', 1.2), weightMember('c', 1.2)],
      100,
      up(),
    );
    expect(amounts(r)).toEqual([2000, 2000, 2000]);
    expect(r.gap).toBe(0);
    expect(r.surplus).toBe(0);
  });
});

describe('切り捨てて集める（collectDown）', () => {
  it('全員切り捨て、不足金を表示する', () => {
    const r = split(11000, three(), 100, down());
    // raw 3666.67 → 3600 に切り捨て、不足 200
    expect(amounts(r)).toEqual([3600, 3600, 3600]);
    expect(r.gap).toBe(200);
    expect(r.unallocated).toBe(200);
    expect(r.surplus).toBe(-200);
  });

  it('不足金が割り振られていなければ警告する', () => {
    const r = split(11000, three(), 100, down());
    expect(r.warnings).toContain('不足金があと 200円 割り振られていません');
  });

  it('不足金を1人に割り振ると、その人の支払額に上乗せされる', () => {
    const r = split(11000, three(), 100, down({ kanji: 200 }));
    expect(amounts(r)).toEqual([3800, 3600, 3600]);
    expect(r.payments[0].adjustment).toBe(200);
    expect(r.collected).toBe(11000);
    expect(r.surplus).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('不足金を複数人に任意の金額で割り振れる', () => {
    const r = split(11000, three(), 100, down({ kanji: 100, c: 100 }));
    expect(amounts(r)).toEqual([3700, 3600, 3700]);
    expect(r.surplus).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('一部だけ割り振ると、残りの不足を警告する', () => {
    const r = split(11000, three(), 100, down({ kanji: 100 }));
    expect(r.unallocated).toBe(100);
    expect(r.warnings).toContain('不足金があと 100円 割り振られていません');
  });

  it('不足金より多く割り振ると警告する', () => {
    const r = split(11000, three(), 100, down({ kanji: 300 }));
    expect(r.unallocated).toBe(-100);
    expect(r.surplus).toBe(100);
    expect(r.warnings).toContain('割り振りが 100円 多すぎます');
  });

  it('割り振りを受けないメンバーの支払額は理論値を超えない', () => {
    for (const total of [10000, 11000, 12345, 30300, 33333]) {
      const r = split(total, three(), 100, down());
      for (const p of r.payments) {
        expect(p.amount).toBeLessThanOrEqual(total / 3);
      }
    }
  });

  it('500円単位でも全額割り振れば総額ちょうどになる', () => {
    const r = split(10000, three(), 500, down({ kanji: 1000 }));
    // raw 3333.33 → 3000 に切り捨て、不足 1000
    expect(amounts(r)).toEqual([4000, 3000, 3000]);
    expect(r.collected).toBe(10000);
  });

  it('傾斜 + 固定額の組み合わせで割り切れるなら不足なし', () => {
    const r = split(
      25000,
      [fixedMember('boss', 10000), weightMember('kanji', 1), weightMember('junior', 0.5)],
      500,
      down(),
    );
    expect(amounts(r)).toEqual([10000, 10000, 5000]);
    expect(r.gap).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('全員倍率0でも、残額を割り振れば負担させられる', () => {
    const r = split(10000, [weightMember('kanji', 0), weightMember('b', 0)], 100, down({ kanji: 10000 }));
    expect(amounts(r)).toEqual([10000, 0]);
    expect(r.warnings).toEqual([]);
  });
});

describe('割り振りの共通仕様', () => {
  it('固定額メンバーにも割り振れる', () => {
    const ms = [fixedMember('boss', 5000), weightMember('a', 1), weightMember('b', 1)];
    // 残 6100 → 3050 ずつ → 切り捨てで 3000、不足 100 を固定額の boss が負担
    const r = split(11100, ms, 100, down({ boss: 100 }));
    expect(r.gap).toBe(100);
    expect(amounts(r)).toEqual([5100, 3000, 3000]);
  });

  it('存在しないメンバーへの割り振りは無視する（削除済みメンバー）', () => {
    const r = split(11000, three(), 100, down({ removed: 200 }));
    expect(r.unallocated).toBe(200);
    expect(r.collected).toBe(10800);
  });

  it('負の割り振りは 0 として扱う', () => {
    const r = split(11000, three(), 100, down({ kanji: -500 }));
    expect(r.payments[0].adjustment).toBe(0);
    expect(r.unallocated).toBe(200);
  });

  it('割り振りで支払額がマイナスになると警告する', () => {
    const r = split(400, [weightMember('a', 1), weightMember('b', 1)], 500, up({ a: 600 }));
    expect(amounts(r)[0]).toBe(-100);
    expect(r.warnings).toContain('a の支払額がマイナスになっています');
  });
});

describe('isExact（端数が出ないかの判定）', () => {
  it('割り切れる場合は true', () => {
    expect(split(30000, three(), 100).isExact).toBe(true);
  });

  it('端数が出る場合は false', () => {
    expect(split(10000, three(), 100).isExact).toBe(false);
  });

  it('丸め単位を変えると判定も変わる', () => {
    // 1人 3400 円。100円単位なら割り切れるが、500円単位だと端数が出る
    expect(split(10200, three(), 100).isExact).toBe(true);
    expect(split(10200, three(), 500).isExact).toBe(false);
  });

  it('選んだモードや割り振りに関係なく同じ判定になる', () => {
    for (const p of [up(), down(), up({ kanji: 100 }), down({ b: 100 })]) {
      expect(split(30000, three(), 100, p).isExact).toBe(true);
      expect(split(10000, three(), 100, p).isExact).toBe(false);
    }
  });

  it('isExact が true のとき、どちらのモードでも支払額は同じ', () => {
    expect(amounts(split(30000, three(), 100, up()))).toEqual(
      amounts(split(30000, three(), 100, down())),
    );
  });

  it('傾斜割りでも、全員の理論値が丸め単位ちょうどなら true', () => {
    const ms = [weightMember('a', 1.5), weightMember('b', 1), weightMember('c', 0.5)];
    expect(split(30000, ms, 100).isExact).toBe(true);
  });

  it('傾斜割りで一部の理論値に端数が出れば false', () => {
    const ms = [weightMember('a', 2), weightMember('b', 1)];
    expect(split(10000, ms, 100).isExact).toBe(false);
  });

  it('固定額を差し引いた残りが割り切れれば true', () => {
    const ms = [fixedMember('boss', 10000), weightMember('a', 1), weightMember('b', 1)];
    expect(split(30000, ms, 100).isExact).toBe(true);
  });

  it('固定額が総額を超える場合は false', () => {
    const ms = [fixedMember('boss', 40000), weightMember('a', 1)];
    expect(split(30000, ms, 100).isExact).toBe(false);
  });

  it('全員固定額で合計が総額と一致すれば true', () => {
    const ms = [fixedMember('a', 10000), fixedMember('b', 5000)];
    expect(split(15000, ms, 100).isExact).toBe(true);
  });

  it('負担者がいないのに残額がある場合は false', () => {
    const ms = [weightMember('a', 0), weightMember('b', 0)];
    expect(split(10000, ms, 100).isExact).toBe(false);
  });

  it('総額 0 は端数なし扱い', () => {
    expect(split(0, three(), 100).isExact).toBe(true);
  });
});

describe('エッジケース', () => {
  it('切り上げで全員倍率0・残額ありなら警告する', () => {
    const r = split(10000, [weightMember('a', 0), weightMember('b', 0)], 100, up());
    expect(amounts(r)).toEqual([0, 0]);
    expect(r.warnings).toContain('残額を負担するメンバーがいません');
  });

  it('全員固定額で合計が一致すれば警告なし', () => {
    const r = split(15000, [fixedMember('a', 10000), fixedMember('b', 5000)]);
    expect(amounts(r)).toEqual([10000, 5000]);
    expect(r.surplus).toBe(0);
    expect(r.warnings).toEqual([]);
  });
});
