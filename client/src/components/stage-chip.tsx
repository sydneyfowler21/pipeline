import type { Stage } from '@pipeline/shared';
import { Archive, BadgeCheck, Phone, Send, Users, type LucideIcon } from 'lucide-react';

const ICONS: Record<Stage, LucideIcon> = {
  Applied: Send,
  Screen: Phone,
  Interview: Users,
  Offer: BadgeCheck,
  Closed: Archive,
};

export function StageChip({ stage }: { stage: Stage }) {
  const Icon = ICONS[stage];
  return (
    <span className={`chip st-${stage}`}>
      <Icon aria-hidden className="h-[13px] w-[13px]" strokeWidth={2.25} />
      {stage}
    </span>
  );
}

export function StageDot({ stage }: { stage: Stage }) {
  return <span aria-hidden className={`dot dot-${stage}`} />;
}
