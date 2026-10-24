import Select from '../form/Select';

interface SelectChipProps<T extends string> {
  icon: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  prefixe?: string;
  ariaLabel: string;
}

// Sélecteur compact des en-têtes de page (même rendu que les filtres des maquettes)
export default function SelectChip<T extends string>({ icon, value, options, onChange, prefixe, ariaLabel }: SelectChipProps<T>) {
  return (
    <Select
      ariaLabel={ariaLabel}
      className="w-auto"
      icone={icon}
      largeurListe={Math.max(200, ...options.map((o) => o.label.length * 7 + 60))}
      onChange={onChange}
      options={options}
      prefixe={prefixe}
      value={value}
      variant="chip"
    />
  );
}
