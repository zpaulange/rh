import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';

interface CameraCaptureProps {
  photo: string | null;
  onCapture: (dataUrl: string | null) => void;
}

const LARGEUR = 320;
const HAUTEUR = 240;

// Capture photo du collaborateur au moment du pointage (preuve de présence)
export default function CameraCapture({ photo, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [erreur, setErreur] = useState('');

  const arreter = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const demarrer = useCallback(async () => {
    setEtat('chargement');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("La caméra n'est pas disponible sur ce navigateur.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      // La caméra est prête dès que le flux a des dimensions ; play() n'est pas attendu
      // car sa promesse peut rester en suspens sur certains navigateurs mobiles.
      const pret = () => setEtat('pret');
      if (video.readyState >= 1) pret();
      else video.addEventListener('loadedmetadata', pret, { once: true });
      video.play().catch(() => undefined);
    } catch (e) {
      const nom = e instanceof DOMException ? e.name : '';
      setErreur(
        nom === 'NotAllowedError'
          ? "Accès à la caméra refusé. Autorisez la caméra dans le navigateur puis réessayez."
          : nom === 'NotFoundError'
            ? 'Aucune caméra détectée sur cet appareil.'
            : e instanceof Error
              ? e.message
              : 'Caméra indisponible.',
      );
      setEtat('erreur');
    }
  }, []);

  useEffect(() => {
    if (!photo) void demarrer();
    return arreter;
  }, [photo, demarrer, arreter]);

  const capturer = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = LARGEUR;
    canvas.height = HAUTEUR;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Recadrage centré au format 4:3, image miroir comme l'aperçu
    const ratio = Math.min(video.videoWidth / LARGEUR, video.videoHeight / HAUTEUR);
    const sw = LARGEUR * ratio;
    const sh = HAUTEUR * ratio;
    ctx.translate(LARGEUR, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, LARGEUR, HAUTEUR);
    arreter();
    onCapture(canvas.toDataURL('image/jpeg', 0.7));
  };

  if (photo) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-black aspect-[4/3]">
        <img alt="Photo de pointage" className="w-full h-full object-cover" src={photo} />
        <button
          className="absolute bottom-2 right-2 px-2.5 py-1.5 rounded-lg bg-black/70 text-xs text-white flex items-center gap-1.5 hover:bg-black/90 transition-colors"
          onClick={() => onCapture(null)}
          type="button"
        >
          <Icon name="refresh" className="text-[15px]" />
          Reprendre
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-black aspect-[4/3] flex items-center justify-center">
      <video ref={videoRef} className={`w-full h-full object-cover -scale-x-100 ${etat === 'pret' ? '' : 'hidden'}`} muted playsInline />
      {etat === 'chargement' && (
        <div className="flex flex-col items-center gap-2 text-xs text-slate-400">
          <Icon name="photo_camera" className="text-[28px] animate-pulse" />
          Activation de la caméra…
        </div>
      )}
      {etat === 'erreur' && (
        <div className="flex flex-col items-center gap-2 px-6 text-center text-xs text-rose-300">
          <Icon name="no_photography" className="text-[28px]" />
          <span>{erreur}</span>
          <button
            className="mt-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors"
            onClick={() => void demarrer()}
            type="button"
          >
            Réessayer
          </button>
        </div>
      )}
      {etat === 'pret' && (
        <button
          className="absolute bottom-3 left-1/2 -translate-x-1/2 h-10 px-4 rounded-full bg-white text-slate-900 text-xs font-semibold flex items-center gap-2 shadow-lg hover:bg-slate-100 transition-colors"
          onClick={capturer}
          type="button"
        >
          <Icon name="photo_camera" className="text-[18px]" />
          Prendre la photo
        </button>
      )}
    </div>
  );
}
