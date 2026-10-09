export const STAGES = ['Applied', 'Screen', 'Interview', 'Offer', 'Closed'] as const;

export type Stage = (typeof STAGES)[number];

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}
