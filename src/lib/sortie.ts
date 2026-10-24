import { BAREME_LICENCIEMENT, BAREME_RETRAITE, MOTIFS_SORTIE, PAIE } from '../config/paie';
import type { Database, Employe, ExecutionPreavis, LignePaie, MotifSortie, RubriqueRupture } from '../types';
import { droitAnnuel, soldeConges } from './conges';
import { allaitementEnCours, materniteProtegee } from './maternite';
import { salaireMensuel, situationAu, tauxAncienneteAu } from './paie';
import { ajouterJours, ajouterMois, dateCourte, dernierDuMois, ecartJours, moisComplets, moisDe } from './time';

// Sortie du salarié : Code du travail (CT) art. 41 à 56, 62, 163, 165, 225 ; CCGT 2005 art. 30 à 37, 82 ;
// fiscalité des indemnités : CGI art. 119, 120 et 126.

export interface SaisieSortie {
  motif: MotifSortie;
  dateNotification: string;
  /** Dernier jour sous contrat */
  dateSortie: string;
  preavis: ExecutionPreavis;
  /** Jours de liberté non utilisés à la demande de l'employeur (CT art. 54) */
  joursLiberteNonUtilises?: number;
}

export interface CalculSortie {
  salaireMoyen: number;
  /** Nombre de mois de paie versés retenus pour la moyenne (0 = salaire mensuel du contrat) */
  moisReference: number;
  ancienneteAnnees: number;
  age: number;
  dateFinPreavis: string | null;
  joursPreavisNonEffectues: number;
  joursCongesRestants: number;
  allocationJour: number;
  rubriques: RubriqueRupture[];
  montantDuParSalarie: number;
  alertes: string[];
  total: number;
}

const arrondi = (n: number) => Math.round(n);
const nombre1 = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n)).replace(/\u202f/g, '\u00a0')} F`;

/** Fin du préavis légal (CT art. 53, CCGT art. 31) : 15 jours, 1 mois ou 3 mois selon la catégorie, à compter de la notification */
export function finPreavis(e: Employe, notification: string): string {
  if (e.categorie === 'occasionnel') return ajouterJours(notification, PAIE.preavisJours.occasionnel);
  return ajouterMois(notification, e.categorie === 'maitrise_cadre' ? 3 : 1);
}

/** Durée du préavis exprimée en mois de salaire (base des indemnités) */
const moisDePreavis = (e: Employe) => (e.categorie === 'occasionnel' ? 0.5 : e.categorie === 'maitrise_cadre' ? 3 : 1);

/**
 * Salaire global mensuel moyen des douze mois d'activité précédant la sortie (CCGT art. 36) :
 * toutes les prestations contrepartie du travail, hors remboursements de frais et indemnités de rupture.
 */
export function salaireGlobalMoyen(db: Database, e: Employe, dateSortie: string): { moyenne: number; mois: number } {
  const moisSortie = moisDe(dateSortie);
  const debut = moisDe(ajouterJours(`${moisSortie}-01`, -365));
  const lignes: LignePaie[] = db.campagnesPaie
    .filter((c) => c.statut === 'payee' && c.mois >= debut && c.mois < moisSortie)
    .flatMap((c) => c.lignes.filter((l) => l.employeId === e.id));
  const gains = (l: LignePaie) =>
    l.brut - l.primesFixes.filter((p) => p.remboursementFrais).reduce((t, p) => t + p.montant, 0) - (l.indemnitesRupture ?? []).reduce((t, r) => t + r.montant, 0);
  if (lignes.length) return { moyenne: arrondi(lignes.reduce((t, l) => t + gains(l), 0) / lignes.length), mois: lignes.length };
  const s = situationAu(db, { ...e, dateSortie: null }, dateSortie);
  return { moyenne: s ? arrondi(salaireMensuel(s, tauxAncienneteAu(e, dateSortie))) : 0, mois: 0 };
}

/** Ancienneté en années, fractions comprises (CCGT art. 36 : « il doit être tenu compte des fractions d'années ») */
export const ancienneteAnnees = (e: Employe, dateSortie: string): number => Math.max(0, ecartJours(e.dateEmbauche, ajouterJours(dateSortie, 1)) / 365);

/** Indemnité de licenciement selon le barème par tranches d'ancienneté (CCGT art. 36) */
export function indemniteLicenciement(salaireMoyen: number, annees: number, collectif: boolean): number {
  if (annees < 1) return 0;
  let total = 0;
  let plancher = 0;
  for (const [plafond, taux] of collectif ? BAREME_LICENCIEMENT.collectif : BAREME_LICENCIEMENT.individuel) {
    if (annees <= plancher) break;
    total += (Math.min(annees, plafond) - plancher) * taux * salaireMoyen;
    plancher = plafond;
  }
  return arrondi(total);
}

/** Taux de l'indemnité de départ à la retraite en % de l'indemnité de licenciement (CCGT art. 82) */
export function tauxRetraite(age: number, annees: number): number {
  const ligne = [...BAREME_RETRAITE].reverse().find((l) => age >= l.age) ?? BAREME_RETRAITE[0];
  const colonne = annees > 30 ? 3 : annees > 20 ? 2 : annees > 15 ? 1 : 0;
  return ligne.taux[colonne];
}

/** Calcul complet des droits de sortie (simulation ou enregistrement) */
export function calculerSortie(db: Database, employe: Employe, saisie: SaisieSortie, aujourdhui: string): CalculSortie {
  const regle = MOTIFS_SORTIE[saisie.motif];
  const e: Employe = { ...employe, dateSortie: saisie.dateSortie };
  const { moyenne: salaireMoyen, mois: moisReference } = salaireGlobalMoyen(db, employe, saisie.dateSortie);
  const annees = ancienneteAnnees(employe, saisie.dateSortie);
  const age = Math.floor(moisComplets(employe.dateNaissance, saisie.dateSortie) / 12);
  const rubriques: RubriqueRupture[] = [];
  const alertes: string[] = [];
  let montantDuParSalarie = 0;

  if (saisie.dateSortie < employe.dateEmbauche) alertes.push("La date de sortie précède la date d'embauche.");
  if (saisie.dateNotification > saisie.dateSortie) alertes.push('La notification doit précéder ou coïncider avec la date de sortie.');
  if (saisie.motif === 'demission_maternite' && (employe.civilite !== 'Mme' || (!materniteProtegee(db, employe.id, ajouterJours(saisie.dateNotification, -280), saisie.dateNotification) && !allaitementEnCours(db, employe, saisie.dateNotification))))
    alertes.push('Motif réservé à une salariée en état de grossesse médicalement constaté ou en période d’allaitement (CT art. 170 et 173) : conservez le certificat médical.');
  if ((saisie.motif === 'fin_cdd' || saisie.motif === 'rupture_cdd_accord') && employe.contrat === 'CDI')
    alertes.push('Ce motif concerne un contrat à durée déterminée ; le collaborateur est en CDI.');

  // ----- Préavis (CT art. 53 à 55, CCGT art. 31 à 33)
  let dateFinPreavis: string | null = null;
  let joursPreavisNonEffectues = 0;
  if (regle.preavis) {
    dateFinPreavis = finPreavis(employe, saisie.dateNotification);
    const dureeTotale = Math.max(1, ecartJours(saisie.dateNotification, dateFinPreavis));
    joursPreavisNonEffectues = Math.max(0, ecartJours(saisie.dateSortie, dateFinPreavis));
    const montantPreavis = arrondi((salaireMoyen * moisDePreavis(employe) * joursPreavisNonEffectues) / dureeTotale);
    if (saisie.preavis === 'effectue' && joursPreavisNonEffectues > 0)
      alertes.push(`Préavis effectué : la sortie devrait intervenir le ${dateCourte(dateFinPreavis)} au plus tôt (fin du préavis).`);
    if (saisie.preavis === 'dispense_employeur' && montantPreavis > 0)
      rubriques.push({
        code: 'preavis',
        libelle: 'Indemnité compensatrice de préavis',
        calcul: `${joursPreavisNonEffectues} j non effectués sur ${dureeTotale} j de préavis × ${fcfa(salaireMoyen)} × ${nombre1(moisDePreavis(employe))} mois`,
        montant: montantPreavis,
        soumisCnss: true,
        soumisIts: true,
        exceptionnelle: true,
        abattement25: false,
        reference: 'CT art. 55, CCGT art. 32',
      });
    if (saisie.preavis === 'non_effectue_salarie') montantDuParSalarie += montantPreavis;
    // Jours de liberté (2 par semaine) non pris à la demande de l'employeur : indemnité supplémentaire (CT art. 54)
    const joursLiberte = saisie.preavis === 'effectue' ? Math.max(0, saisie.joursLiberteNonUtilises ?? 0) : 0;
    const maxLiberte = Math.floor((ecartJours(saisie.dateNotification, saisie.dateSortie) + 1) / 7) * 2 + 2;
    if (joursLiberte > maxLiberte) alertes.push(`Au plus ${maxLiberte} jours de liberté sur la durée du préavis (2 par semaine).`);
    if (joursLiberte > 0)
      rubriques.push({
        code: 'liberte',
        libelle: 'Indemnité de jours de liberté non utilisés',
        calcul: `${Math.min(joursLiberte, maxLiberte)} j × ${fcfa(salaireMoyen / 26)} (salaire journalier)`,
        montant: arrondi((Math.min(joursLiberte, maxLiberte) * salaireMoyen) / 26),
        soumisCnss: true,
        soumisIts: true,
        exceptionnelle: true,
        abattement25: false,
        reference: 'CT art. 54, CCGT art. 31',
      });

    // Rupture notifiée moins de 15 jours francs avant un départ en congé, ou pendant le congé (CCGT art. 33)
    const conge = db.conges.find(
      (c) =>
        c.employeId === employe.id &&
        c.type === 'conge_paye' &&
        c.statut === 'approuve' &&
        ((c.debut <= saisie.dateNotification && saisie.dateNotification <= c.fin) || (c.debut > saisie.dateNotification && ecartJours(saisie.dateNotification, c.debut) <= 15)),
    );
    if (conge) {
      const majoration = arrondi(salaireMoyen * moisDePreavis(employe));
      if (regle.initiative === 'employeur')
        rubriques.push({
          code: 'majoration_conge',
          libelle: 'Majoration de l’indemnité de préavis (rupture liée au congé)',
          calcul: `Notification le ${dateCourte(saisie.dateNotification)}, congé du ${dateCourte(conge.debut)} : + ${nombre1(moisDePreavis(employe))} mois`,
          montant: majoration,
          soumisCnss: true,
          soumisIts: true,
          exceptionnelle: true,
          abattement25: false,
          reference: 'CCGT art. 33',
        });
      else montantDuParSalarie += majoration;
    }
  } else if (saisie.preavis !== 'sans_objet') alertes.push('Aucun préavis n’est prévu pour ce motif de sortie.');

  // ----- Indemnité compensatrice de congés payés non pris (CT art. 163), allocation au moins égale au 1/12 (art. 165)
  const lendemainMois = ajouterJours(dernierDuMois(moisDe(saisie.dateSortie)), 1);
  const solde = soldeConges(db, e, lendemainMois, aujourdhui < lendemainMois ? aujourdhui : lendemainMois);
  const joursCongesRestants = Math.max(0, Math.round(solde.periodes.reduce((t, pe) => t + pe.restant, 0) * 10) / 10);
  const droit = droitAnnuel(db, employe, saisie.dateSortie);
  const situation = situationAu(db, { ...employe, dateSortie: null }, saisie.dateSortie);
  const maintienJour = situation ? salaireMensuel(situation, tauxAncienneteAu(employe, saisie.dateSortie)) / 26 : 0;
  const allocationJour = Math.max(salaireMoyen / droit, maintienJour);
  if (solde.periodes.some((pe) => pe.restant < 0)) alertes.push('Des congés ont été pris par anticipation au-delà des droits acquis : aucune retenue n’est opérée.');
  if (joursCongesRestants > 0)
    rubriques.push({
      code: 'conges',
      libelle: 'Indemnité compensatrice de congés payés',
      calcul: `${nombre1(joursCongesRestants)} j ouvrables × ${fcfa(allocationJour)} (1/12 des gains ou maintien du salaire, le plus favorable)`,
      montant: arrondi(joursCongesRestants * allocationJour),
      soumisCnss: true,
      soumisIts: true,
      exceptionnelle: true,
      abattement25: false,
      reference: 'CT art. 163 et 165',
    });

  // ----- Indemnités conventionnelles de rupture
  const licInd = indemniteLicenciement(salaireMoyen, annees, false);
  if (regle.indemnite === 'licenciement' || regle.indemnite === 'licenciement_collectif') {
    const collectif = regle.indemnite === 'licenciement_collectif';
    const montant = indemniteLicenciement(salaireMoyen, annees, collectif);
    if (montant > 0)
      rubriques.push({
        code: 'licenciement',
        libelle: `Indemnité de licenciement${collectif ? ' (collectif)' : ''}`,
        calcul: `${nombre1(annees)} an(s) × ${collectif ? '35 / 40 / 45' : '30 / 35 / 40'} % de ${fcfa(salaireMoyen)} par tranche`,
        montant,
        soumisCnss: false,
        soumisIts: false,
        exceptionnelle: false,
        abattement25: false,
        reference: 'CCGT art. 36, CGI art. 120',
      });
    else alertes.push("Moins d'un an d'ancienneté : pas d'indemnité de licenciement (CCGT art. 36).");
  }
  if (regle.indemnite === 'maladie') {
    const montant = annees >= 1 ? Math.max(licInd, salaireMoyen) : salaireMoyen;
    rubriques.push({
      code: 'maladie',
      libelle: 'Indemnité de rupture pour maladie',
      calcul: annees >= 1 ? `Indemnité de licenciement (${fcfa(licInd)}), au moins un mois de salaire` : "Moins d'un an : un mois de salaire",
      montant: arrondi(montant),
      soumisCnss: false,
      soumisIts: false,
      exceptionnelle: false,
      abattement25: false,
      reference: 'CCGT art. 34',
    });
  }
  if (regle.indemnite === 'retraite') {
    const taux = tauxRetraite(age, annees);
    const montant = Math.max(arrondi(licInd * taux), 3 * salaireMoyen);
    if (age < 50) alertes.push(`Âge au départ : ${age} ans. Le barème conventionnel commence à 50 ans ; vérifiez l'âge légal de la retraite.`);
    rubriques.push({
      code: 'retraite',
      libelle: 'Indemnité de départ à la retraite',
      calcul: `${Math.round(taux * 1000) / 10} % de l'indemnité de licenciement (${fcfa(licInd)}), âge ${age} ans, ${nombre1(annees)} an(s) ; minimum 3 mois de salaire`,
      montant,
      soumisCnss: false,
      soumisIts: true,
      exceptionnelle: true,
      abattement25: true,
      reference: 'CCGT art. 82 ; CGI art. 119 et 126 (abattement 25 %)',
    });
  }
  if (regle.indemnite === 'deces') {
    if (annees >= 1) {
      const base = situation?.salaireBase ?? 0;
      const abondement = Math.min(annees, 6) * base;
      rubriques.push({
        code: 'deces',
        libelle: 'Capital décès versé aux héritiers',
        calcul: `Indemnité de licenciement (${fcfa(licInd)}) + ${nombre1(Math.min(annees, 6))} mois de salaire de base (6 mois maximum)`,
        montant: arrondi(licInd + abondement),
        soumisCnss: false,
        soumisIts: false,
        exceptionnelle: false,
        abattement25: false,
        reference: 'CCGT art. 37',
      });
    } else alertes.push("Moins d'un an d'ancienneté : pas de capital décès conventionnel (CCGT art. 37).");
  }

  return {
    salaireMoyen,
    moisReference,
    ancienneteAnnees: Math.round(annees * 100) / 100,
    age,
    dateFinPreavis,
    joursPreavisNonEffectues,
    joursCongesRestants,
    allocationJour: arrondi(allocationJour),
    rubriques,
    montantDuParSalarie,
    alertes,
    total: rubriques.reduce((t, r) => t + r.montant, 0),
  };
}
