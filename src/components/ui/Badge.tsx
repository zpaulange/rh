import type { ReactNode } from 'react';
import Icon from './Icon';

export type Tone = 'emerald' | 'amber' | 'brand' | 'slate' | 'rose' | 'brandStrong';

export const TONE: Record<Tone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  brand: 'bg-brand-500/10 text-brand-400 border border-brand-500/20',
  brandStrong: 'bg-brand-500/20 text-brand-300 border border-brand-500/30',
  slate: 'bg-slate-800 text-slate-300 border border-slate-700',
  rose: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
};

interface BadgeProps {
  tone: Tone;
  children: ReactNode;
  icon?: string;
  size?: 'xs' | 'sm';
}

export default function Badge({ tone, children, icon, size = 'sm' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium whitespace-nowrap ${
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${TONE[tone]}`}
    >
      {icon && <Icon name={icon} className="text-[13px]" />}
      {children}
    </span>
  );
}
