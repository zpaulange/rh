// Règles de calcul de la paie (Bénin).
// Sources : loi n° 98-004 du 27 janvier 1998 portant Code du travail (CT) et
// Convention collective générale du travail de 2005 (CCGT), secteurs privé et parapublic.
// Impôts sur salaires : Code général des impôts (CGI) 2025, loi n° 2021-15 mise à jour par la loi de finances 2025.
// Cotisations sociales : Caisse nationale de sécurité sociale (taux publiés au 1er janvier 2024).
// ⚠ À revoir à chaque loi de finances ; taux « risques professionnels » propre à l'entreprise (1 à 4 %) à confirmer.

import { ENTREPRISE } from './entreprise';

export const PAIE = {
  /** Cotisation CNSS salarié : vieillesse 3,6 % sur la totalité du brut, sans plafond */
  tauxCnssSalarial: 0.036,
  /** Cotisations CNSS employeur : vieillesse 6,4 % + prestations familiales 9 % + risques professionnels 1 % (1 à 4 % selon l'activité — à confirmer) */
  tauxCnssPatronal: 0.164,
  /** Versement patronal sur salaires (CGI art. 194), même base que l'ITS (art. 193) ; 2 % pour l'enseignement privé */
  tauxVps: ENTREPRISE.enseignementPrive ? 0.02 : 0.04,
  /** Exonération de VPS pendant 2 ans pour le premier emploi d'un salarié béninois déclaré à la CNSS (CGI art. 192-4) */
  moisExonerationPremierEmploi: 24,
  /** Avantages en nature soumis aux cotisations CNSS (assiette « totalité des revenus bruts ») — à confirmer */
  avantagesNatureSoumisCnss: true,
  /** Redevance ORTB ajoutée à l'ITS (CGI art. 125-2) : mars 1 000 F ; juin 3 000 F sauf revenu imposable ≤ 1re tranche */
  redevanceOrtb: { mars: 1000, juin: 3000 },
  /** Barème mensuel progressif de l'ITS sur le salaire brut, sans déduction de la CNSS (CGI art. 122 et 125) : [plafond, taux] */
  baremeIts: [
    [60_000, 0],
    [150_000, 0.1],
    [250_000, 0.15],
    [500_000, 0.19],
    [Infinity, 0.3],
  ] as [number, number][],

  /** SMIG mensuel pour 40 h hebdomadaires (CT art. 210, décret n° 2022-692 du 7 décembre 2022, en vigueur au 01/01/2023) */
  smig: 52_000,

  /** Durée légale hebdomadaire (CT art. 142) : seuil des heures supplémentaires */
  dureeLegaleHebdo: 40,
  /** Taux horaire = salaire mensuel / 173,33 (CCGT art. 66) */
  diviseurHoraire: 173.33,
  /** Heures de la 41e à la 48e majorées au premier taux (CT art. 147) */
  heuresPremiereTranche: 8,
  /** Heures de nuit : de 21 h à 5 h (CT art. 147 et 154) */
  nuitDebut: 21 * 60,
  nuitFin: 5 * 60,
  /** Majorations minimales des heures supplémentaires (CT art. 147, CCGT art. 66) */
  majorations: {
    premieres: 0.12,
    suivantes: 0.35,
    dimancheFerie: 0.5,
    nuit: 0.5,
    dimancheFerieNuit: 1,
  },

  /** Prime d'ancienneté en % du salaire de base selon les années de présence révolues (CCGT art. 65) */
  tauxAnciennete(annees: number): number {
    if (annees >= 7) return 5 + Math.min(annees, 20) - 6;
    if (annees >= 5) return 5;
    if (annees >= 3) return 3;
    return 0;
  },

  /** Durée du préavis en jours selon la catégorie (CT art. 53, CCGT art. 31) */
  preavisJours: { occasionnel: 15, execution: 30, maitrise_cadre: 90 },

  /** Mode de paiement par défaut des salaires */
  modePaiement: 'Virement bancaire',
};

/** Permissions exceptionnelles payées (CCGT art. 54) ; jours = durée maximale, null = durée des épreuves */
export const MOTIFS_PERMISSION: Record<string, { libelle: string; jours: number | null; familial: boolean }> = {
  deces_proche: { libelle: 'Décès du conjoint, du père, de la mère ou d’un enfant', jours: 3, familial: true },
  deces_famille: { libelle: 'Décès d’un frère, d’une sœur, d’un beau-parent', jours: 2, familial: true },
  mariage_travailleur: { libelle: 'Mariage du travailleur', jours: 3, familial: true },
  mariage_famille: { libelle: 'Mariage d’un enfant, d’un frère, d’une sœur', jours: 1, familial: true },
  naissance: { libelle: 'Naissance au foyer', jours: 3, familial: true },
  examen: { libelle: 'Concours ou examen utile à la carrière', jours: null, familial: false },
};

export const LIBELLE_CATEGORIE_PRO = {
  occasionnel: 'Occasionnel, saisonnier ou temporaire (préavis 15 j)',
  execution: 'Agent d’exécution : employé, ouvrier, manœuvre (préavis 1 mois)',
  maitrise_cadre: 'Agent de maîtrise, cadre et assimilé (préavis 3 mois)',
} as const;

export const LIBELLE_EVOLUTION = {
  embauche: 'Embauche',
  promotion: 'Promotion',
  augmentation: 'Augmentation de salaire',
  mutation: 'Mutation',
  reclassement: 'Reclassement',
} as const;

/**
 * Motifs de sortie et règles applicables (Code du travail art. 41 à 56, 62, 163 ; CCGT art. 30 à 37 et 82).
 *  - preavis : un préavis est dû (rupture d'un CDI à l'initiative d'une partie) ;
 *  - initiative : partie qui rompt (détermine qui doit l'indemnité de préavis non respecté) ;
 *  - indemnite : indemnité de rupture conventionnelle applicable.
 */
export const MOTIFS_SORTIE = {
  demission: { libelle: 'Démission', preavis: true, initiative: 'salarie', indemnite: null, reference: 'CT art. 44 et 53' },
  demission_maternite: { libelle: 'Démission pendant la grossesse ou l’allaitement (sans préavis)', preavis: false, initiative: 'salarie', indemnite: null, reference: 'CT art. 170 et 173' },
  licenciement: { libelle: 'Licenciement (motif personnel)', preavis: true, initiative: 'employeur', indemnite: 'licenciement', reference: 'CT art. 45 et 53, CCGT art. 36-a' },
  licenciement_economique: { libelle: 'Licenciement collectif (motif économique)', preavis: true, initiative: 'employeur', indemnite: 'licenciement_collectif', reference: 'CCGT art. 35 et 36-b' },
  faute_lourde: { libelle: 'Licenciement pour faute lourde', preavis: false, initiative: 'employeur', indemnite: null, reference: 'CT art. 55 et 56, CCGT art. 36' },
  fin_cdd: { libelle: 'Fin de contrat à durée déterminée', preavis: false, initiative: 'aucune', indemnite: null, reference: 'CT art. 41' },
  rupture_cdd_accord: { libelle: 'Rupture anticipée du CDD d’un commun accord', preavis: false, initiative: 'aucune', indemnite: null, reference: 'CT art. 42-1°' },
  rupture_essai: { libelle: 'Rupture pendant la période d’essai', preavis: false, initiative: 'aucune', indemnite: null, reference: 'CT art. 43' },
  maladie: { libelle: 'Rupture pour maladie prolongée', preavis: false, initiative: 'employeur', indemnite: 'maladie', reference: 'CCGT art. 34' },
  retraite: { libelle: 'Départ à la retraite', preavis: false, initiative: 'aucune', indemnite: 'retraite', reference: 'CCGT art. 81 et 82' },
  deces: { libelle: 'Décès du travailleur', preavis: false, initiative: 'aucune', indemnite: 'deces', reference: 'CCGT art. 37' },
} as const;

/** Indemnité de licenciement en % du salaire global mensuel moyen par année de présence (CCGT art. 36) */
export const BAREME_LICENCIEMENT = {
  individuel: [
    [5, 0.3],
    [10, 0.35],
    [Infinity, 0.4],
  ] as [number, number][],
  collectif: [
    [5, 0.35],
    [10, 0.4],
    [Infinity, 0.45],
  ] as [number, number][],
};

/** Indemnité de départ à la retraite en % de l'indemnité de licenciement, selon l'âge et l'ancienneté (CCGT art. 82) */
export const BAREME_RETRAITE: { age: number; taux: [number, number, number, number] }[] = [
  { age: 50, taux: [0.65, 0.7, 0.75, 0.8] },
  { age: 51, taux: [0.575, 0.625, 0.675, 0.725] },
  { age: 52, taux: [0.5, 0.55, 0.6, 0.65] },
  { age: 53, taux: [0.425, 0.475, 0.525, 0.575] },
  { age: 54, taux: [0.375, 0.425, 0.475, 0.525] },
  { age: 55, taux: [0.3, 0.35, 0.4, 0.45] },
];

/**
 * Avantages en nature évalués forfaitairement chaque mois (CGI art. 123-3, loi de finances 2024) :
 * barème « dirigeants et cadres supérieurs » ou « employés » ; logement et domesticité à 15 % du salaire de base.
 */
export const AVANTAGES_NATURE = {
  logement: { libelle: 'Logement', taux: 0.15, cadre: 0, employe: 0 },
  domesticite: { libelle: 'Domesticité', taux: 0.15, cadre: 0, employe: 0 },
  electricite: { libelle: 'Électricité', taux: 0, cadre: 50_000, employe: 20_000 },
  eau: { libelle: 'Eau', taux: 0, cadre: 10_000, employe: 5_000 },
  telephone: { libelle: 'Téléphone', taux: 0, cadre: 15_000, employe: 5_000 },
  nourriture: { libelle: 'Nourriture', taux: 0, cadre: 50_000, employe: 30_000 },
  vehicule_4_roues: { libelle: 'Véhicule à 4 roues', taux: 0, cadre: 30_000, employe: 15_000 },
  vehicule_2_roues: { libelle: 'Véhicule à 2 roues', taux: 0, cadre: 10_000, employe: 5_000 },
} as const;
