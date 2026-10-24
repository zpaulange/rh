import TextInput from './TextInput';

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  ariaLabel?: string;
}

// Champ de recherche des tableaux RH
export default function SearchInput({ value, onChange, placeholder, className, ariaLabel }: SearchInputProps) {
  return (
    <TextInput
      aria-label={ariaLabel ?? placeholder}
      className={className}
      icone="search"
      onChange={onChange}
      placeholder={placeholder}
      suffixe={
        value ? (
          <button aria-label="Effacer la recherche" className="text-slate-500 hover:text-white" onClick={() => onChange('')} type="button">
            <span className="material-symbols-outlined text-[15px]">close</span>
          </button>
        ) : undefined
      }
      type="text"
      value={value}
      variant="sombre"
    />
  );
}
