import { useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg';

interface FileDropProps {
  file: File | null;
  onChange: (file: File | null) => void;
  className: string;
  children: ReactNode;
}

// Zone de dépôt de justificatif (clic ou glisser-déposer, 5 Mo max)
export default function FileDrop({ file, onChange, className, children }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const select = (selected: File | undefined) => {
    if (!selected) return;
    if (selected.size > MAX_SIZE) {
      setError('Fichier trop volumineux (5 Mo maximum).');
      return;
    }
    setError(null);
    onChange(selected);
  };

  return (
    <>
      <div
        className={className}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          select(e.dataTransfer.files[0]);
        }}
        role="button"
        tabIndex={0}
      >
        {children}
        <input
          ref={inputRef}
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => select(e.target.files?.[0])}
          type="file"
        />
      </div>
      {file && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-300">
          <span className="flex items-center gap-1.5 truncate">
            <Icon name="attach_file" className="text-[14px] text-brand-400" />
            <span className="truncate">{file.name}</span>
          </span>
          <button
            className="text-slate-400 hover:text-rose-400 transition-colors"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            type="button"
          >
            Retirer
          </button>
        </div>
      )}
      {error && <div className="mt-1.5 text-[11px] text-rose-400">{error}</div>}
    </>
  );
}
