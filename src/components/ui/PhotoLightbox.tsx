import Icon from './Icon';
import Modal from './Modal';

interface PhotoLightboxProps {
  photo: { src: string; legende: string } | null;
  onClose: () => void;
}

export default function PhotoLightbox({ photo, onClose }: PhotoLightboxProps) {
  return (
    <Modal open={photo !== null} onClose={onClose} overlayClassName="bg-black/80">
      {photo && (
        <div className="bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-w-md w-full">
          <img alt={photo.legende} className="w-full aspect-[4/3] object-cover bg-black" src={photo.src} />
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-300">{photo.legende}</span>
            <button className="text-slate-400 hover:text-white transition-colors" onClick={onClose} type="button" aria-label="Fermer">
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Miniature cliquable de la photo de pointage */
export function PhotoMiniature({ src, legende, onOpen }: { src: string | null; legende: string; onOpen: (p: { src: string; legende: string }) => void }) {
  if (!src)
    return (
      <span className="w-8 h-8 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500" title="Aucune photo (terminal biométrique ou régularisation)">
        <Icon name="no_photography" className="text-[15px]" />
      </span>
    );
  return (
    <button className="block" onClick={() => onOpen({ src, legende })} type="button" title="Agrandir la photo">
      <img alt={legende} className="w-8 h-8 rounded-md object-cover border border-slate-700 hover:border-brand-500 transition-colors" src={src} />
    </button>
  );
}
