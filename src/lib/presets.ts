export interface RolePreset {
  key: string;
  label: string;
  weight: number;
}

export const ROLE_PRESETS: readonly RolePreset[] = [
  { key: 'boss', label: '上司・目上', weight: 1.5 },
  { key: 'senior', label: '先輩', weight: 1.2 },
  { key: 'peer', label: '同僚', weight: 1.0 },
  { key: 'junior', label: '後輩', weight: 0.8 },
  { key: 'student', label: '学生・新人', weight: 0.5 },
  { key: 'kanji', label: '無料', weight: 0 },
] as const;

export function presetByKey(key: string): RolePreset | undefined {
  return ROLE_PRESETS.find((p) => p.key === key);
}
