// Test d'intégration du client de l'API (src/db/api.ts) contre le backend démarré en mode DEMO.
// Chaque action du frontend est appelée exactement comme le font les écrans, avec les rôles employé, RH et administrateur.
// Usage : npm run test:api   (API=http://localhost:4000 par défaut)
// La base de démonstration est réinitialisée au début : ne jamais lancer contre une base de production.

import * as api from '../src/db/api';
import { definirEtat, getDB } from '../src/db/store';
import type { Database, Employe, User } from '../src/types';

const BASE = process.env.API ?? 'http://localhost:4000';

/* ---------- Navigateur simulé : un cookie de session par utilisateur ---------- */

const cookies = new Map<string, string>();
let session = 'anonyme';
const fetchNatif = globalThis.fetch;
globalThis.fetch = async (entree: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof entree === 'string' && entree.startsWith('/') ? BASE + entree : entree;
  const entetes = new Headers(init.headers);
  const cookie = cookies.get(session);
  if (cookie) entetes.set('Cookie', cookie);
  const res = await fetchNatif(url, { ...init, headers: entetes });
  const pose = /sikarh_session=([^;]*)/.exec(res.headers.get('set-cookie') ?? '');
  if (pose) cookies.set(session, `sikarh_session=${pose[1]}`);
  return res;
};

const U = {} as User; // ignoré : le serveur utilise l'utilisateur de la session

async function connecter(nom: string, email: string, motDePasse: string): Promise<Database> {
  session = nom;
  const r = await api.connexion(email, motDePasse, false);
  definirEtat(r.etat);
  return getDB();
}
/** Bascule vers un utilisateur déjà connecté et recharge sa vue */
async function utiliser(nom: string): Promise<Database> {
  session = nom;
  await api.rafraichirEtat();
  return getDB();
}

/* ---------- Résultats ---------- */

let total = 0;
const echecs: string[] = [];
const appelees = new Set<string>();
function ok(condition: boolean, message: string): void {
  total += 1;
  if (!condition) echecs.push(message);
  console.log(`${condition ? '✔' : '✘'} ${message}`);
}
/** Appelle une action ; un échec est consigné avec le message du serveur, sans interrompre la suite */
async function etape<T>(action: string, message: string, appel: () => Promise<T>): Promise<T | undefined> {
  appelees.add(action);
  try {
    const r = await appel();
    ok(true, `${action} — ${message}`);
    return r;
  } catch (err) {
    ok(false, `${action} — ${message} : ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}
/** L'action doit être refusée (règle métier ou droit) */
async function refus(action: string, message: string, appel: () => Promise<unknown>, attendu: RegExp): Promise<void> {
  appelees.add(action);
  try {
    await appel();
    ok(false, `${action} — ${message} : accepté alors qu'il devait être refusé`);
  } catch (err) {
    const texte = err instanceof Error ? err.message : String(err);
    ok(attendu.test(texte), `${action} — ${message} (« ${texte} »)`);
  }
}

/* ---------- Dates (heure du Bénin) ---------- */

const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo' }).format(new Date());
const plus = (k: string, n: number) => new Date(Date.parse(`${k}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const jourSemaine = (k: string) => new Date(`${k}T12:00:00Z`).getUTCDay();
const ouvrableApres = (k: string, n: number) => {
  let d = plus(k, n);
  while (jourSemaine(d) === 0 || jourSemaine(d) === 6) d = plus(d, 1);
  return d;
};
const mois = aujourdhui.slice(0, 7);
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const libre = (db: Database, employeId: string, debut: string, fin: string) =>
  !db.conges.some((c) => c.employeId === employeId && c.statut !== 'refuse' && c.debut <= fin && debut <= c.fin);

function nouvelEmploye(db: Database, suffixe: string, departement: string, service: string): api.NouvelEmploye {
  const modele = db.employes.find((e) => e.id === 'e-koffi')!;
  return {
    civilite: 'M.',
    prenom: 'Test',
    nom: `Intégration ${suffixe}`,
    dateNaissance: '1995-04-12',
    nationalite: 'Béninoise',
    poste: 'Agent logistique',
    departement,
    service,
    dateEmbauche: `${mois}-01`,
    contrat: 'CDI',
    categorie: 'execution',
    enfantsACharge: 1,
    avantagesNature: [],
    dirigeant: false,
    premierEmploi: false,
    heuresHebdo: 40,
    responsable: '',
    lieuTravail: modele.lieuTravail,
    telPro: '+229 01 00 00 00',
    telPerso: '',
    emailPro: `test.${suffixe}@entreprise.bj`,
    emailPerso: '',
    adresse: 'Cotonou',
    urgenceNom: '',
    urgenceTel: '',
    cnss: '',
    ifu: '',
    compteBancaire: '',
    npi: '',
    salaireBase: 150_000,
    primesFixes: [{ libelle: 'Prime de transport', montant: 15_000, soumisCnss: false, soumisIts: false, remboursementFrais: true }],
  };
}

async function principal(): Promise<void> {
  /* ===== Administrateur : base de démonstration, paramètres, droits ===== */
  let db = await connecter('admin', 'admin@entreprise.bj', 'admin123');
  await api.reinitialiserDemo();
  db = getDB();
  ok(db.employes.length === 9, 'reinitialiserDemo — données de démonstration rechargées');
  appelees.add('reinitialiserDemo');

  const parametres = { ...db.parametres, toleranceRetard: db.parametres.toleranceRetard + 5, joursFeries: [...db.parametres.joursFeries, { date: `${aujourdhui.slice(0, 4)}-12-31`, libelle: 'Jour de test', estime: true }] };
  await etape('modifierParametres', 'tolérance de retard et jour férié ajoutés', () => api.modifierParametres(U, parametres));
  ok(getDB().parametres.toleranceRetard === parametres.toleranceRetard && getDB().parametres.joursFeries.length === parametres.joursFeries.length, 'modifierParametres — valeurs enregistrées');

  const permissionsRh = db.permissions.rh;
  await etape('modifierPermissions', 'droit « Organisation » accordé au RH', () => api.modifierPermissions(U, 'rh', [...permissionsRh, 'organisation.gerer']));
  ok(getDB().permissions.rh.includes('organisation.gerer'), 'modifierPermissions — matrice mise à jour');

  /* ===== Organisation ===== */
  const dep = await etape('creerDepartement', 'département Logistique', () => api.creerDepartement(U, { code: 'LOG', nom: 'Logistique', description: 'Flotte et entrepôts', responsableId: null }));
  if (!dep) throw new Error('Impossible de poursuivre sans département');
  await etape('modifierDepartement', 'description modifiée', () => api.modifierDepartement(U, dep.id, { code: 'LOG', nom: 'Logistique', description: 'Flotte, entrepôts et transport', responsableId: 'e-koffi' }));
  ok(getDB().departements.find((d) => d.id === dep.id)?.responsableId === 'e-koffi', 'modifierDepartement — responsable enregistré');
  await etape('ajouterService', 'service Transport', () => api.ajouterService(U, dep.id, { nom: 'Transport', responsableId: null }));
  await etape('ajouterService', 'service Entrepôt (à supprimer)', () => api.ajouterService(U, dep.id, { nom: 'Entrepôt', responsableId: null }));
  const services = getDB().departements.find((d) => d.id === dep.id)!.services;
  const transport = services.find((s) => s.nom === 'Transport')!;
  const entrepot = services.find((s) => s.nom === 'Entrepôt')!;
  await etape('modifierService', 'service renommé', () => api.modifierService(U, dep.id, transport.id, { nom: 'Transports', responsableId: null }));
  await etape('supprimerService', 'service vide supprimé', () => api.supprimerService(U, dep.id, entrepot.id));
  ok(getDB().departements.find((d) => d.id === dep.id)!.services.length === 1, 'supprimerService — un seul service restant');
  const depVide = await etape('creerDepartement', 'département temporaire', () => api.creerDepartement(U, { code: 'TMP', nom: 'Temporaire', description: '', responsableId: null }));
  if (depVide) await etape('supprimerDepartement', 'département vide supprimé', () => api.supprimerDepartement(U, depVide.id));

  /* ===== RH : collaborateur et compte ===== */
  await connecter('rh', 'rh@entreprise.bj', 'rh123');
  const cree = await etape('creerEmploye', 'collaborateur et compte créés', () => api.creerEmploye(U, nouvelEmploye(getDB(), 'a', 'Logistique', 'Transports'), 'employe'));
  if (!cree) throw new Error('Impossible de poursuivre sans collaborateur');
  const nouveau: Employe = cree.employe;
  ok(Boolean(cree.motDePasse) && getDB().comptes.some((c) => c.employeId === nouveau.id), 'creerEmploye — mot de passe temporaire et compte renvoyés');
  await etape('modifierEmploye', 'téléphone et NPI vérifié', () => api.modifierEmploye(U, nouveau.id, { telPro: '+229 01 11 11 11', npi: '1234567890', npiVerifie: true }));
  ok(getDB().employes.find((e) => e.id === nouveau.id)?.telPro === '+229 01 11 11 11', 'modifierEmploye — modification enregistrée');
  await etape('consulterDonneesSensibles', 'consultation tracée', () => api.consulterDonneesSensibles(U, nouveau.id));
  const mdp = await etape('reinitialiserMotDePasse', 'nouveau mot de passe temporaire', () => api.reinitialiserMotDePasse(U, nouveau.id));
  await etape('changerAcces', 'accès désactivé', () => api.changerAcces(U, nouveau.id, false));
  await refus('connexion', 'compte désactivé refusé', () => connecter('nouveau', mdp!.email, mdp!.motDePasse), /désactiv/i);
  session = 'rh';
  await etape('changerAcces', 'accès réactivé', () => api.changerAcces(U, nouveau.id, true));
  for (let i = 0; i < 5; i++) await connecter('nouveau', mdp!.email, 'mauvais').catch(() => undefined);
  session = 'rh';
  await api.rafraichirEtat();
  ok(Boolean(getDB().comptes.find((c) => c.employeId === nouveau.id)?.verrouilleJusqua), 'connexion — compte verrouillé après 5 échecs');
  await etape('deverrouillerCompte', 'compte déverrouillé', () => api.deverrouillerCompte(U, nouveau.id));
  await refus('changerRole', 'RH : attribution de rôle refusée', () => api.changerRole(U, nouveau.id, 'rh', 'Test'), /administrateur/i);
  session = 'admin';
  await etape('changerRole', 'admin : rôle RH attribué', () => api.changerRole(U, nouveau.id, 'rh', 'Renfort'));
  await etape('changerRole', 'admin : retour au rôle employé', () => api.changerRole(U, nouveau.id, 'employe', 'Fin du renfort'));
  session = 'rh';

  /* ===== Carrière ===== */
  const evolution = await etape('enregistrerEvolution', 'augmentation immédiate', () =>
    api.enregistrerEvolution(U, nouveau.id, { type: 'augmentation', dateEffet: aujourdhui, apres: { poste: 'Chef d’équipe logistique', departement: 'Logistique', salaireBase: 180_000, primesFixes: nouveau.primesFixes }, motif: 'Test' }),
  );
  ok(evolution?.statut === 'appliquee' && getDB().employes.find((e) => e.id === nouveau.id)?.salaireBase === 180_000, 'enregistrerEvolution — appliquée au dossier');
  ok(getDB().documents.some((d) => d.employeId === nouveau.id && d.modele === 'avenant'), 'enregistrerEvolution — avenant généré');

  /* ===== Nouveau collaborateur : pointage et coordonnées ===== */
  await connecter('nouveau', mdp!.email, mdp!.motDePasse);
  const pointage = await etape('pointerArrivee', 'arrivée avec photo et géolocalisation', () =>
    api.pointerArrivee(U, { geo: { lat: 6.3572, lng: 2.3912, precision: 12, distance: 0, dansZone: true }, photo: PHOTO, source: 'web' }),
  );
  ok(pointage?.horodatage === 'serveur' && typeof pointage?.geo?.distance === 'number', 'pointerArrivee — horodatage et distance calculés par le serveur');
  await etape('basculerPause', 'début de pause', () => api.basculerPause(U));
  await etape('basculerPause', 'fin de pause', () => api.basculerPause(U));
  await etape('pointerDepart', 'départ géolocalisé', () => api.pointerDepart(U, { lat: 6.3572, lng: 2.3912, precision: 15, distance: 0, dansZone: true }));
  const p = getDB().pointages.find((x) => x.employeId === nouveau.id && x.date === aujourdhui);
  ok(Boolean(p?.depart) && p!.pauseDebut === null && Boolean(p!.geoDepart) && p!.photo === `/api/pointages/${p!.id}/photo`, 'pointage — départ, fin de pause, position de départ et lien de photo enregistrés');
  await etape('modifierCoordonnees', 'coordonnées personnelles', () => api.modifierCoordonnees(U, { telPerso: '+229 97 00 00 00', emailPerso: 'test@exemple.bj', adresse: 'Abomey-Calavi', urgenceNom: 'Parent', urgenceTel: '+229 96 00 00 00' }));
  ok(getDB().employes[0].adresse === 'Abomey-Calavi', 'modifierCoordonnees — enregistrées');

  /* ===== Koffi : demandes ===== */
  await connecter('koffi', 'k.mensah@entreprise.bj', 'employe123');
  const debutConge = ouvrableApres(aujourdhui, 45);
  const conge = await etape('demanderConge', 'congé payé d’un jour', () =>
    api.demanderConge(U, { type: 'conge_paye', debut: debutConge, debutPeriode: 'matin', fin: debutConge, finPeriode: 'fin', motif: 'Affaires familiales', justificatif: null }),
  );
  const debutPermission = ouvrableApres(aujourdhui, 60);
  const permission = await etape('demanderConge', 'permission exceptionnelle (mariage)', () =>
    api.demanderConge(U, { type: 'permission', motifPermission: 'mariage_travailleur', debut: debutPermission, debutPeriode: 'matin', fin: debutPermission, finPeriode: 'fin', motif: 'Événement familial', justificatif: 'acte.pdf' }),
  );
  const dateRegul = [...Array(20).keys()].map((i) => plus(aujourdhui, -(i + 1))).find((d) => jourSemaine(d) !== 0 && !getDB().pointages.some((x) => x.date === d) && libre(getDB(), 'e-koffi', d, d)) ?? plus(aujourdhui, -1);
  const regul = await etape('demanderRegularisation', `oubli de pointage du ${dateRegul}`, () => api.demanderRegularisation(U, { type: 'oubli', date: dateRegul, entree: '08:00', depart: '17:00', motif: 'Badge oublié', justificatif: null }));
  const regulRefusee = await etape('demanderRegularisation', 'seconde demande (sera refusée)', () => api.demanderRegularisation(U, { type: 'retard', date: plus(aujourdhui, -1), entree: '09:00', depart: '17:00', motif: 'Embouteillage', justificatif: null }));
  const demandeDoc = await etape('demanderDocument', 'attestation d’emploi', () => api.demanderDocument(U, { type: 'attestation_travail', destinataire: 'BOA Bénin', format: 'digital', commentaire: '' }));
  const demandeDoc2 = await etape('demanderDocument', 'attestation de salaire (sera refusée)', () => api.demanderDocument(U, { type: 'attestation_salaire', destinataire: '', format: 'paper', commentaire: 'Urgent' }));

  /* ===== RH : traitement ===== */
  await utiliser('rh');
  if (conge) await etape('deciderConge', 'congé approuvé', () => api.deciderConge(U, conge.id, true, 'Bon congé'));
  if (permission) await etape('deciderConge', 'permission refusée', () => api.deciderConge(U, permission.id, false, 'Pièce illisible'));
  ok(getDB().conges.find((c) => c.id === conge?.id)?.statut === 'approuve' && getDB().conges.find((c) => c.id === permission?.id)?.statut === 'refuse', 'deciderConge — statuts enregistrés');
  if (regul) await etape('deciderRegularisation', 'régularisation approuvée', () => api.deciderRegularisation(U, regul.id, true, ''));
  ok(getDB().pointages.some((x) => x.employeId === 'e-koffi' && x.date === dateRegul), 'deciderRegularisation — pointage créé');
  if (regulRefusee) await etape('deciderRegularisation', 'régularisation refusée', () => api.deciderRegularisation(U, regulRefusee.id, false, 'Non justifié'));
  const docTraite = demandeDoc ? await etape('traiterDemandeDocument', 'attestation générée', () => api.traiterDemandeDocument(U, demandeDoc.id)) : undefined;
  if (demandeDoc2) await etape('refuserDemandeDocument', 'demande refusée', () => api.refuserDemandeDocument(U, demandeDoc2.id, 'Document non disponible'));
  const docManuel = await etape('genererDocumentManuel', 'certificat de présence', () => api.genererDocumentManuel(U, 'e-koffi', 'attestation_travail', { destinataire: 'Ambassade' }));
  if (docManuel) await etape('journaliserTelechargement', 'téléchargement par le RH', () => api.journaliserTelechargement(U, docManuel));
  await etape('journaliserExport', 'export CSV tracé', () => api.journaliserExport(U, 'Pointages du mois', 'CSV', 42));
  ok(getDB().audit.some((a) => a.action === 'EXPORT_RAPPORT'), 'journaliserExport — entrée du journal d’audit');

  /* ===== Koffi : documents, vérification, notifications ===== */
  await utiliser('koffi');
  if (docTraite) {
    await etape('journaliserTelechargement', 'téléchargement de son document', () => api.journaliserTelechargement(U, docTraite));
    const verif = await etape('verifierDocument', 'code authentique', () => api.verifierDocument(U, docTraite.code));
    ok(verif?.id === docTraite.id, 'verifierDocument — document retrouvé');
  }
  ok((await api.verifierDocument(U, 'CODE-INEXISTANT')) === null, 'verifierDocument — code inconnu : aucun document');
  const koffiUser = { employeId: 'e-koffi', role: 'employe' } as User;
  const ids = api.notificationsPour(getDB(), koffiUser).filter((n) => !n.lu).map((n) => n.id);
  await etape('marquerLues', `${ids.length} notification(s)`, () => api.marquerLues(ids));
  ok(ids.length > 0 && api.notificationsPour(getDB(), koffiUser).every((n) => n.lu), 'marquerLues — toutes lues');

  /* ===== Maternité ===== */
  await utiliser('admin');
  const dbAdmin = getDB();
  const presumee = plus(aujourdhui, 7);
  const salariee = dbAdmin.employes.find((e) => e.civilite === 'Mme' && libre(dbAdmin, e.id, plus(aujourdhui, -60), plus(aujourdhui, 200)) && dbAdmin.comptes.some((c) => c.employeId === e.id && c.role === 'employe'));
  ok(Boolean(salariee), 'maternité — salariée disponible dans les données de démonstration');
  if (salariee) {
    const compte = dbAdmin.comptes.find((c) => c.employeId === salariee.id)!;
    await connecter('salariee', compte.email, 'employe123');
    const mat = await etape('demanderConge', 'congé de maternité', () =>
      api.demanderConge(U, { type: 'maternite', dateAccouchementPresumee: presumee, debut: presumee, debutPeriode: 'matin', fin: presumee, finPeriode: 'fin', motif: '', justificatif: 'certificat.pdf' }),
    );
    await utiliser('rh');
    if (mat) {
      await etape('deciderConge', 'maternité approuvée', () => api.deciderConge(U, mat.id, true, ''));
      const declare = await etape('declarerAccouchement', 'accouchement le jour même', () => api.declarerAccouchement(U, mat.id, aujourdhui));
      ok(declare?.dateAccouchement === aujourdhui, 'declarerAccouchement — date enregistrée, fin recalculée');
      const prolonge = await etape('prolongerMaternite', '4 semaines pour maladie', () => api.prolongerMaternite(U, mat.id, 'certificat-maladie.pdf'));
      ok(prolonge?.prolongationMaladie === true && prolonge.fin === plus(declare!.fin, 28), 'prolongerMaternite — fin repoussée de 28 jours');
      await refus('enregistrerSortie', 'licenciement pendant la maternité interdit', () =>
        api.enregistrerSortie(U, salariee.id, { motif: 'licenciement', dateNotification: aujourdhui, dateSortie: plus(aujourdhui, 40), preavis: 'effectue', observations: '' }),
      /art\. 171/);
    }
  }

  /* ===== Absences ===== */
  await utiliser('rh');
  const dbRh = getDB();
  const feries = new Set(dbRh.parametres.joursFeries.map((f) => f.date));
  const absents = [...Array(25).keys()]
    .map((i) => plus(aujourdhui, -(i + 1)))
    .filter((d) => d >= nouveau.dateEmbauche && d.slice(0, 7) === mois && jourSemaine(d) !== 0 && jourSemaine(d) !== 6 && !feries.has(d) && !dbRh.pointages.some((x) => x.employeId === nouveau.id && x.date === d) && libre(dbRh, nouveau.id, d, d))
    .sort();
  ok(absents.length >= 2, `absences — ${absents.length} jour(s) sans pointage pour le nouveau collaborateur`);
  if (absents.length >= 2) {
    await etape('relancerAbsence', 'justificatif demandé', () => api.relancerAbsence(U, nouveau.id, absents.slice(1)));
    const just = await etape('justifierAbsence', 'absence justifiée (maladie)', () => api.justifierAbsence(U, nouveau.id, absents[0], absents[0], { type: 'maladie', motif: 'Paludisme', justificatif: 'certificat.pdf' }));
    ok(just?.statut === 'approuve', 'justifierAbsence — absence autorisée enregistrée');
  }

  /* ===== Paie ===== */
  await utiliser('admin');
  const campagne = await etape('preparerPaie', `paie de ${mois}`, () => api.preparerPaie(U, mois));
  if (campagne) {
    ok(campagne.lignes.some((l) => l.employeId === nouveau.id), 'preparerPaie — nouveau collaborateur inclus');
    await etape('ajouterElementVariable', 'prime exceptionnelle', () => api.ajouterElementVariable(U, campagne.id, 'e-koffi', { libelle: 'Prime de rendement', montant: 25_000, nature: 'prime', soumisCnss: true, soumisIts: true }));
    await etape('ajouterElementVariable', 'retenue (à retirer)', () => api.ajouterElementVariable(U, campagne.id, 'e-koffi', { libelle: 'Avance', montant: 10_000, nature: 'retenue', soumisCnss: false, soumisIts: false }));
    const ligne = getDB().campagnesPaie.find((c) => c.id === campagne.id)!.lignes.find((l) => l.employeId === 'e-koffi')!;
    const retenue = ligne.elements.find((e) => e.libelle === 'Avance')!;
    await etape('supprimerElementVariable', 'retenue retirée', () => api.supprimerElementVariable(U, campagne.id, 'e-koffi', retenue.id));
    await etape('recalculerPaie', 'recalcul', () => api.recalculerPaie(U, campagne.id));
    const apres = getDB().campagnesPaie.find((c) => c.id === campagne.id)!.lignes.find((l) => l.employeId === 'e-koffi')!;
    ok(apres.elements.length === 1 && apres.elements[0].libelle === 'Prime de rendement', 'recalculerPaie — éléments variables conservés');
    await etape('validerPaie', 'validation', () => api.validerPaie(U, campagne.id));
    await etape('rouvrirPaie', 'réouverture', () => api.rouvrirPaie(U, campagne.id, 'Correction'));
    await etape('validerPaie', 'nouvelle validation', () => api.validerPaie(U, campagne.id));
    const bulletins = await etape('payerSalaires', 'versement', () => api.payerSalaires(U, campagne.id, aujourdhui, 'Virement bancaire'));
    ok((bulletins ?? 0) === campagne.lignes.length && getDB().campagnesPaie.find((c) => c.id === campagne.id)?.statut === 'payee', `payerSalaires — ${bulletins} bulletins distribués`);
  }

  /* ===== Sortie ===== */
  await utiliser('rh');
  const dateSortie = `${plus(`${mois}-28`, 10).slice(0, 7)}-${'15'}`;
  const sortie = await etape('enregistrerSortie', 'démission avec préavis', () =>
    api.enregistrerSortie(U, nouveau.id, { motif: 'demission', dateNotification: aujourdhui, dateSortie, preavis: 'effectue', observations: 'Départ volontaire' }),
  );
  ok(sortie?.statut === 'planifiee' && (sortie?.rubriques.length ?? 0) > 0, 'enregistrerSortie — droits de sortie calculés');
  if (sortie) await etape('annulerSortie', 'sortie annulée', () => api.annulerSortie(U, sortie.id, 'Rétractation'));
  ok(getDB().sorties.find((s) => s.id === sortie?.id)?.statut === 'annulee', 'annulerSortie — statut annulé');

  /* ===== Suppression ===== */
  await refus('supprimerEmploye', 'RH : suppression refusée (droit non accordé par défaut)', () => api.supprimerEmploye(U, nouveau.id, 'Erreur'), /Supprimer un collaborateur/);
  await utiliser('admin');
  await refus('supprimerEmploye', 'admin : dossier avec historique protégé', () => api.supprimerEmploye(U, nouveau.id, 'Erreur'), /Suppression impossible/);
  const ephemere = await etape('creerEmploye', 'dossier créé par erreur', () => api.creerEmploye(U, nouvelEmploye(getDB(), 'b', 'Logistique', ''), 'employe'));
  ok(Boolean(ephemere) && api.motifsBlocageSuppression(getDB(), ephemere!.employe.id).length === 0, 'motifsBlocageSuppression — aucun blocage pour un dossier vierge');
  if (ephemere) await etape('supprimerEmploye', 'dossier vierge supprimé', () => api.supprimerEmploye(U, ephemere.employe.id, 'Doublon'));
  ok(!getDB().employes.some((e) => e.id === ephemere?.employe.id) && !getDB().comptes.some((c) => c.employeId === ephemere?.employe.id), 'supprimerEmploye — dossier et compte supprimés');

  /* ===== Droits par défaut restaurés, déconnexion ===== */
  await etape('modifierPermissions', 'matrice RH restaurée', () => api.modifierPermissions(U, 'rh', permissionsRh));
  for (const nom of ['nouveau', 'koffi', 'salariee', 'rh', 'admin']) {
    session = nom;
    await api.deconnexion(false).catch(() => undefined);
  }
  session = 'koffi';
  await refus('reprendreSession', 'session fermée après déconnexion', () => api.reprendreSession(), /session/i);

  /* ===== Couverture ===== */
  const toutes = Object.entries(api)
    .filter(([nom, f]) => typeof f === 'function' && !['ErreurApi', 'requete', 'quandSessionPerdue', 'connexion', 'reprendreSession', 'deconnexion', 'rafraichirEtat', 'suivreRevisions', 'moisReference', 'motifsBlocageSuppression', 'notificationsPour'].includes(nom))
    .map(([nom]) => nom);
  const oubliees = toutes.filter((n) => !appelees.has(n));
  ok(oubliees.length === 0, `Couverture : ${toutes.length - oubliees.length}/${toutes.length} actions du frontend appelées${oubliees.length ? ` (manquantes : ${oubliees.join(', ')})` : ''}`);

  console.log(`\n${total - echecs.length}/${total} contrôles réussis`);
  if (echecs.length) console.log(`\nÉCHECS :\n- ${echecs.join('\n- ')}`);
  process.exit(echecs.length ? 1 : 0);
}

principal().catch((err) => {
  console.error('Test interrompu :', err);
  process.exit(1);
});
