interface AvatarProps {
  prenom: string;
  nom: string;
  url?: string;
  size?: 'sm' | 'md' | 'lg';
}

const TAILLES = { sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-xs', lg: 'w-14 h-14 text-base' };

export default function Avatar({ prenom, nom, url, size = 'md' }: AvatarProps) {
  const classes = `${TAILLES[size]} rounded-full border border-slate-700 shrink-0`;
  if (url) return <img alt={`${prenom} ${nom}`} className={`${classes} object-cover`} src={url} />;
  return (
    <div className={`${classes} bg-slate-800 flex items-center justify-center font-semibold text-slate-200`}>
      {`${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase()}
    </div>
  );
}
