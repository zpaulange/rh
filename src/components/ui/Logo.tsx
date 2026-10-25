import Icon from './Icon';

// Logo compact de la barre latérale
export default function Logo() {
  return (
    <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800">
      <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-sm shadow-brand-600/30">
        <Icon name="schedule" className="text-[19px]" />
      </div>
      <span className="font-display font-bold text-white text-lg tracking-tight">
        Sika<span className="text-brand-500">RH</span>
      </span>
    </div>
  );
}
