import type { ReactNode } from 'react';
import Icon from '../ui/Icon';

interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  id?: string;
}

// Case à cocher (style de l'écran de connexion)
export default function Checkbox({ checked, onChange, children, id }: CheckboxProps) {
  return (
    <button
      aria-checked={checked}
      className="flex items-center gap-2.5 cursor-pointer select-none group focus:outline-none"
      id={id}
      onClick={() => onChange(!checked)}
      role="checkbox"
      type="button"
    >
      <span
        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors group-focus-visible:ring-2 group-focus-visible:ring-blue-500/60 ${
          checked ? 'bg-blue-600 border-blue-600' : 'bg-[#1e293b] border-slate-700 group-hover:border-slate-500'
        }`}
      >
        {checked && <Icon className="text-[13px] text-white font-bold" name="check" />}
      </span>
      <span className="text-sm text-slate-300">{children}</span>
    </button>
  );
}
