interface TabFilterProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export default function TabFilter<T extends string>({ options, value, onChange }: TabFilterProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) =>
        opt.value === value ? (
          <button
            key={opt.value}
            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-brand-600 text-white shadow-sm"
            type="button"
          >
            {opt.label}
          </button>
        ) : (
          <button
            key={opt.value}
            className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            onClick={() => onChange(opt.value)}
            type="button"
          >
            {opt.label}
          </button>
        ),
      )}
    </div>
  );
}
