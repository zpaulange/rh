import { AVANTAGES_NATURE, PAIE } from '../config/paie';
import type { CampagnePaie, Database, ElementVariable, Employe, HeuresSup, LignePaie, PrimeFixe, SituationContractuelle } from '../types';
import { droitAnnuel } from './conges';
import { sousContrat } from './contrat';
import { ensembleFeries, jourFerie } from './feries';
import { congeCouvrant, decompteHeuresSup, dureeConge, estEnRetard, statutJour } from './rules';
import { ajouterJours, ajouterMois, dernierDuMois, jourSemaine, joursOuvresEntre, moisComplets, moisDe } from './time';

const arrondi = (n: number) => Math.round(n);

/* ================= Situation contractuelle ================= */

/** Situation (poste, salaire, primes) en vigueur pour un collaborateur à une date donnée */
export function situationAu(db: Database, employe: Employe, key: string): SituationContractuelle | null {
  if (!sousContrat(employe, key)) return null;
  const evolutions = db.evolutions
    .filter((e) => e.employeId === employe.id && e.dateEffet <= key)
    .sort((a, b) => a.dateEffet.localeCompare(b.dateEffet) || a.dateDecision.localeCompare(b.dateDecision));
  const derniere = evolutions[evolutions.length - 1];
  if (derniere) return derniere.apres;
  return { poste: employe.poste, departement: employe.departement, salaireBase: employe.salaireBase, primesFixes: employe.primesFixes };
}

/** Situation actuelle d'après le dossier */
export const situationActuelle = (e: Employe): SituationContractuelle => ({
  poste: e.poste,
  departement: e.departement,
  salaireBase: e.salaireBase,
  primesFixes: e.primesFixes,
});

/* ================= Avantages en nature ================= */

/** Valeur mensuelle forfaitaire des avantages en nature d'un collaborateur (CGI art. 123-3) */
export function avantagesNatureMensuels(e: Pick<Employe, 'avantagesNature' | 'dirigeant'>, salaireBase: number): { code: Employe['avantagesNature'][number]; libelle: string; montant: number }[] {
  return e.avantagesNature.map((code) => {
    const b = AVANTAGES_NATURE[code];
    return { code, libelle: b.libelle, montant: arrondi(b.taux ? b.taux * salaireBase : e.dirigeant ? b.cadre : b.employe) };
  });
}

/* ================= SMIG ================= */

/** Salaire minimum applicable selon l'horaire du contrat (SMIG établi pour la durée légale de 40 h) ; null pour un stage */
export function smigApplicable(heuresHebdo: number, contrat: Employe['contrat']): number | null {
  if (contrat === 'Stage') return null;
  return Math.ceil((PAIE.smig * Math.min(heuresHebdo, PAIE.dureeLegaleHebdo)) / PAIE.dureeLegaleHebdo);
}

/** Erreur si le salaire de base est inférieur au SMIG (CT art. 210, CCGT art. 61) */
export function controleSmig(salaireBase: number, heuresHebdo: number, contrat: Employe['contrat']): string | null {
  const minimum = smigApplicable(heuresHebdo, contrat);
  if (minimum === null || salaireBase >= minimum) return null;
  return `Salaire inférieur au SMIG : ${fcfa(minimum)} minimum pour ${heuresHebdo} h par semaine (CT art. 210).`;
}

/* ================= Impôt ================= */

/** Arrondis de liquidation (CGI art. 514) : base au millier de francs inférieur, montant dû à la dizaine la plus proche */
export const arrondiBaseFiscale = (base: number): number => Math.floor(Math.max(0, base) / 1000) * 1000;
export const arrondiDizaine = (montant: number): number => Math.round(montant / 10) * 10;

/** ITS mensuel selon le barème progressif (CGI art. 125), base arrondie au millier inférieur */
export function calculerIts(base: number): number {
  const b = arrondiBaseFiscale(base);
  let impot = 0;
  let plancher = 0;
  for (const [plafond, taux] of PAIE.baremeIts) {
    if (b <= plancher) break;
    impot += (Math.min(b, plafond) - plancher) * taux;
    plancher = plafond;
  }
  return arrondiDizaine(impot);
}

/** VPS : même base que l'ITS (CGI art. 193), 4 % (art. 194) */
export const calculerVps = (base: number): number => arrondiDizaine(arrondiBaseFiscale(base) * PAIE.tauxVps);

/** Redevance ORTB due sur la paie du mois (CGI art. 125-2) */
export function redevanceOrtb(mois: string, baseIts: number): number {
  const m = mois.slice(5, 7);
  if (m === '03') return PAIE.redevanceOrtb.mars;
  if (m === '06') return arrondiBaseFiscale(baseIts) > PAIE.baremeIts[0][0] ? PAIE.redevanceOrtb.juin : 0;
  return 0;
}

/** Base ITS moyenne des douze derniers mois payés (CGI art. 126-3-a) ; null si aucune paie */
function salaireMoyenImposable(db: Database, employeId: string, mois: string): number | null {
  const debut = moisDe(ajouterJours(`${mois}-01`, -365));
  const lignes = db.campagnesPaie
    .filter((c) => c.statut === 'payee' && c.mois >= debut && c.mois < mois)
    .flatMap((c) => c.lignes.filter((l) => l.employeId === employeId));
  return lignes.length ? lignes.reduce((t, l) => t + l.baseIts, 0) / lignes.length : null;
}

/* ================= Heures supplémentaires ================= */

export interface RubriqueHeures {
  libelle: string;
  minutes: number;
  majoration: number;
  montant: number;
}

/** Rubriques du bulletin pour les heures complémentaires et supplémentaires (CT art. 147, CCGT art. 66) */
export function rubriquesHeuresSup(h: Omit<HeuresSup, 'montant'>, tauxHoraire: number): RubriqueHeures[] {
  const m = PAIE.majorations;
  const pct = (x: number) => `+${Math.round(x * 100)} %`;
  return (
    [
      ['Heures complémentaires (jusqu’à 40 h)', h.minutesComplementaires, 0],
      [`Heures supplémentaires 41e à 48e h ${pct(m.premieres)}`, h.minutes12, m.premieres],
      [`Heures supplémentaires au-delà de 48 h ${pct(m.suivantes)}`, h.minutes35, m.suivantes],
      [`Heures supplémentaires de nuit ${pct(m.nuit)}`, h.minutesNuit, m.nuit],
      [`Heures de jour, dimanche ou férié ${pct(m.dimancheFerie)}`, h.minutesDimancheFerie, m.dimancheFerie],
      [`Heures de nuit, dimanche ou férié ${pct(m.dimancheFerieNuit)}`, h.minutesDimancheFerieNuit, m.dimancheFerieNuit],
    ] as [string, number, number][]
  )
    .filter(([, minutes]) => minutes > 0)
    .map(([libelle, minutes, majoration]) => ({ libelle, minutes, majoration, montant: arrondi((minutes / 60) * tauxHoraire * (1 + majoration)) }));
}

/** Heures du mois : semaines entières dont le dimanche tombe dans le mois (CCGT art. 66) */
function heuresSupMois(db: Database, employe: Employe, mois: string, tauxHoraire: number): HeuresSup {
  const { total: _total, ...d } = decompteHeuresSup(db, employe, (dimanche) => moisDe(dimanche) === mois);
  return { ...d, montant: rubriquesHeuresSup(d, tauxHoraire).reduce((t, r) => t + r.montant, 0) };
}

/* ================= Ligne de paie ================= */

export interface OptionsCalcul {
  /** Ignore pointages et absences (historique antérieur à la mise en service du pointage) */
  sansPointages?: boolean;
  elements?: ElementVariable[];
  todayKey: string;
}

/** Prime d'ancienneté applicable à une date (CCGT art. 65) */
export const tauxAncienneteAu = (employe: Employe, key: string): number => PAIE.tauxAnciennete(Math.floor(moisComplets(employe.dateEmbauche, key) / 12));

/** Salaire mensuel servant au taux horaire et aux maintiens : base + ancienneté + primes de nature salariale (hors frais) */
export function salaireMensuel(s: SituationContractuelle, tauxAnciennete: number): number {
  return s.salaireBase * (1 + tauxAnciennete / 100) + s.primesFixes.filter((p) => !p.remboursementFrais).reduce((t, p) => t + p.montant, 0);
}

/**
 * Taux de maintien du salaire pour un jour de maladie (Code du travail art. 38, CCGT art. 23) :
 *  - moins de 12 mois de service : 100 % pendant la durée du préavis de sa catégorie ;
 *  - plus de 12 mois : 100 % pendant 3 mois puis 50 % pendant 3 mois ;
 *  - plus de 5 ans : 100 % pendant 6 mois.
 * Les jours se cumulent sur l'année civile ; aucun délai de carence n'est prévu.
 */
export function tauxMaintienMaladie(employe: Employe, jour: string, rangDansAnnee: number): number {
  const mois = moisComplets(employe.dateEmbauche, jour);
  let plein: number;
  let demi = 0;
  if (mois < 12) plein = PAIE.preavisJours[employe.categorie];
  else if (mois > 60) plein = 180;
  else {
    plein = 90;
    demi = 90;
  }
  if (rangDansAnnee <= plein) return 1;
  if (rangDansAnnee <= plein + demi) return 0.5;
  return 0;
}

/** Calcule la ligne de paie d'un collaborateur pour un mois ; null s'il n'était pas sous contrat */
export function calculerLignePaie(db: Database, employe: Employe, mois: string, options: OptionsCalcul): LignePaie | null {
  const debut = `${mois}-01`;
  const fin = dernierDuMois(mois);
  // Situation au dernier jour sous contrat du mois (fin de mois, ou date de sortie)
  const finContrat = employe.dateSortie && employe.dateSortie < fin ? employe.dateSortie : fin;
  const situationFin = situationAu(db, employe, finContrat);
  if (!situationFin) return null;
  const params = db.parametres;
  const feries = ensembleFeries(params);

  // Salaire de base et primes fixes au prorata des jours calendaires sous contrat (changements en cours de mois gérés)
  const jours: string[] = [];
  for (let k = debut; k <= fin; k = ajouterJours(k, 1)) jours.push(k);
  let base = 0;
  let joursContrat = 0;
  const primesCumul = new Map<string, PrimeFixe>();
  for (const k of jours) {
    const s = situationAu(db, employe, k);
    if (!s) continue;
    joursContrat += 1;
    base += s.salaireBase / jours.length;
    for (const p of s.primesFixes) {
      const cumul = primesCumul.get(p.libelle) ?? { ...p, montant: 0 };
      cumul.montant += p.montant / jours.length;
      Object.assign(cumul, { soumisCnss: p.soumisCnss, soumisIts: p.soumisIts, remboursementFrais: p.remboursementFrais });
      primesCumul.set(p.libelle, cumul);
    }
  }
  const primesFixes = [...primesCumul.values()].map((p) => ({ ...p, montant: arrondi(p.montant) })).filter((p) => p.montant > 0);
  const salaireBase = arrondi(base);

  // Avantages en nature au forfait mensuel, au prorata des jours sous contrat (CGI art. 123)
  const fractionContrat = joursContrat / jours.length;
  const avantagesNature = avantagesNatureMensuels(employe, situationFin.salaireBase)
    .map((a) => ({ ...a, montant: arrondi(a.montant * fractionContrat) }))
    .filter((a) => a.montant > 0);
  const totalAvantages = avantagesNature.reduce((t, a) => t + a.montant, 0);

  // Prime d'ancienneté (CCGT art. 65) sur le salaire de base
  const tauxAnciennete = tauxAncienneteAu(employe, finContrat);
  const primeAnciennete = arrondi((salaireBase * tauxAnciennete) / 100);
  // Taux horaire = salaire mensuel / 173,33 (CCGT art. 66)
  const tauxHoraire = salaireMensuel(situationFin, tauxAnciennete) / PAIE.diviseurHoraire;
  // Valeur d'un jour pour un jour donné : tout ce qui est versé ce jour-là (salaire, ancienneté, primes)
  const valeurMensuelle = (k: string) => {
    const s = situationAu(db, employe, k);
    return s ? s.salaireBase * (1 + tauxAncienneteAu(employe, k) / 100) + s.primesFixes.reduce((t, p) => t + p.montant, 0) : 0;
  };

  const ouvres = joursOuvresEntre(debut, fin).filter((k) => sousContrat(employe, k));
  const joursOuvresMois = joursOuvresEntre(debut, fin).length;
  const joursFeries = ouvres.filter((k) => jourFerie(params, k)).length;

  // Absences injustifiées et congés sans solde : aucun salaire n'est dû (CT art. 209, CCGT art. 61)
  let joursAbsence = 0;
  let joursSansSolde = 0;
  let retenueAbsences = 0;
  if (!options.sansPointages) {
    for (const k of ouvres) {
      if (k >= options.todayKey || k < params.dateDebutPointage || jourFerie(params, k)) continue;
      const conge = congeCouvrant(db, employe.id, k);
      const sansSolde = conge?.type === 'sans_solde';
      const absent = !sansSolde && statutJour(db, employe.id, k, options.todayKey, new Date()) === 'absent';
      if (!sansSolde && !absent) continue;
      if (sansSolde) joursSansSolde += 1;
      else joursAbsence += 1;
      retenueAbsences += valeurMensuelle(k) / joursOuvresMois;
    }
  }

  // Maladie : maintien du salaire selon l'ancienneté, cumulé sur l'année civile (CT art. 38, CCGT art. 23)
  const annee = mois.slice(0, 4);
  const joursMaladieAnnee: string[] = [];
  db.conges
    .filter((c) => c.employeId === employe.id && c.type === 'maladie' && c.statut === 'approuve' && c.fin >= `${annee}-01-01` && c.debut <= fin)
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .forEach((c) => {
      for (let k = c.debut < `${annee}-01-01` ? `${annee}-01-01` : c.debut; k <= c.fin; k = ajouterJours(k, 1)) joursMaladieAnnee.push(k);
    });
  let joursMaladie = 0;
  let joursMaladieDemiTraitement = 0;
  let joursMaladieNonIndemnises = 0;
  let retenueMaladie = 0;
  joursMaladieAnnee.forEach((k, i) => {
    if (moisDe(k) !== mois || !sousContrat(employe, k)) return;
    joursMaladie += 1;
    const taux = tauxMaintienMaladie(employe, k, i + 1);
    if (taux === 0.5) joursMaladieDemiTraitement += 1;
    if (taux === 0) joursMaladieNonIndemnises += 1;
    retenueMaladie += ((1 - taux) * valeurMensuelle(k)) / jours.length;
  });

  // Congé de maternité : salaire intégral (CT art. 170), jours calendaires du mois sous contrat
  const joursMaternite = jours.filter((k) => sousContrat(employe, k) && db.conges.some((c) => c.employeId === employe.id && c.type === 'maternite' && c.statut === 'approuve' && c.debut <= k && k <= c.fin)).length;

  // Congés payés : allocation au moins égale au 1/12 des salaires et indemnités des 12 mois précédents (CT art. 165, CCGT art. 52).
  // Le salaire est maintenu ; un complément est versé si l'allocation du douzième lui est supérieure.
  const joursCongePaye = db.conges
    .filter((c) => c.employeId === employe.id && c.type === 'conge_paye' && c.statut === 'approuve' && c.debut <= fin && c.fin >= debut)
    .reduce(
      (t, c) =>
        t +
        dureeConge(c.debut < debut ? debut : c.debut, c.fin > fin ? fin : c.fin, c.debut < debut ? 'matin' : c.debutPeriode, c.fin > fin ? 'fin' : c.finPeriode, feries),
      0,
    );
  let complementAllocationConge = 0;
  if (joursCongePaye > 0) {
    const debutReference = moisDe(ajouterJours(`${mois}-01`, -365));
    const historique = db.campagnesPaie
      .filter((c) => c.statut === 'payee' && c.mois >= debutReference && c.mois < mois)
      .flatMap((c) => c.lignes.filter((l) => l.employeId === employe.id));
    const gains = (l: LignePaie) => l.brut - l.primesFixes.filter((p) => p.remboursementFrais).reduce((t, p) => t + p.montant, 0) - l.complementAllocationConge;
    const moyenne = historique.length ? historique.reduce((t, l) => t + gains(l), 0) / historique.length : salaireMensuel(situationFin, tauxAnciennete);
    const droit = droitAnnuel(db, employe, finContrat);
    const allocationJour = moyenne / droit; // 1/12 des gains annuels pour le congé annuel complet
    const joursOuvrablesMois = jours.filter((k) => jourSemaine(k) !== 0 && !feries.has(k)).length;
    const maintienJour = salaireMensuel(situationFin, tauxAnciennete) / joursOuvrablesMois;
    complementAllocationConge = arrondi(Math.max(0, joursCongePaye * (allocationJour - maintienJour)));
  }

  const heuresSup = options.sansPointages
    ? { minutes12: 0, minutes35: 0, minutesNuit: 0, minutesDimancheFerie: 0, minutesDimancheFerieNuit: 0, minutesComplementaires: 0, montant: 0 }
    : heuresSupMois(db, employe, mois, arrondi(tauxHoraire)) // taux affiché sur le bulletin;
  const elements = options.elements ?? [];
  const primesVariables = elements.filter((e) => e.nature === 'prime');
  const autresRetenues = elements.filter((e) => e.nature === 'retenue').reduce((t, e) => t + e.montant, 0);

  const retenueAbs = arrondi(retenueAbsences);
  const retenueMal = arrondi(retenueMaladie);
  // Indemnités de rupture : versées avec la paie du mois de sortie (calculées lors de l'enregistrement de la sortie)
  const sortie = db.sorties.find((x) => x.employeId === employe.id && x.statut !== 'annulee' && moisDe(x.dateSortie) === mois);
  const indemnitesRupture = sortie ? sortie.rubriques.map((r) => ({ ...r })) : [];
  const brut = Math.max(
    0,
    salaireBase +
      primeAnciennete +
      primesFixes.reduce((t, p) => t + p.montant, 0) +
      heuresSup.montant +
      complementAllocationConge +
      primesVariables.reduce((t, p) => t + p.montant, 0) +
      indemnitesRupture.reduce((t, r) => t + r.montant, 0) +
      totalAvantages -
      retenueAbs -
      retenueMal,
  );
  // Deux assiettes distinctes : une prime peut être soumise à la CNSS sans l'être à l'ITS, et inversement
  const primesTous = [...primesFixes, ...primesVariables, ...indemnitesRupture];
  const horsCnss = primesTous.filter((p) => !p.soumisCnss).reduce((t, p) => t + p.montant, 0);
  const horsIts = primesTous.filter((p) => !p.soumisIts).reduce((t, p) => t + p.montant, 0);
  const brutCotisable = Math.max(0, brut - horsCnss - (PAIE.avantagesNatureSoumisCnss ? 0 : totalAvantages));
  const brutImposable = Math.max(0, brut - horsIts);
  const cnssSalariale = arrondi(brutCotisable * PAIE.tauxCnssSalarial);
  // ITS sur le brut imposable, sans déduction de la CNSS (CGI art. 122)
  const baseIts = arrondiBaseFiscale(brutImposable);
  // Rémunérations exceptionnelles (préavis, congés payés de rupture, fin de carrière) : atténuation de l'art. 126 du CGI
  const exceptionnelles = indemnitesRupture.filter((r) => r.exceptionnelle && r.soumisIts);
  let its = calculerIts(baseIts);
  if (exceptionnelles.length) {
    const brutExceptionnel = exceptionnelles.reduce((t, r) => t + r.montant, 0);
    const exceptionnelAbattu = exceptionnelles.reduce((t, r) => t + r.montant * (r.abattement25 ? 0.75 : 1), 0);
    const ordinaire = Math.max(0, brutImposable - brutExceptionnel);
    const moyenne = salaireMoyenImposable(db, employe.id, mois) ?? ordinaire;
    its = moyenne > 0 ? arrondiDizaine(calculerIts(moyenne) * ((ordinaire + exceptionnelAbattu) / moyenne)) : calculerIts(ordinaire + exceptionnelAbattu);
  }
  const redevance = redevanceOrtb(mois, baseIts);
  // Les avantages en nature, déjà fournis, sont déduits du net à verser
  const net = brut - cnssSalariale - its - redevance - autresRetenues - totalAvantages;
  const cnssPatronale = arrondi(brutCotisable * PAIE.tauxCnssPatronal);
  // VPS : exonération de 2 ans pour le premier emploi d'un salarié béninois déclaré à la CNSS (CGI art. 192-4)
  const vpsBrut = calculerVps(brutImposable);
  const finExoneration = employe.premierEmploi && /b[ée]ninois/i.test(employe.nationalite) && employe.cnss ? ajouterMois(employe.dateEmbauche, PAIE.moisExonerationPremierEmploi) : null;
  const joursExoneres = finExoneration ? jours.filter((k) => sousContrat(employe, k) && k < finExoneration).length : 0;
  const vpsExonere = joursContrat ? arrondiDizaine((vpsBrut * joursExoneres) / joursContrat) : 0;
  const vps = vpsBrut - vpsExonere;

  return {
    employeId: employe.id,
    matricule: employe.matricule,
    nom: `${employe.prenom} ${employe.nom}`,
    poste: situationFin.poste,
    departement: situationFin.departement,
    salaireReference: situationFin.salaireBase,
    tauxHoraire: arrondi(tauxHoraire),
    joursCalendaires: jours.length,
    joursContrat,
    salaireBase,
    primesFixes,
    heuresSup,
    elements,
    tauxAnciennete,
    primeAnciennete,
    joursAbsence,
    joursSansSolde,
    retenueAbsences: retenueAbs,
    joursMaladie,
    joursMaladieDemiTraitement,
    joursMaladieNonIndemnises,
    retenueMaladie: retenueMal,
    joursCongePaye,
    complementAllocationConge,
    joursMaternite,
    joursFeries,
    brut,
    brutCotisable,
    brutImposable,
    cnssSalariale,
    baseIts,
    its,
    redevanceOrtb: redevance,
    indemnitesRupture,
    avantagesNature,
    vpsExonere,
    autresRetenues,
    net,
    cnssPatronale,
    vps,
    coutEmployeur: brut + cnssPatronale + vps,
    compteBancaire: employe.compteBancaire,
    cnss: employe.cnss,
    ifu: employe.ifu,
  };
}

/** Collaborateurs à payer pour le mois (sous contrat au moins un jour du mois, sortie comprise) */
export function employesAPayer(db: Database, mois: string): Employe[] {
  const fin = dernierDuMois(mois);
  return db.employes.filter((e) => e.dateEmbauche <= fin && (!e.dateSortie || e.dateSortie >= `${mois}-01`)).sort((a, b) => a.nom.localeCompare(b.nom));
}

export interface TotauxPaie {
  effectif: number;
  brut: number;
  cnssSalariale: number;
  its: number;
  net: number;
  cnssPatronale: number;
  vps: number;
  coutEmployeur: number;
  heuresSup: number;
}

export function totaux(lignes: LignePaie[]): TotauxPaie {
  return lignes.reduce(
    (t, l) => ({
      effectif: t.effectif + 1,
      brut: t.brut + l.brut,
      cnssSalariale: t.cnssSalariale + l.cnssSalariale,
      its: t.its + l.its,
      net: t.net + l.net,
      cnssPatronale: t.cnssPatronale + l.cnssPatronale,
      vps: t.vps + l.vps,
      coutEmployeur: t.coutEmployeur + l.coutEmployeur,
      heuresSup: t.heuresSup + l.heuresSup.montant,
    }),
    { effectif: 0, brut: 0, cnssSalariale: 0, its: 0, net: 0, cnssPatronale: 0, vps: 0, coutEmployeur: 0, heuresSup: 0 },
  );
}

/** Cumuls annuels payés (pour le bulletin) jusqu'au mois inclus */
export function cumulsAnnuels(db: Database, employeId: string, mois: string) {
  const annee = mois.slice(0, 4);
  const lignes = db.campagnesPaie
    .filter((c) => c.statut === 'payee' && c.mois.startsWith(annee) && c.mois <= mois)
    .flatMap((c) => c.lignes.filter((l) => l.employeId === employeId));
  return { brut: lignes.reduce((s, l) => s + l.brut, 0), net: lignes.reduce((s, l) => s + l.net, 0), its: lignes.reduce((s, l) => s + l.its, 0), cnss: lignes.reduce((s, l) => s + l.cnssSalariale, 0) };
}

export const campagneDuMois = (db: Database, mois: string): CampagnePaie | undefined => db.campagnesPaie.find((c) => c.mois === mois);

/** Ligne de paie payée d'un collaborateur pour un mois */
export function lignePayee(db: Database, employeId: string, mois: string): { campagne: CampagnePaie; ligne: LignePaie } | null {
  const campagne = db.campagnesPaie.find((c) => c.mois === mois && c.statut === 'payee');
  const ligne = campagne?.lignes.find((l) => l.employeId === employeId);
  return campagne && ligne ? { campagne, ligne } : null;
}

export const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n)).replace(/\u202f/g, '\u00a0')} FCFA`;

/** Indicateur de retards inclus dans le récapitulatif (informatif, non retenu sur salaire) */
export const retardsDuMois = (db: Database, employeId: string, mois: string) =>
  db.pointages.filter((p) => p.employeId === employeId && moisDe(p.date) === mois && estEnRetard(p, db.parametres)).length;

/** Simulation d'un mois complet sans absence ; tauxAnciennete = prime d'ancienneté applicable (CCGT art. 65) */
export function simulerSalaire(salaireBase: number, primes: { montant: number; soumisCnss: boolean; soumisIts: boolean }[], tauxAnciennete = 0, avantages = 0) {
  // Les avantages en nature entrent dans le brut et les assiettes, puis sont déduits du net (fournis en nature)
  const brut = salaireBase + arrondi((salaireBase * tauxAnciennete) / 100) + primes.reduce((s, p) => s + p.montant, 0) + avantages;
  const brutCotisable = brut - primes.filter((p) => !p.soumisCnss).reduce((s, p) => s + p.montant, 0);
  const brutImposable = brut - primes.filter((p) => !p.soumisIts).reduce((s, p) => s + p.montant, 0);
  const cnss = Math.round(brutCotisable * PAIE.tauxCnssSalarial);
  const its = calculerIts(brutImposable);
  const cout = brut + Math.round(brutCotisable * PAIE.tauxCnssPatronal) + calculerVps(brutImposable);
  return { brut, cnss, its, net: brut - cnss - its - avantages, cout };
}

/** Mention d'exonération d'une prime : « exonérée CNSS et ITS », « exonérée ITS »… (vide si soumise aux deux) */
export function mentionExoneration(p: { soumisCnss: boolean; soumisIts: boolean }): string {
  if (!p.soumisCnss && !p.soumisIts) return 'exonérée CNSS et ITS';
  if (!p.soumisCnss) return 'exonérée CNSS';
  if (!p.soumisIts) return 'exonérée ITS';
  return '';
}
