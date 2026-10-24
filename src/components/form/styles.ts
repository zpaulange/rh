// Variantes visuelles des champs, reprises des maquettes :
// - modal  : formulaires des modales employé (#182234, texte xs)
// - profil : modale « Modifier mes coordonnées » (slate-950, texte sm, focus bleu)
// - sombre : recherches et encadrés (#111827)
// - login  : écran de connexion (h-12, arrondi xl)
// - chip   : sélecteurs compacts des en-têtes de page
export type ChampVariant = 'modal' | 'profil' | 'sombre' | 'login' | 'chip';

export const BOITE: Record<ChampVariant, string> = {
  modal: 'bg-[#182234] border border-slate-700 rounded-lg text-xs text-white focus-within:border-brand-500',
  profil: 'bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus-within:border-blue-500',
  sombre: 'bg-[#111827] border border-slate-700 rounded-lg text-xs text-white focus-within:border-brand-500',
  login: 'h-12 bg-[#1e293b] border border-slate-700 rounded-xl text-sm text-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
  chip: 'bg-[#182234] border border-slate-800 rounded-lg text-xs font-medium text-slate-200 hover:border-slate-700 focus-within:border-brand-500',
};

export const REMPLISSAGE: Record<ChampVariant, string> = {
  modal: 'px-3 py-2',
  profil: 'px-3 py-2',
  sombre: 'px-3 py-2',
  login: 'px-4',
  chip: 'px-3 py-1.5',
};

export const ERREUR_BOITE = '!border-rose-500/70';
export const DESACTIVE = 'opacity-60 cursor-not-allowed';

/** Styles d'étiquette des maquettes */
export const LABEL = {
  modal: 'block text-xs font-medium text-slate-300 mb-1.5',
  modalClair: 'block text-xs font-medium text-slate-200 mb-1.5',
  majuscules: 'block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5',
  majusculesDiscret: 'block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5',
} as const;
