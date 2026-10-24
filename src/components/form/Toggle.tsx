interface ToggleProps {
  label: string;
  aide?: string;
  valeur: boolean;
  onChange: (v: boolean) => void;
}

// Interrupteur on/off avec libellé
export default function Toggle({ label, aide, valeur, onChange }: ToggleProps) {
  return (
    <button
      aria-checked={valeur}
      className="w-full text-left flex items-start justify-between gap-4 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors focus:outline-none focus-visible:border-brand-500"
      onClick={() => onChange(!valeur)}
      role="switch"
      type="button"
    >
      <span>
        <span className="block text-xs font-medium text-slate-200">{label}</span>
        {aide && <span className="block text-[11px] text-slate-500 mt-0.5">{aide}</span>}
      </span>
      <span className={`relative inline-flex shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors ${valeur ? 'bg-brand-600' : 'bg-slate-700'}`}>
        <span className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${valeur ? 'translate-x-4' : ''}`}></span>
      </span>
    </button>
  );
}
