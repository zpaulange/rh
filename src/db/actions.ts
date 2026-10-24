import { MOTIFS_PERMISSION } from '../config/paie';
import { LIBELLE_EVOLUTION, MOTIFS_SORTIE } from '../config/paie';
import { calculerSortie, type SaisieSortie } from '../lib/sortie';
import { joursCalendaires, materniteProtegee, periodeMaternite } from '../lib/maternite';
import { estSorti } from '../lib/contrat';
import { construireDocument, LIBELLE_DEMANDE_DOCUMENT, MODELES_MENSUELS } from '../lib/documents';
import { ensembleFeries } from '../lib/feries';
import { calculerLignePaie, campagneDuMois, controleSmig, employesAPayer, fcfa, lignePayee, situationActuelle, totaux } from '../lib/paie';
import { calculerDroits, calculerRetard, disponiblePour, dureeConge, LIBELLE_CONGE } from '../lib/rules';
import { serverNow, serverNowISO, timeSource } from '../lib/serverTime';
import { ajouterJours, dateCourte, dateKey, dateMoisLong, heureHM, instant, lundi, moisDe, moisLong } from '../lib/time';
import type {
  ActionAudit,
  Compte,
  Database,
  DemandeConge,
  Departement,
  CampagnePaie,
  DemandeDocument,
  DocumentGenere,
  ElementVariable,
  EvolutionCarriere,
  Employe,
  GeoPoint,
  ModeleDocument,
  Notification,
  Permission,
  Parametres,
  Pointage,
  Regularisation,
  Role,
  SituationContractuelle,
  Sortie,
  TypeEvolution,
  SourcePointage,
  User,
} from '../types';
import { LIBELLE_PERMISSION, LIBELLE_ROLE_LONG, roleA, TOUTES_PERMISSIONS } from '../lib/permissions';
import { getDB, mutate, uid } from './store';

/* ================= Outils internes ================= */

/** Refuse l'action si le rôle de l'utilisateur ne dispose pas de la permission (matrice des rôles) */
function exiger(db: Database, user: Pick<User, 'role'>, permission: Permission): void {
  if (!roleA(db, user.role, permission)) throw new Error(`Action non autorisée : votre rôle ne dispose pas du droit « ${LIBELLE_PERMISSION[permission]} ».`);
}

/** Le département doit exister et le service, s'il est renseigné, lui appartenir */
function verifierRattachement(db: Database, departement: string, service: string): void {
  const dep = db.departements.find((d) => d.nom === departement);
  if (!dep) throw new Error(`Le département « ${departement} » n'existe pas dans l'organisation.`);
  if (service && !dep.services.some((x) => x.nom === service)) throw new Error(`Le service « ${service} » n'appartient pas au département ${dep.nom}.`);
}

/** Les comptes RH et administrateur ne peuvent être gérés que par un administrateur */
function exigerSurCompte(user: User, compte: Compte): void {
  if (compte.role !== 'employe' && user.role !== 'admin') throw new Error('Seul un administrateur peut agir sur un compte RH ou administrateur.');
}


export interface Acteur {
  compteId: string | null;
  employeId: string | null;
  nom: string;
  role: Role | 'systeme';
}

export const acteurDe = (user: User): Acteur => ({
  compteId: user.compteId,
  employeId: user.employeId,
  nom: `${user.prenom} ${user.nom}`,
  role: user.role,
});

const SYSTEME: Acteur = { compteId: null, employeId: null, nom: 'Système', role: 'systeme' };

function journaliser(db: Database, acteur: Acteur, action: ActionAudit, cible: string, employeId: string | null, details: string) {
  db.audit.push({
    id: uid('a'),
    date: serverNowISO(),
    acteur: acteur.nom,
    acteurRole: acteur.role,
    compteId: acteur.compteId,
    action,
    cible,
    employeId,
    details,
  });
}

function notifier(db: Database, n: Omit<Notification, 'id' | 'date' | 'lu'>) {
  db.notifications.push({ id: uid('n'), date: serverNowISO(), lu: false, ...n });
}

const employe = (db: Database, id: string): Employe => {
  const e = db.employes.find((x) => x.id === id);
  if (!e) throw new Error('Collaborateur introuvable.');
  return e;
};
const nomComplet = (e: Employe) => `${e.prenom} ${e.nom}`;
const annee = () => dateKey(serverNow()).slice(0, 4);

function creerDocument(db: Database, emp: Employe, modele: ModeleDocument, params: Record<string, string>, acteur: Acteur): DocumentGenere {
  const doc = construireDocument({
    id: uid('doc'),
    employe: emp,
    modele,
    params,
    dateISO: serverNowISO(),
    generePar: acteur.nom,
    sequence: 900 + db.documents.length,
  });
  db.documents.push(doc);
  journaliser(db, acteur, 'GENERATION_DOCUMENT', doc.reference, emp.id, `${doc.titre} • code ${doc.code}`);
  return doc;
}

/* ================= Authentification ================= */

export type ResultatConnexion = { ok: true; compte: Compte } | { ok: false; erreur: string };

/** Contrôle des identifiants avec verrouillage après échecs répétés */
export function authentifier(email: string, motDePasse: string): ResultatConnexion {
  return mutate((db) => {
    const p = db.parametres;
    const compte = db.comptes.find((c) => c.email.toLowerCase() === email.trim().toLowerCase());
    const maintenant = serverNow();

    if (!compte) {
      journaliser(db, { ...SYSTEME, nom: email.trim() || 'Inconnu' }, 'ECHEC_CONNEXION', email.trim(), null, 'Compte inexistant');
      return { ok: false, erreur: 'Adresse email ou mot de passe incorrect.' };
    }
    const emp = employe(db, compte.employeId);
    const acteur: Acteur = { compteId: compte.id, employeId: emp.id, nom: nomComplet(emp), role: compte.role };

    if (compte.verrouilleJusqua && new Date(compte.verrouilleJusqua) > maintenant) {
      return { ok: false, erreur: `Compte temporairement verrouillé jusqu'à ${heureHM(compte.verrouilleJusqua)} suite à plusieurs échecs.` };
    }
    if (compte.motDePasse !== motDePasse) {
      compte.tentativesEchouees += 1;
      journaliser(db, acteur, 'ECHEC_CONNEXION', compte.email, emp.id, `Tentative ${compte.tentativesEchouees}/${p.tentativesMax}`);
      if (compte.tentativesEchouees >= p.tentativesMax) {
        compte.verrouilleJusqua = new Date(maintenant.getTime() + p.verrouillageMinutes * 60000).toISOString();
        compte.tentativesEchouees = 0;
        journaliser(db, SYSTEME, 'COMPTE_VERROUILLE', compte.email, emp.id, `Verrouillage ${p.verrouillageMinutes} min`);
        notifier(db, {
          pour: { role: 'rh' },
          titre: 'Compte verrouillé',
          message: `${nomComplet(emp)} — ${p.tentativesMax} échecs de connexion`,
          lien: `/rh/employes/${emp.id}`,
          niveau: 'alerte',
        });
        // Sécurité : l'administrateur est prévenu de tout verrouillage (seul habilité pour les comptes RH et admin)
        notifier(db, {
          pour: { role: 'admin' },
          titre: 'Compte verrouillé',
          message: `${nomComplet(emp)} (${compte.role === 'employe' ? 'employé' : compte.role.toUpperCase()}) — ${p.tentativesMax} échecs de connexion`,
          lien: '/admin/utilisateurs',
          niveau: 'alerte',
        });
        return { ok: false, erreur: `Trop de tentatives : compte verrouillé ${p.verrouillageMinutes} minutes.` };
      }
      const restantes = p.tentativesMax - compte.tentativesEchouees;
      return { ok: false, erreur: `Adresse email ou mot de passe incorrect. ${restantes} tentative(s) restante(s).` };
    }
    if (!compte.actif) {
      journaliser(db, acteur, 'ECHEC_CONNEXION', compte.email, emp.id, 'Compte désactivé');
      return { ok: false, erreur: 'Votre accès a été désactivé. Contactez le service RH.' };
    }

    compte.tentativesEchouees = 0;
    compte.verrouilleJusqua = null;
    compte.derniereConnexion = maintenant.toISOString();
    journaliser(db, acteur, 'CONNEXION', compte.email, emp.id, `Connexion réussie • ${navigator.userAgent.split(') ')[0]})`);
    return { ok: true, compte: { ...compte } };
  });
}

export function journaliserDeconnexion(user: User, expiree: boolean) {
  mutate((db) =>
    journaliser(db, acteurDe(user), expiree ? 'SESSION_EXPIREE' : 'DECONNEXION', user.email, user.employeId, expiree ? 'Inactivité prolongée' : 'Déconnexion volontaire'),
  );
}

/* ================= Pointage ================= */

interface DonneesPointage {
  geo: GeoPoint | null;
  photo: string | null;
  source: SourcePointage;
}

const TERMINAUX: Record<SourcePointage, string> = {
  biometrique: 'Biométrique (RDC)',
  web: 'Portail Web',
  mobile: 'Mobile (GPS)',
  regularisation: 'Portail Web (Régul.)',
};

export function pointerArrivee(user: User, { geo, photo, source }: DonneesPointage): Pointage {
  return mutate((db) => {
    const now = serverNow();
    const key = dateKey(now);
    if (db.pointages.some((p) => p.employeId === user.employeId && p.date === key)) throw new Error("Vous avez déjà pointé votre arrivée aujourd'hui.");
    const acteur = acteurDe(user);
    const emp = employe(db, user.employeId);
    const arrivee = now.toISOString();
    const retard = calculerRetard(arrivee, db.parametres);
    const p: Pointage = {
      id: uid('pt'),
      employeId: user.employeId,
      date: key,
      arrivee,
      depart: null,
      pauseMinutes: 0,
      pauseDebut: null,
      source,
      terminal: TERMINAUX[source],
      retardMinutes: retard,
      geo,
      geoDepart: null,
      photo,
      horodatage: timeSource(),
    };
    db.pointages.push(p);

    const lieu = geo ? `${geo.dansZone ? 'dans la zone' : 'HORS ZONE'} (${geo.distance} m, ±${geo.precision} m)` : 'non localisé';
    journaliser(db, acteur, 'POINTAGE_ARRIVEE', heureHM(arrivee), emp.id, `Heure ${p.horodatage} • ${lieu} • photo ${photo ? 'oui' : 'non'}`);

    // Détection automatique des retards
    if (retard > db.parametres.toleranceRetard) {
      journaliser(db, SYSTEME, 'RETARD_DETECTE', nomComplet(emp), emp.id, `Arrivée ${heureHM(arrivee)} • ${retard} min de retard`);
      notifier(db, {
        pour: { role: 'rh' },
        titre: 'Retard détecté',
        message: `${nomComplet(emp)} — arrivée ${heureHM(arrivee)} (${retard} min)`,
        lien: '/rh/pointages',
        niveau: 'alerte',
      });
      notifier(db, {
        pour: { employeId: emp.id },
        titre: 'Retard enregistré',
        message: `Arrivée à ${heureHM(arrivee)} (${retard} min). Vous pouvez le justifier via une régularisation.`,
        lien: '/employe/pointages',
        niveau: 'alerte',
      });
    }
    if (geo && !geo.dansZone) {
      journaliser(db, SYSTEME, 'POINTAGE_HORS_ZONE', nomComplet(emp), emp.id, `Distance du site : ${geo.distance} m`);
      notifier(db, {
        pour: { role: 'rh' },
        titre: 'Pointage hors zone',
        message: `${nomComplet(emp)} a pointé à ${geo.distance} m du site`,
        lien: '/rh/pointages',
        niveau: 'alerte',
      });
    }
    return { ...p };
  });
}

export function basculerPause(user: User): void {
  mutate((db) => {
    const now = serverNow();
    const p = db.pointages.find((x) => x.employeId === user.employeId && x.date === dateKey(now));
    if (!p || p.depart) throw new Error('Aucune session active.');
    if (p.pauseDebut) {
      const minutes = Math.round((now.getTime() - new Date(p.pauseDebut).getTime()) / 60000);
      p.pauseMinutes += minutes;
      p.pauseDebut = null;
      journaliser(db, acteurDe(user), 'POINTAGE_PAUSE', 'Reprise', user.employeId, `Pause de ${minutes} min`);
    } else {
      p.pauseDebut = now.toISOString();
      journaliser(db, acteurDe(user), 'POINTAGE_PAUSE', 'Début de pause', user.employeId, heureHM(now));
    }
  });
}

export function pointerDepart(user: User, geo: GeoPoint | null): void {
  mutate((db) => {
    const now = serverNow();
    const p = db.pointages.find((x) => x.employeId === user.employeId && x.date === dateKey(now));
    if (!p || p.depart) throw new Error('Aucune session active.');
    if (p.pauseDebut) {
      p.pauseMinutes += Math.round((now.getTime() - new Date(p.pauseDebut).getTime()) / 60000);
      p.pauseDebut = null;
    }
    p.depart = now.toISOString();
    p.geoDepart = geo;
    journaliser(db, acteurDe(user), 'POINTAGE_DEPART', heureHM(now), user.employeId, geo ? `${geo.distance} m du site` : 'non localisé');
  });
}

/* ================= Congés ================= */

export interface NouvelleDemandeConge {
  type: DemandeConge['type'];
  motifPermission?: DemandeConge['motifPermission'];
  dateAccouchementPresumee?: string;
  debut: string;
  debutPeriode: DemandeConge['debutPeriode'];
  fin: string;
  finPeriode: DemandeConge['finPeriode'];
  motif: string;
  justificatif: string | null;
}

/**
 * Jours de liberté pour rechercher un emploi pendant le préavis : 2 jours ouvrables par semaine, payés (CT art. 54, CCGT art. 31).
 * Uniquement pendant un préavis effectué.
 */
function verifierLibertePreavis(db: Database, emp: Employe, debut: string, fin: string, jours: number, ignorer?: string): void {
  const sortie = db.sorties.find((x) => x.employeId === emp.id && x.statut === 'planifiee' && x.preavis === 'effectue');
  if (!sortie) throw new Error('Les jours de liberté ne s’appliquent que pendant un préavis effectué.');
  if (debut < sortie.dateNotification || fin > sortie.dateSortie)
    throw new Error(`Les jours de liberté doivent se situer pendant le préavis, du ${dateCourte(sortie.dateNotification)} au ${dateCourte(sortie.dateSortie)}.`);
  if (lundi(debut) !== lundi(fin)) throw new Error('Saisissez les jours de liberté semaine par semaine (2 jours au plus par semaine).');
  const dejaPris = db.conges
    .filter((c) => c.id !== ignorer && c.employeId === emp.id && c.type === 'liberte_preavis' && c.statut !== 'refuse' && lundi(c.debut) === lundi(debut))
    .reduce((t, c) => t + c.jours, 0);
  if (dejaPris + jours > 2) throw new Error(`2 jours de liberté au plus par semaine (déjà ${dejaPris} j cette semaine).`);
}

export function demanderConge(user: User, d: NouvelleDemandeConge): DemandeConge {
  return mutate((db) => {
    const emp = employe(db, user.employeId);
    // Congé de maternité : période fixée par la loi à partir de la date présumée d'accouchement (CT art. 170)
    if (d.type === 'maternite') {
      if (emp.civilite !== 'Mme') throw new Error('Le congé de maternité concerne les salariées.');
      if (!d.dateAccouchementPresumee) throw new Error("Indiquez la date présumée de l'accouchement.");
      if (!d.justificatif) throw new Error("Joignez le certificat médical constatant la grossesse et la date présumée d'accouchement.");
      d = { ...d, ...periodeMaternite(d.dateAccouchementPresumee), debutPeriode: 'matin', finPeriode: 'fin' };
    }
    const jours = d.type === 'maternite' ? joursCalendaires(d.debut, d.fin) : dureeConge(d.debut, d.fin, d.debutPeriode, d.finPeriode, ensembleFeries(db.parametres));
    if (jours <= 0) throw new Error('La période choisie ne contient aucun jour ouvrable.');
    if (d.type === 'liberte_preavis') verifierLibertePreavis(db, emp, d.debut, d.fin, jours);
    const chevauche = db.conges.some(
      (c) => c.employeId === emp.id && c.statut !== 'refuse' && c.debut <= d.fin && d.debut <= c.fin,
    );
    if (chevauche) throw new Error('Cette période chevauche une demande existante.');
    if (d.type === 'rtt') throw new Error('Les heures supplémentaires sont payées (CT art. 147) : aucune récupération RTT.');
    if (d.type === 'permission') {
      const motif = d.motifPermission ? MOTIFS_PERMISSION[d.motifPermission] : undefined;
      if (!motif) throw new Error('Précisez l’événement justifiant la permission.');
      if (motif.jours !== null && jours > motif.jours) throw new Error(`Permission limitée à ${motif.jours} j pour cet événement (CCGT art. 54).`);
    }
    const disponible = disponiblePour(calculerDroits(db, emp, dateKey(serverNow())), d.type);
    if (disponible !== null && jours > disponible)
      throw new Error(`Solde insuffisant : ${disponible} j disponible(s), demandes en attente déduites.`);
    const c: DemandeConge = {
      id: uid('cg'),
      reference: `CG-${annee()}-${String(db.conges.length + 8).padStart(4, '0')}`,
      employeId: emp.id,
      ...d,
      jours,
      statut: 'en_attente',
      dateDemande: serverNowISO(),
      validateur: 'Direction RH',
      traitePar: null,
      dateTraitement: null,
      commentaireRH: '',
    };
    db.conges.push(c);
    journaliser(db, acteurDe(user), 'DEMANDE_CONGE', c.reference, emp.id, `${LIBELLE_CONGE[c.type]} • ${jours} j du ${dateCourte(c.debut)} au ${dateCourte(c.fin)}`);
    notifier(db, {
      pour: { role: 'rh' },
      titre: 'Nouvelle demande de congé',
      message: `${nomComplet(emp)} — ${LIBELLE_CONGE[c.type]} (${jours} j)`,
      lien: '/rh/conges',
      niveau: 'info',
    });
    return { ...c };
  });
}

export function deciderConge(user: User, id: string, approuve: boolean, commentaire: string): void {
  mutate((db) => {
    const c = db.conges.find((x) => x.id === id);
    if (!c || c.statut !== 'en_attente') throw new Error('Demande déjà traitée.');
    exiger(db, user, c.type === 'permission' ? 'permissions.valider' : 'conges.valider');
    const acteur = acteurDe(user);
    const emp = employe(db, c.employeId);
    c.statut = approuve ? 'approuve' : 'refuse';
    c.traitePar = acteur.nom;
    c.dateTraitement = serverNowISO();
    c.commentaireRH = commentaire;
    journaliser(db, acteur, approuve ? 'VALIDATION_CONGE' : 'REFUS_CONGE', c.reference, emp.id, commentaire || `${LIBELLE_CONGE[c.type]} • ${c.jours} j`);

    // Génération automatique du titre de congé signé
    if (approuve && c.type !== 'maladie') {
      creerDocument(db, emp, 'titre_conge', { congeId: c.id, periode: `${dateCourte(c.debut)} — ${dateCourte(c.fin)}`, jours: String(c.jours) }, acteur);
    }
    notifier(db, {
      pour: { employeId: emp.id },
      titre: approuve ? `Congé ${c.debut.slice(8, 10)}/${c.debut.slice(5, 7)} approuvé` : 'Demande de congé refusée',
      message: approuve
        ? c.type !== 'maladie'
          ? 'Titre de congé disponible dans vos documents'
          : 'Validation RH confirmée'
        : commentaire || 'Contactez le service RH pour plus de détails',
      lien: approuve && c.type !== 'maladie' ? '/employe/documents' : '/employe/conges',
      niveau: approuve ? 'succes' : 'alerte',
    });
  });
}

/** Déclaration de la date réelle d'accouchement : ajuste la fin du congé (CT art. 170) */
export function declarerAccouchement(user: User, congeId: string, dateAccouchement: string): DemandeConge {
  return mutate((db) => {
    exiger(db, user, 'conges.valider');
    const c = db.conges.find((x) => x.id === congeId);
    if (!c || c.type !== 'maternite' || c.statut !== 'approuve') throw new Error('Congé de maternité validé introuvable.');
    if (!c.dateAccouchementPresumee) throw new Error("Date présumée d'accouchement manquante.");
    if (dateAccouchement > dateKey(serverNow())) throw new Error("La date d'accouchement ne peut pas être future.");
    if (dateAccouchement < c.debut) throw new Error('La date d’accouchement précède le début du congé : vérifiez la date présumée.');
    const { fin } = periodeMaternite(c.dateAccouchementPresumee, dateAccouchement, c.prolongationMaladie);
    const conflit = db.conges.find((x) => x.id !== c.id && x.employeId === c.employeId && x.statut !== 'refuse' && x.debut <= fin && c.debut <= x.fin);
    if (conflit) throw new Error(`Le congé prolongé chevauche la demande ${conflit.reference} : traitez-la d'abord.`);
    c.dateAccouchement = dateAccouchement;
    c.fin = fin;
    c.jours = joursCalendaires(c.debut, fin);
    const emp = employe(db, c.employeId);
    journaliser(db, acteurDe(user), 'VALIDATION_CONGE', c.reference, emp.id, `Accouchement le ${dateCourte(dateAccouchement)} • reprise le ${dateCourte(ajouterJours(fin, 1))} (CT art. 170)`);
    notifier(db, {
      pour: { employeId: emp.id },
      titre: 'Congé de maternité mis à jour',
      message: `Reprise prévue le ${dateCourte(ajouterJours(fin, 1))}`,
      lien: '/employe/conges',
      niveau: 'info',
    });
    return { ...c };
  });
}

/** Prolongation de 4 semaines pour maladie résultant de la grossesse ou des couches (CT art. 170) */
export function prolongerMaternite(user: User, congeId: string, justificatif: string): DemandeConge {
  return mutate((db) => {
    exiger(db, user, 'conges.valider');
    const c = db.conges.find((x) => x.id === congeId);
    if (!c || c.type !== 'maternite' || c.statut !== 'approuve') throw new Error('Congé de maternité validé introuvable.');
    if (c.prolongationMaladie) throw new Error('La prolongation de 4 semaines a déjà été accordée.');
    if (!justificatif) throw new Error('Un certificat médical est requis pour la prolongation.');
    const fin = ajouterJours(c.fin, 28);
    const conflit = db.conges.find((x) => x.id !== c.id && x.employeId === c.employeId && x.statut !== 'refuse' && x.debut <= fin && c.debut <= x.fin);
    if (conflit) throw new Error(`La prolongation chevauche la demande ${conflit.reference} : traitez-la d'abord.`);
    c.prolongationMaladie = true;
    c.fin = fin;
    c.jours = joursCalendaires(c.debut, fin);
    c.justificatif = c.justificatif ? `${c.justificatif}, ${justificatif}` : justificatif;
    const emp = employe(db, c.employeId);
    journaliser(db, acteurDe(user), 'VALIDATION_CONGE', c.reference, emp.id, `Prolongation de 4 semaines pour maladie • reprise le ${dateCourte(ajouterJours(fin, 1))}`);
    notifier(db, { pour: { employeId: emp.id }, titre: 'Congé de maternité prolongé', message: `Reprise prévue le ${dateCourte(ajouterJours(fin, 1))}`, lien: '/employe/conges', niveau: 'info' });
    return { ...c };
  });
}

/* ================= Régularisations ================= */

export type NouvelleRegularisation = Pick<Regularisation, 'type' | 'date' | 'entree' | 'depart' | 'motif' | 'justificatif'>;

export function demanderRegularisation(user: User, d: NouvelleRegularisation): Regularisation {
  return mutate((db) => {
    const emp = employe(db, user.employeId);
    if (d.date > dateKey(serverNow())) throw new Error('Impossible de régulariser une date future.');
    if (d.depart <= d.entree) throw new Error("L'heure de départ doit être postérieure à l'heure d'entrée.");
    const r: Regularisation = {
      id: uid('rg'),
      reference: `REG-${annee()}-${String(2500 + db.regularisations.length).padStart(4, '0')}`,
      employeId: emp.id,
      ...d,
      statut: 'en_attente',
      dateDemande: serverNowISO(),
      traitePar: null,
      dateTraitement: null,
      commentaireRH: '',
    };
    db.regularisations.push(r);
    journaliser(db, acteurDe(user), 'DEMANDE_REGULARISATION', r.reference, emp.id, `${dateCourte(r.date)} • ${r.entree}-${r.depart} • ${r.motif}`);
    notifier(db, {
      pour: { role: 'rh' },
      titre: 'Régularisation à traiter',
      message: `${nomComplet(emp)} — ${dateCourte(r.date)}`,
      lien: '/rh/pointages',
      niveau: 'info',
    });
    return { ...r };
  });
}

export function deciderRegularisation(user: User, id: string, approuve: boolean, commentaire: string): void {
  mutate((db) => {
    exiger(db, user, 'presences.gerer');
    const r = db.regularisations.find((x) => x.id === id);
    if (!r || r.statut !== 'en_attente') throw new Error('Demande déjà traitée.');
    const acteur = acteurDe(user);
    const emp = employe(db, r.employeId);
    r.statut = approuve ? 'approuve' : 'refuse';
    r.traitePar = acteur.nom;
    r.dateTraitement = serverNowISO();
    r.commentaireRH = commentaire;

    if (approuve) {
      const arrivee = instant(r.date, r.entree);
      const depart = instant(r.date, r.depart);
      const p = db.pointages.find((x) => x.employeId === r.employeId && x.date === r.date);
      if (!p) {
        db.pointages.push({
          id: uid('pt'),
          employeId: r.employeId,
          date: r.date,
          arrivee,
          depart,
          pauseMinutes: 60,
          pauseDebut: null,
          source: 'regularisation',
          terminal: TERMINAUX.regularisation,
          retardMinutes: calculerRetard(arrivee, db.parametres),
          geo: null,
          geoDepart: null,
          photo: null,
          horodatage: 'serveur',
        });
      } else if (r.type === 'oubli') {
        p.arrivee = arrivee;
        p.depart = depart;
        p.pauseDebut = null;
        p.retardMinutes = calculerRetard(arrivee, db.parametres);
        p.terminal = TERMINAUX.regularisation;
      }
    }
    journaliser(db, acteur, approuve ? 'VALIDATION_REGULARISATION' : 'REFUS_REGULARISATION', r.reference, emp.id, commentaire || `${dateCourte(r.date)} • ${r.entree}-${r.depart}`);
    notifier(db, {
      pour: { employeId: emp.id },
      titre: approuve ? 'Régularisation validée' : 'Régularisation refusée',
      message: approuve ? `Pointage du ${dateCourte(r.date)} mis à jour` : commentaire || `Pointage du ${dateCourte(r.date)}`,
      lien: '/employe/pointages',
      niveau: approuve ? 'succes' : 'alerte',
    });
  });
}

/* ================= Documents ================= */

export type NouvelleDemandeDocument = Pick<DemandeDocument, 'type' | 'destinataire' | 'format' | 'commentaire' | 'mois'>;

export function demanderDocument(user: User, d: NouvelleDemandeDocument): DemandeDocument {
  return mutate((db) => {
    const emp = employe(db, user.employeId);
    const prefixe = d.type === 'attestation_salaire' ? 'AT-SAL' : d.type === 'duplicata_paie' ? 'PAIE-DUP' : d.type === 'certificat_presence' ? 'CP-PRE' : 'AT-EMP';
    const dd: DemandeDocument = {
      id: uid('dd'),
      reference: `${prefixe}-${900 + db.demandesDocuments.length}`,
      employeId: emp.id,
      ...d,
      statut: 'en_attente',
      dateDemande: serverNowISO(),
      traitePar: null,
      dateTraitement: null,
      documentId: null,
      commentaireRH: '',
    };
    db.demandesDocuments.push(dd);
    journaliser(db, acteurDe(user), 'DEMANDE_DOCUMENT', dd.reference, emp.id, `${LIBELLE_DEMANDE_DOCUMENT[d.type]} • ${d.destinataire}`);
    notifier(db, {
      pour: { role: 'rh' },
      titre: 'Demande de document',
      message: `${nomComplet(emp)} — ${LIBELLE_DEMANDE_DOCUMENT[d.type]}${d.format === 'paper' ? ' (papier)' : ''}`,
      lien: '/rh/documents',
      niveau: 'info',
    });
    return { ...dd };
  });
}

/** Mois de référence par défaut : le dernier mois complet */
export const moisReference = (): string => moisDe(ajouterJours(`${moisDe(dateKey(serverNow()))}-01`, -1));

export function traiterDemandeDocument(user: User, id: string): DocumentGenere {
  return mutate((db) => {
    exiger(db, user, 'documents.gerer');
    const dd = db.demandesDocuments.find((x) => x.id === id);
    if (!dd || dd.statut !== 'en_attente') throw new Error('Demande déjà traitée.');
    const acteur = acteurDe(user);
    const emp = employe(db, dd.employeId);
    const params: Record<string, string> = { destinataire: dd.destinataire, demande: dd.reference };
    if (MODELES_MENSUELS.includes(dd.type)) params.mois = dd.mois ?? moisReference();
    if (dd.type === 'duplicata_paie' && !lignePayee(db, emp.id, params.mois))
      throw new Error(`Aucun salaire versé à ${nomComplet(emp)} pour ${moisLong(params.mois)} : refusez la demande ou attendez le paiement de ce mois.`);
    const doc = creerDocument(db, emp, dd.type, params, acteur);
    dd.statut = 'pret';
    dd.traitePar = acteur.nom;
    dd.dateTraitement = doc.date;
    dd.documentId = doc.id;
    notifier(db, {
      pour: { employeId: emp.id },
      titre: `${LIBELLE_DEMANDE_DOCUMENT[dd.type]} prête`,
      message: dd.format === 'paper' ? 'Exemplaire papier signé à retirer au service RH' : 'Disponible dans votre coffre-fort numérique',
      lien: '/employe/documents',
      niveau: 'succes',
    });
    return { ...doc };
  });
}

export function refuserDemandeDocument(user: User, id: string, motif: string): void {
  mutate((db) => {
    exiger(db, user, 'documents.gerer');
    const dd = db.demandesDocuments.find((x) => x.id === id);
    if (!dd || dd.statut !== 'en_attente') throw new Error('Demande déjà traitée.');
    const acteur = acteurDe(user);
    dd.statut = 'refuse';
    dd.traitePar = acteur.nom;
    dd.dateTraitement = serverNowISO();
    dd.commentaireRH = motif;
    journaliser(db, acteur, 'REFUS_DOCUMENT', dd.reference, dd.employeId, motif);
    notifier(db, {
      pour: { employeId: dd.employeId },
      titre: 'Demande de document refusée',
      message: motif || LIBELLE_DEMANDE_DOCUMENT[dd.type],
      lien: '/employe/documents',
      niveau: 'alerte',
    });
  });
}

export function genererDocumentManuel(user: User, employeId: string, modele: ModeleDocument, params: Record<string, string>): DocumentGenere {
  return mutate((db) => {
    exiger(db, user, 'documents.gerer');
    const emp = employe(db, employeId);
    const doc = creerDocument(db, emp, modele, params, acteurDe(user));
    notifier(db, {
      pour: { employeId: emp.id },
      titre: 'Nouveau document disponible',
      message: doc.titre,
      lien: '/employe/documents',
      niveau: 'info',
    });
    return { ...doc };
  });
}

export function journaliserTelechargement(user: User, doc: DocumentGenere): void {
  mutate((db) => journaliser(db, acteurDe(user), 'TELECHARGEMENT_DOCUMENT', doc.reference, doc.employeId, doc.titre));
}

/** Vérifie un document par son code (SIKA-XXXX-XXXX), sa référence ou un préfixe d'empreinte */
export function verifierDocument(user: User, saisie: string): DocumentGenere | null {
  const q = saisie.trim().toLowerCase();
  if (!q) return null;
  const doc =
    getDB().documents.find(
      (d) => d.code.toLowerCase() === q || d.reference.toLowerCase() === q || (q.length >= 8 && d.empreinte.startsWith(q)),
    ) ?? null;
  mutate((db) =>
    journaliser(db, acteurDe(user), 'VERIFICATION_DOCUMENT', saisie.trim(), doc?.employeId ?? null, doc ? `Authentique • ${doc.reference}` : 'Aucun document correspondant'),
  );
  return doc;
}

/* ================= Profil & collaborateurs ================= */

export type Coordonnees = Pick<Employe, 'telPerso' | 'emailPerso' | 'adresse' | 'urgenceNom' | 'urgenceTel'>;

const LIBELLES_CHAMPS: Partial<Record<keyof Employe, string>> = {
  telPerso: 'téléphone personnel',
  emailPerso: 'email personnel',
  adresse: 'adresse',
  urgenceNom: "contact d'urgence",
  urgenceTel: "téléphone d'urgence",
  poste: 'poste',
  departement: 'département',
  contrat: 'contrat',
  categorie: 'catégorie professionnelle',
  enfantsACharge: 'enfants à charge',
  service: 'service',
  avantagesNature: 'avantages en nature',
  dirigeant: 'barème dirigeant',
  premierEmploi: 'premier emploi (VPS)',
  salaireBase: 'salaire',
  compteBancaire: 'compte bancaire',
  cnss: 'CNSS',
  ifu: 'IFU',
  npi: 'NPI',
  responsable: 'responsable',
};

function champsModifies(avant: Employe, patch: Partial<Employe>): string[] {
  return (Object.keys(patch) as (keyof Employe)[])
    .filter((k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(avant[k]))
    .map((k) => LIBELLES_CHAMPS[k] ?? k);
}

export function modifierCoordonnees(user: User, c: Coordonnees): void {
  mutate((db) => {
    const emp = employe(db, user.employeId);
    const champs = champsModifies(emp, c);
    if (champs.length === 0) return;
    Object.assign(emp, c);
    journaliser(db, acteurDe(user), 'MODIFICATION_PROFIL', nomComplet(emp), emp.id, `Champs : ${champs.join(', ')}`);
    notifier(db, {
      pour: { role: 'rh' },
      titre: 'Coordonnées mises à jour',
      message: `${nomComplet(emp)} — ${champs.join(', ')}`,
      lien: `/rh/employes/${emp.id}`,
      niveau: 'info',
    });
  });
}

export type NouvelEmploye = Omit<Employe, 'id' | 'matricule' | 'avatarUrl' | 'npiVerifie' | 'dateSortie'>;

export function creerEmploye(user: User, data: NouvelEmploye, role: Role): { employe: Employe; motDePasse: string } {
  return mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    if (role !== 'employe' && user.role !== 'admin') throw new Error('Seul un administrateur peut attribuer le rôle RH ou administrateur.');
    verifierRattachement(db, data.departement, data.service);
    const smig = controleSmig(data.salaireBase, data.heuresHebdo, data.contrat);
    if (smig) throw new Error(smig);
    const email = data.emailPro.trim().toLowerCase();
    if (db.comptes.some((c) => c.email.toLowerCase() === email)) throw new Error('Un compte existe déjà avec cet email professionnel.');
    const numeros = db.employes.map((e) => Number(e.matricule.replace(/\D/g, ''))).filter(Boolean);
    const matricule = `BN-${String(Math.max(...numeros, 4500) + 1).padStart(4, '0')}`;
    const emp: Employe = { ...data, emailPro: email, id: uid('e'), matricule, avatarUrl: '', npiVerifie: false, dateSortie: null };
    db.evolutions.push({
      id: uid('ev'),
      reference: `EV-${emp.dateEmbauche.slice(0, 4)}-${String(db.evolutions.length + 1).padStart(4, '0')}`,
      employeId: emp.id,
      type: 'embauche',
      dateEffet: emp.dateEmbauche,
      avant: null,
      apres: situationActuelle(emp),
      motif: `Embauche en ${emp.contrat}`,
      decidePar: acteurDe(user).nom,
      dateDecision: serverNowISO(),
      statut: emp.dateEmbauche <= dateKey(serverNow()) ? 'appliquee' : 'planifiee',
      documentId: null,
    });
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const motDePasse = `Sika-${Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => alphabet[n % alphabet.length]).join('')}`;
    db.employes.push(emp);
    db.comptes.push({
      id: uid('c'),
      email,
      motDePasse,
      role,
      employeId: emp.id,
      actif: true,
      tentativesEchouees: 0,
      verrouilleJusqua: null,
      derniereConnexion: null,
    });
    journaliser(db, acteurDe(user), 'CREATION_EMPLOYE', `${nomComplet(emp)} (${matricule})`, emp.id, `${emp.poste} • ${emp.departement} • rôle ${role}`);
    return { employe: { ...emp }, motDePasse };
  });
}

/** Champs modifiables uniquement par une évolution de carrière (pour garder l'historique) */
const CHAMPS_CARRIERE: (keyof Employe)[] = ['poste', 'departement', 'salaireBase', 'primesFixes'];

export function modifierEmploye(user: User, id: string, patchBrut: Partial<Employe>): void {
  const patch = { ...patchBrut };
  CHAMPS_CARRIERE.forEach((k) => delete patch[k]);
  // La date de sortie ne se modifie que par l'enregistrement d'une sortie
  delete patch.dateSortie;
  mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    const emp = employe(db, id);
    if (patch.service !== undefined) verifierRattachement(db, emp.departement, patch.service);
    if (patch.heuresHebdo !== undefined || patch.contrat !== undefined) {
      const smig = controleSmig(emp.salaireBase, patch.heuresHebdo ?? emp.heuresHebdo, patch.contrat ?? emp.contrat);
      if (smig) throw new Error(smig);
    }
    const champs = champsModifies(emp, patch);
    if (champs.length === 0) return;
    Object.assign(emp, patch);
    const compte = db.comptes.find((c) => c.employeId === id);
    if (compte && patch.emailPro) compte.email = patch.emailPro.trim().toLowerCase();
    journaliser(db, acteurDe(user), 'MODIFICATION_EMPLOYE', nomComplet(emp), emp.id, `Champs : ${champs.join(', ')}`);
    notifier(db, {
      pour: { employeId: emp.id },
      titre: 'Dossier mis à jour par les RH',
      message: champs.join(', '),
      lien: '/employe/profil',
      niveau: 'info',
    });
  });
}

export function changerAcces(user: User, employeId: string, actif: boolean): void {
  mutate((db) => {
    exiger(db, user, 'comptes.gerer');
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (!compte) throw new Error('Aucun compte associé.');
    if (compte.id === user.compteId) throw new Error('Vous ne pouvez pas désactiver votre propre accès.');
    exigerSurCompte(user, compte);
    if (!actif && compte.role === 'admin' && db.comptes.filter((c) => c.role === 'admin' && c.actif).length <= 1)
      throw new Error('Impossible : il doit rester au moins un administrateur actif.');
    compte.actif = actif;
    if (actif) {
      compte.verrouilleJusqua = null;
      compte.tentativesEchouees = 0;
    }
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), actif ? 'ACTIVATION_COMPTE' : 'DESACTIVATION_COMPTE', compte.email, emp.id, nomComplet(emp));
  });
}

export function deverrouillerCompte(user: User, employeId: string): void {
  mutate((db) => {
    exiger(db, user, 'comptes.gerer');
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (!compte) throw new Error('Aucun compte associé.');
    exigerSurCompte(user, compte);
    compte.verrouilleJusqua = null;
    compte.tentativesEchouees = 0;
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), 'DEVERROUILLAGE_COMPTE', compte.email, emp.id, nomComplet(emp));
    notifier(db, {
      pour: { employeId },
      titre: 'Compte déverrouillé',
      message: 'Le service RH a rétabli votre accès. Vous pouvez vous reconnecter.',
      niveau: 'info',
    });
  });
}

/** Génère un mot de passe temporaire (affiché une seule fois au RH) */
export function reinitialiserMotDePasse(user: User, employeId: string): { email: string; motDePasse: string } {
  return mutate((db) => {
    exiger(db, user, 'comptes.gerer');
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (!compte) throw new Error('Aucun compte associé.');
    if (compte.id === user.compteId) throw new Error('Utilisez la procédure « Mot de passe oublié » pour votre propre compte.');
    exigerSurCompte(user, compte);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const aleatoire = crypto.getRandomValues(new Uint32Array(10));
    const motDePasse = `Sika-${Array.from(aleatoire, (n) => alphabet[n % alphabet.length]).join('')}`;
    compte.motDePasse = motDePasse;
    compte.verrouilleJusqua = null;
    compte.tentativesEchouees = 0;
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), 'REINITIALISATION_MOT_DE_PASSE', compte.email, emp.id, 'Mot de passe temporaire généré');
    return { email: compte.email, motDePasse };
  });
}

export function consulterDonneesSensibles(user: User, employeId: string): void {
  mutate((db) => {
    exiger(db, user, 'donnees_sensibles.consulter');
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), 'CONSULTATION_DONNEES_SENSIBLES', nomComplet(emp), emp.id, 'Affichage CNSS, IFU, NPI, compte bancaire et salaire');
  });
}

/* ================= Rapports & paramètres ================= */

export function journaliserExport(user: User, rapport: string, format: 'CSV' | 'PDF', lignes: number): void {
  mutate((db) => journaliser(db, acteurDe(user), 'EXPORT_RAPPORT', rapport, null, `${format} • ${lignes} ligne(s)`));
}

export function modifierParametres(user: User, p: Parametres): void {
  mutate((db) => {
    exiger(db, user, 'parametres.gerer');
    const avant = db.parametres;
    const changes = (Object.keys(p) as (keyof Parametres)[])
      .filter((k) => JSON.stringify(p[k]) !== JSON.stringify(avant[k]))
      .map((k) => k);
    if (changes.length === 0) return;
    db.parametres = p;
    journaliser(db, acteurDe(user), 'MODIFICATION_PARAMETRES', 'Paramètres RH', null, `Modifiés : ${changes.join(', ')}`);
  });
}

/* ================= Carrière ================= */

export interface NouvelleEvolution {
  type: Exclude<TypeEvolution, 'embauche'>;
  dateEffet: string;
  apres: SituationContractuelle;
  motif: string;
}

function appliquer(db: Database, ev: EvolutionCarriere) {
  const emp = employe(db, ev.employeId);
  // Une mutation vers un autre département détache le collaborateur de son service
  if (ev.apres.departement !== emp.departement) emp.service = '';
  Object.assign(emp, { ...ev.apres, primesFixes: ev.apres.primesFixes.map((p) => ({ ...p })) });
  ev.statut = 'appliquee';
}

/** Promotion, augmentation, mutation ou reclassement : historisé, avenant PDF généré, collaborateur notifié */
export function enregistrerEvolution(user: User, employeId: string, d: NouvelleEvolution): EvolutionCarriere {
  return mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    const emp = employe(db, employeId);
    const acteur = acteurDe(user);
    const today = dateKey(serverNow());
    if (d.dateEffet < emp.dateEmbauche) throw new Error("La date d'effet précède la date d'embauche.");
    // Une paie déjà versée ne peut pas être modifiée rétroactivement
    const payee = db.campagnesPaie.find((c) => c.statut === 'payee' && c.mois >= moisDe(d.dateEffet));
    if (payee) throw new Error(`La paie de ${moisLong(payee.mois)} est déjà versée : choisissez une date d'effet postérieure.`);
    if (db.evolutions.some((e) => e.employeId === employeId && e.statut === 'planifiee' && e.dateEffet === d.dateEffet))
      throw new Error('Une évolution est déjà planifiée à cette date pour ce collaborateur.');
    if (d.apres.salaireBase <= 0) throw new Error('Le salaire de base doit être positif.');
    const smig = controleSmig(d.apres.salaireBase, emp.heuresHebdo, emp.contrat);
    if (smig) throw new Error(smig);
    verifierRattachement(db, d.apres.departement, '');

    const ev: EvolutionCarriere = {
      id: uid('ev'),
      reference: `EV-${today.slice(0, 4)}-${String(db.evolutions.length + 1).padStart(4, '0')}`,
      employeId,
      type: d.type,
      dateEffet: d.dateEffet,
      avant: situationActuelle(emp),
      apres: d.apres,
      motif: d.motif,
      decidePar: acteur.nom,
      dateDecision: serverNowISO(),
      statut: 'planifiee',
      documentId: null,
    };
    db.evolutions.push(ev);
    if (d.dateEffet <= today) appliquer(db, ev);

    const doc = creerDocument(
      db,
      emp,
      'avenant',
      { evolutionId: ev.id, typeLibelle: LIBELLE_EVOLUTION[d.type], dateEffet: dateCourte(d.dateEffet), poste: d.apres.poste },
      acteur,
    );
    ev.documentId = doc.id;
    const avant = ev.avant!;
    const hausse = avant.salaireBase ? ((d.apres.salaireBase - avant.salaireBase) / avant.salaireBase) * 100 : 0;
    journaliser(
      db,
      acteur,
      'EVOLUTION_CARRIERE',
      `${nomComplet(emp)} — ${LIBELLE_EVOLUTION[d.type]}`,
      emp.id,
      `${avant.poste} → ${d.apres.poste} • ${fcfa(avant.salaireBase)} → ${fcfa(d.apres.salaireBase)}${hausse ? ` (${hausse > 0 ? '+' : ''}${hausse.toFixed(1)} %)` : ''} • effet ${dateCourte(d.dateEffet)}`,
    );
    notifier(db, {
      pour: { employeId: emp.id },
      titre: d.type === 'promotion' ? 'Félicitations pour votre promotion !' : `${LIBELLE_EVOLUTION[d.type]} enregistrée`,
      message: `${d.apres.poste} • à compter du ${dateMoisLong(d.dateEffet).replace(/^0/, '')}. Avenant disponible dans vos documents.`,
      lien: '/employe/documents',
      niveau: 'succes',
    });
    return { ...ev };
  });
}

/** Applique les évolutions planifiées dont la date d'effet est atteinte (exécuté à l'ouverture de l'application) */
export function appliquerEvolutionsEchues(): number {
  const today = dateKey(serverNow());
  const echues = getDB().evolutions.filter((e) => e.statut === 'planifiee' && e.dateEffet <= today);
  if (echues.length === 0) return 0;
  return mutate((db) => {
    db.evolutions
      .filter((e) => e.statut === 'planifiee' && e.dateEffet <= today)
      .sort((a, b) => a.dateEffet.localeCompare(b.dateEffet))
      .forEach((ev) => {
        appliquer(db, ev);
        const emp = employe(db, ev.employeId);
        journaliser(db, SYSTEME, 'APPLICATION_EVOLUTION', `${nomComplet(emp)} — ${LIBELLE_EVOLUTION[ev.type]}`, emp.id, `Effet au ${dateCourte(ev.dateEffet)} : ${ev.apres.poste}, ${fcfa(ev.apres.salaireBase)}`);
        notifier(db, {
          pour: { role: 'rh' },
          titre: 'Évolution appliquée',
          message: `${nomComplet(emp)} — ${ev.apres.poste} (${fcfa(ev.apres.salaireBase)})`,
          lien: `/rh/employes/${emp.id}`,
          niveau: 'info',
        });
      });
    return echues.length;
  });
}

/* ================= Paie ================= */

function calculerLignes(db: Database, mois: string, anciennes: CampagnePaie['lignes'] = []) {
  const todayKey = dateKey(serverNow());
  // Les indemnités de sortie du mois sont recalculées avec les dernières paies versées
  db.sorties
    .filter((x) => x.statut !== 'annulee' && moisDe(x.dateSortie) === mois)
    .forEach((x) => actualiserCalculSortie(db, x, todayKey));
  return employesAPayer(db, mois)
    .map((e) => calculerLignePaie(db, e, mois, { todayKey, elements: anciennes.find((l) => l.employeId === e.id)?.elements ?? [] }))
    .filter((l): l is NonNullable<typeof l> => l !== null);
}

const campagne = (db: Database, id: string): CampagnePaie => {
  const c = db.campagnesPaie.find((x) => x.id === id);
  if (!c) throw new Error('Campagne de paie introuvable.');
  return c;
};

export function preparerPaie(user: User, mois: string): CampagnePaie {
  return mutate((db) => {
    exiger(db, user, 'paie.gerer');
    if (mois > moisDe(dateKey(serverNow()))) throw new Error('Impossible de préparer la paie d’un mois futur.');
    if (campagneDuMois(db, mois)) throw new Error(`La paie de ${moisLong(mois)} existe déjà.`);
    const c: CampagnePaie = {
      id: uid('pay'),
      reference: `PAIE-${mois}`,
      mois,
      statut: 'brouillon',
      lignes: calculerLignes(db, mois),
      creePar: acteurDe(user).nom,
      dateCreation: serverNowISO(),
      dateCalcul: serverNowISO(),
      valideePar: null,
      dateValidation: null,
      payeePar: null,
      datePaiement: null,
      modePaiement: null,
    };
    db.campagnesPaie.push(c);
    const t = totaux(c.lignes);
    journaliser(db, acteurDe(user), 'PREPARATION_PAIE', c.reference, null, `${t.effectif} salarié(s) • brut ${fcfa(t.brut)} • net ${fcfa(t.net)}`);
    return structuredClone(c);
  });
}

/** Recalcule une paie en préparation (pointages, congés, évolutions à jour), en conservant les éléments variables */
export function recalculerPaie(user: User, id: string): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'brouillon') throw new Error('Seule une paie en préparation peut être recalculée.');
    c.lignes = calculerLignes(db, c.mois, c.lignes);
    c.dateCalcul = serverNowISO();
    journaliser(db, acteurDe(user), 'MODIFICATION_PAIE', c.reference, null, 'Recalcul complet');
  });
}

export function ajouterElementVariable(user: User, id: string, employeId: string, el: Omit<ElementVariable, 'id'>): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'brouillon') throw new Error('La paie est verrouillée.');
    const ancienne = c.lignes.find((l) => l.employeId === employeId);
    if (!ancienne) throw new Error('Collaborateur absent de cette paie.');
    const elements = [...ancienne.elements, { ...el, id: uid('el') }];
    const nouvelle = calculerLignePaie(db, employe(db, employeId), c.mois, { todayKey: dateKey(serverNow()), elements });
    if (nouvelle) c.lignes = c.lignes.map((l) => (l.employeId === employeId ? nouvelle : l));
    journaliser(db, acteurDe(user), 'MODIFICATION_PAIE', c.reference, employeId, `${el.nature === 'prime' ? 'Prime' : 'Retenue'} « ${el.libelle} » ${fcfa(el.montant)}`);
  });
}

export function supprimerElementVariable(user: User, id: string, employeId: string, elementId: string): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'brouillon') throw new Error('La paie est verrouillée.');
    const ancienne = c.lignes.find((l) => l.employeId === employeId);
    const el = ancienne?.elements.find((x) => x.id === elementId);
    if (!ancienne || !el) return;
    const nouvelle = calculerLignePaie(db, employe(db, employeId), c.mois, { todayKey: dateKey(serverNow()), elements: ancienne.elements.filter((x) => x.id !== elementId) });
    if (nouvelle) c.lignes = c.lignes.map((l) => (l.employeId === employeId ? nouvelle : l));
    journaliser(db, acteurDe(user), 'MODIFICATION_PAIE', c.reference, employeId, `Suppression « ${el.libelle} »`);
  });
}

export function validerPaie(user: User, id: string): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'brouillon') throw new Error('Cette paie est déjà validée.');
    if (c.lignes.some((l) => l.net < 0)) throw new Error('Un net à payer est négatif : corrigez les retenues avant validation.');
    c.statut = 'validee';
    c.valideePar = acteurDe(user).nom;
    c.dateValidation = serverNowISO();
    const t = totaux(c.lignes);
    journaliser(db, acteurDe(user), 'VALIDATION_PAIE', c.reference, null, `Net total ${fcfa(t.net)} • coût employeur ${fcfa(t.coutEmployeur)}`);
  });
}

export function rouvrirPaie(user: User, id: string, motif: string): void {
  mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'validee') throw new Error('Seule une paie validée et non versée peut être rouverte.');
    c.statut = 'brouillon';
    c.valideePar = null;
    c.dateValidation = null;
    journaliser(db, acteurDe(user), 'REOUVERTURE_PAIE', c.reference, null, motif);
  });
}

/**
 * Enregistre le versement des salaires : chaque collaborateur reçoit automatiquement
 * son bulletin de paie certifié dans son coffre-fort, avec une notification.
 */
export function payerSalaires(user: User, id: string, datePaiement: string, modePaiement: string): number {
  return mutate((db) => {
    exiger(db, user, 'paie.gerer');
    const c = campagne(db, id);
    if (c.statut !== 'validee') throw new Error('La paie doit être validée avant le versement.');
    const acteur = acteurDe(user);
    c.statut = 'payee';
    c.payeePar = acteur.nom;
    c.datePaiement = instant(datePaiement, heureHM(serverNow()));
    c.modePaiement = modePaiement;
    c.lignes.forEach((l) => {
      const emp = employe(db, l.employeId);
      creerDocument(db, emp, 'bulletin_paie', { mois: c.mois, campagneId: c.id, net: fcfa(l.net), datePaiement: `payé le ${dateCourte(datePaiement)}` }, { ...acteur, nom: 'Système (paie)' });
      // Dernière paie d'un collaborateur sorti : reçu pour solde de tout compte (non libératoire, CT art. 225)
      const sortie = db.sorties.find((x) => x.employeId === emp.id && x.statut !== 'annulee' && moisDe(x.dateSortie) === c.mois);
      if (sortie) {
        const recu = creerDocument(db, emp, 'solde_tout_compte', { sortieId: sortie.id, campagneId: c.id, mois: c.mois, net: fcfa(l.net) }, { ...acteur, nom: 'Système (paie)' });
        sortie.soldeId = recu.id;
      }
      notifier(db, {
        pour: { employeId: emp.id },
        titre: 'Bulletin de paie disponible',
        message: `${moisLong(c.mois)} • net versé ${fcfa(l.net)} le ${dateCourte(datePaiement)}`,
        lien: '/employe/documents',
        niveau: 'succes',
      });
    });
    const t = totaux(c.lignes);
    journaliser(db, acteur, 'PAIEMENT_SALAIRES', c.reference, null, `${t.effectif} bulletin(s) distribué(s) • net ${fcfa(t.net)} • ${modePaiement} du ${dateCourte(datePaiement)}`);
    return c.lignes.length;
  });
}

/* ================= Sortie du salarié ================= */

export interface NouvelleSortie extends SaisieSortie {
  observations: string;
}

/** Recalcule les droits d'une sortie (salaire moyen, congés, indemnités) à partir des données à jour */
function actualiserCalculSortie(db: Database, sortie: Sortie, todayKey: string): void {
  const emp = employe(db, sortie.employeId);
  const calc = calculerSortie(db, { ...emp, dateSortie: null }, sortie, todayKey);
  Object.assign(sortie, {
    dateFinPreavis: calc.dateFinPreavis,
    salaireMoyen: calc.salaireMoyen,
    ancienneteAnnees: calc.ancienneteAnnees,
    joursCongesRestants: calc.joursCongesRestants,
    rubriques: calc.rubriques,
    montantDuParSalarie: calc.montantDuParSalarie,
  });
}

/** Sortie effective : accès désactivé, certificat de travail délivré (CT art. 62) */
function rendreSortieEffective(db: Database, sortie: Sortie, acteur: Acteur): void {
  const emp = employe(db, sortie.employeId);
  sortie.statut = 'effective';
  const compte = db.comptes.find((c) => c.employeId === emp.id);
  if (compte) compte.actif = false;
  const certificat = creerDocument(db, emp, 'certificat_travail', { sortieId: sortie.id, dateSortie: dateCourte(sortie.dateSortie) }, acteur);
  sortie.certificatId = certificat.id;
  journaliser(db, acteur, 'APPLICATION_SORTIE', nomComplet(emp), emp.id, `${MOTIFS_SORTIE[sortie.motif].libelle} • dernier jour ${dateCourte(sortie.dateSortie)} • accès désactivé, certificat ${certificat.reference}`);
  notifier(db, {
    pour: { role: 'rh' },
    titre: 'Sortie effective',
    message: `${nomComplet(emp)} — certificat de travail ${certificat.reference} à remettre`,
    lien: `/rh/employes/${emp.id}`,
    niveau: 'info',
  });
}

export function enregistrerSortie(user: User, employeId: string, d: NouvelleSortie): Sortie {
  return mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    const emp = employe(db, employeId);
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (employeId === user.employeId) throw new Error('Vous ne pouvez pas enregistrer votre propre sortie.');
    if (compte) exigerSurCompte(user, compte);
    if (compte?.role === 'admin' && db.comptes.filter((c) => c.role === 'admin' && c.actif).length <= 1)
      throw new Error('Impossible : il doit rester au moins un administrateur actif.');
    if (db.sorties.some((x) => x.employeId === employeId && x.statut !== 'annulee')) throw new Error('Une sortie est déjà enregistrée pour ce collaborateur.');
    if (d.dateSortie < emp.dateEmbauche) throw new Error("La date de sortie précède la date d'embauche.");
    if (d.dateNotification > d.dateSortie) throw new Error('La notification doit précéder ou coïncider avec la date de sortie.');
    const verrouillee = db.campagnesPaie.find((c) => c.statut !== 'brouillon' && c.mois >= moisDe(d.dateSortie));
    if (verrouillee) throw new Error(`La paie de ${moisLong(verrouillee.mois)} est déjà validée : la sortie doit intervenir après ce mois.`);
    const regle = MOTIFS_SORTIE[d.motif];
    // Aucun licenciement pendant la grossesse ou le congé de maternité, hors faute lourde non liée à la grossesse (CT art. 171)
    const protegee = regle.initiative === 'employeur' && d.motif !== 'faute_lourde' ? materniteProtegee(db, employeId, d.dateNotification, d.dateSortie) : undefined;
    if (protegee)
      throw new Error(`Licenciement interdit : congé de maternité du ${dateCourte(protegee.debut)} au ${dateCourte(protegee.fin)} (CT art. 171, dommages et intérêts d'au moins 12 mois de salaire, art. 172).`);
    if (regle.preavis && d.preavis === 'sans_objet') throw new Error('Précisez comment le préavis est exécuté.');
    const today = dateKey(serverNow());
    const calc = calculerSortie(db, emp, d, today);
    const acteur = acteurDe(user);
    const sortie: Sortie = {
      id: uid('so'),
      reference: `SO-${d.dateSortie.slice(0, 4)}-${String(db.sorties.length + 1).padStart(4, '0')}`,
      employeId,
      motif: d.motif,
      dateNotification: d.dateNotification,
      dateSortie: d.dateSortie,
      preavis: regle.preavis ? d.preavis : 'sans_objet',
      joursLiberteNonUtilises: d.joursLiberteNonUtilises ?? 0,
      dateFinPreavis: calc.dateFinPreavis,
      salaireMoyen: calc.salaireMoyen,
      ancienneteAnnees: calc.ancienneteAnnees,
      joursCongesRestants: calc.joursCongesRestants,
      rubriques: calc.rubriques,
      montantDuParSalarie: calc.montantDuParSalarie,
      observations: d.observations.trim(),
      statut: 'planifiee',
      creePar: acteur.nom,
      dateCreation: serverNowISO(),
      certificatId: null,
      soldeId: null,
    };
    db.sorties.push(sortie);
    emp.dateSortie = d.dateSortie;

    // Demandes et évolutions postérieures à la sortie : sans objet
    db.conges
      .filter((c) => c.employeId === employeId && c.statut !== 'refuse' && c.debut > d.dateSortie)
      .forEach((c) => {
        c.statut = 'refuse';
        c.traitePar = acteur.nom;
        c.dateTraitement = serverNowISO();
        c.commentaireRH = `Sans objet : sortie du collaborateur le ${dateCourte(d.dateSortie)}`;
      });
    db.evolutions = db.evolutions.filter((ev) => !(ev.employeId === employeId && ev.statut === 'planifiee' && ev.dateEffet > d.dateSortie));

    journaliser(db, acteur, 'SORTIE_EMPLOYE', sortie.reference, emp.id, `${regle.libelle} • notifiée le ${dateCourte(d.dateNotification)} • dernier jour ${dateCourte(d.dateSortie)} • indemnités ${fcfa(calc.total)}`);
    // Une paie en préparation du mois de sortie est recalculée immédiatement
    const brouillon = db.campagnesPaie.find((c) => c.statut === 'brouillon' && c.mois === moisDe(d.dateSortie));
    if (brouillon) brouillon.lignes = calculerLignes(db, brouillon.mois, brouillon.lignes);
    if (d.dateSortie < today) rendreSortieEffective(db, sortie, acteur);
    return { ...sortie };
  });
}

/** Annulation possible tant que la sortie n'est pas effective */
export function annulerSortie(user: User, sortieId: string, motif: string): void {
  mutate((db) => {
    exiger(db, user, 'collaborateurs.gerer');
    const sortie = db.sorties.find((x) => x.id === sortieId);
    if (!sortie || sortie.statut === 'annulee') throw new Error('Sortie introuvable.');
    if (sortie.statut === 'effective') throw new Error('La sortie est effective : un retour dans l’entreprise nécessite une nouvelle embauche.');
    if (!motif.trim()) throw new Error("Indiquez le motif de l'annulation.");
    const emp = employe(db, sortie.employeId);
    sortie.statut = 'annulee';
    emp.dateSortie = null;
    const brouillon = db.campagnesPaie.find((c) => c.statut === 'brouillon' && c.mois === moisDe(sortie.dateSortie));
    if (brouillon) brouillon.lignes = calculerLignes(db, brouillon.mois, brouillon.lignes);
    journaliser(db, acteurDe(user), 'ANNULATION_SORTIE', sortie.reference, emp.id, motif.trim());
  });
}

/** Rend effectives les sorties dont le dernier jour est passé (appelé au chargement de l'application) */
export function appliquerSortiesEchues(): number {
  const today = dateKey(serverNow());
  if (!getDB().sorties.some((x) => x.statut === 'planifiee' && x.dateSortie < today)) return 0;
  return mutate((db) => {
    const echues = db.sorties.filter((x) => x.statut === 'planifiee' && x.dateSortie < today);
    echues.forEach((x) => rendreSortieEffective(db, x, SYSTEME));
    return echues.length;
  });
}

/* ================= Organisation : départements & services ================= */

export interface DonneesDepartement {
  code: string;
  nom: string;
  description: string;
  responsableId: string | null;
}

const normaliserNom = (s: string) => s.trim().replace(/\s+/g, ' ');

function controlerDepartement(db: Database, d: DonneesDepartement, id: string | null): DonneesDepartement {
  const propre = { ...d, code: d.code.trim().toUpperCase(), nom: normaliserNom(d.nom), description: d.description.trim() };
  if (!propre.nom) throw new Error('Le nom du département est obligatoire.');
  if (!/^[A-Z0-9]{2,6}$/.test(propre.code)) throw new Error('Le code comporte 2 à 6 lettres ou chiffres (ex. RH, FIN).');
  const autres = db.departements.filter((x) => x.id !== id);
  if (autres.some((x) => x.nom.toLowerCase() === propre.nom.toLowerCase())) throw new Error(`Un département « ${propre.nom} » existe déjà.`);
  if (autres.some((x) => x.code === propre.code)) throw new Error(`Le code ${propre.code} est déjà utilisé.`);
  if (propre.responsableId) employe(db, propre.responsableId);
  return propre;
}

export function creerDepartement(user: User, d: DonneesDepartement): Departement {
  return mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const propre = controlerDepartement(db, d, null);
    const dep: Departement = { id: uid('dep'), ...propre, services: [], dateCreation: serverNowISO() };
    db.departements.push(dep);
    journaliser(db, acteurDe(user), 'CREATION_DEPARTEMENT', `${dep.nom} (${dep.code})`, null, dep.description || 'Nouveau département');
    return { ...dep };
  });
}

/** Renommer un département met à jour les dossiers rattachés et les mutations planifiées (l'historique reste inchangé) */
export function modifierDepartement(user: User, id: string, d: DonneesDepartement): void {
  mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = db.departements.find((x) => x.id === id);
    if (!dep) throw new Error('Département introuvable.');
    const propre = controlerDepartement(db, d, id);
    const ancien = dep.nom;
    const changes = (['code', 'nom', 'description', 'responsableId'] as const).filter((k) => dep[k] !== propre[k]);
    if (changes.length === 0) return;
    Object.assign(dep, propre);
    let dossiers = 0;
    if (ancien !== dep.nom) {
      db.employes.filter((e) => e.departement === ancien).forEach((e) => {
        e.departement = dep.nom;
        dossiers += 1;
      });
      db.evolutions.filter((ev) => ev.statut === 'planifiee' && ev.apres.departement === ancien).forEach((ev) => (ev.apres.departement = dep.nom));
    }
    journaliser(
      db,
      acteurDe(user),
      'MODIFICATION_DEPARTEMENT',
      dep.nom,
      null,
      `Modifiés : ${changes.join(', ')}${ancien !== dep.nom ? ` • ancien nom « ${ancien} », ${dossiers} dossier(s) mis à jour` : ''}`,
    );
  });
}

export function supprimerDepartement(user: User, id: string): void {
  mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = db.departements.find((x) => x.id === id);
    if (!dep) throw new Error('Département introuvable.');
    const today = dateKey(serverNow());
    const rattaches = db.employes.filter((e) => e.departement === dep.nom && !estSorti(e, today)).length;
    if (rattaches) throw new Error(`${rattaches} collaborateur(s) sont rattachés à ${dep.nom} : mutez-les vers un autre département avant de le supprimer.`);
    if (db.evolutions.some((ev) => ev.statut === 'planifiee' && ev.apres.departement === dep.nom))
      throw new Error(`Une mutation planifiée vise ${dep.nom} : annulez-la ou modifiez-la d'abord.`);
    db.departements = db.departements.filter((x) => x.id !== id);
    journaliser(db, acteurDe(user), 'SUPPRESSION_DEPARTEMENT', `${dep.nom} (${dep.code})`, null, `${dep.services.length} service(s) supprimé(s)`);
  });
}

export interface DonneesService {
  nom: string;
  responsableId: string | null;
}

function departementDe(db: Database, id: string): Departement {
  const dep = db.departements.find((x) => x.id === id);
  if (!dep) throw new Error('Département introuvable.');
  return dep;
}

function controlerService(dep: Departement, d: DonneesService, id: string | null): DonneesService {
  const nom = normaliserNom(d.nom);
  if (!nom) throw new Error('Le nom du service est obligatoire.');
  if (dep.services.some((x) => x.id !== id && x.nom.toLowerCase() === nom.toLowerCase())) throw new Error(`Le service « ${nom} » existe déjà dans ${dep.nom}.`);
  return { nom, responsableId: d.responsableId };
}

export function ajouterService(user: User, departementId: string, d: DonneesService): void {
  mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = departementDe(db, departementId);
    const propre = controlerService(dep, d, null);
    if (propre.responsableId) employe(db, propre.responsableId);
    dep.services.push({ id: uid('srv'), ...propre });
    journaliser(db, acteurDe(user), 'CREATION_DEPARTEMENT', `${dep.nom} › ${propre.nom}`, null, 'Nouveau service');
  });
}

export function modifierService(user: User, departementId: string, serviceId: string, d: DonneesService): void {
  mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = departementDe(db, departementId);
    const srv = dep.services.find((x) => x.id === serviceId);
    if (!srv) throw new Error('Service introuvable.');
    const propre = controlerService(dep, d, serviceId);
    if (propre.responsableId) employe(db, propre.responsableId);
    const ancien = srv.nom;
    if (ancien === propre.nom && srv.responsableId === propre.responsableId) return;
    Object.assign(srv, propre);
    let dossiers = 0;
    if (ancien !== srv.nom)
      db.employes.filter((e) => e.departement === dep.nom && e.service === ancien).forEach((e) => {
        e.service = srv.nom;
        dossiers += 1;
      });
    journaliser(db, acteurDe(user), 'MODIFICATION_DEPARTEMENT', `${dep.nom} › ${srv.nom}`, null, ancien !== srv.nom ? `Renommé (ancien : « ${ancien} »), ${dossiers} dossier(s) mis à jour` : 'Responsable modifié');
  });
}

/** Les collaborateurs du service restent dans le département, sans service */
export function supprimerService(user: User, departementId: string, serviceId: string): number {
  return mutate((db) => {
    exiger(db, user, 'organisation.gerer');
    const dep = departementDe(db, departementId);
    const srv = dep.services.find((x) => x.id === serviceId);
    if (!srv) throw new Error('Service introuvable.');
    const membres = db.employes.filter((e) => e.departement === dep.nom && e.service === srv.nom);
    membres.forEach((e) => (e.service = ''));
    dep.services = dep.services.filter((x) => x.id !== serviceId);
    journaliser(db, acteurDe(user), 'SUPPRESSION_DEPARTEMENT', `${dep.nom} › ${srv.nom}`, null, `${membres.length} collaborateur(s) rattaché(s) directement au département`);
    return membres.length;
  });
}

/* ================= Rôles & permissions ================= */

/** Attribution d'un rôle : réservée à l'administrateur, jamais sur son propre compte */
export function changerRole(user: User, employeId: string, role: Role, motif: string): void {
  mutate((db) => {
    if (user.role !== 'admin') throw new Error('Seul un administrateur peut modifier les rôles.');
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (!compte) throw new Error('Aucun compte associé.');
    if (compte.id === user.compteId) throw new Error('Vous ne pouvez pas modifier votre propre rôle.');
    if (compte.role === role) return;
    if (compte.role === 'admin' && db.comptes.filter((c) => c.role === 'admin' && c.actif).length <= 1)
      throw new Error('Impossible : il doit rester au moins un administrateur actif.');
    if (!motif.trim()) throw new Error('Indiquez le motif du changement de rôle.');
    const ancien = compte.role;
    compte.role = role;
    const emp = employe(db, employeId);
    journaliser(db, acteurDe(user), 'CHANGEMENT_ROLE', compte.email, emp.id, `${LIBELLE_ROLE_LONG[ancien]} → ${LIBELLE_ROLE_LONG[role]} • ${motif.trim()}`);
    notifier(db, {
      pour: { employeId },
      titre: 'Vos droits d’accès ont changé',
      message: `Nouveau rôle : ${LIBELLE_ROLE_LONG[role]}. Reconnectez-vous si l’affichage ne se met pas à jour.`,
      niveau: 'info',
    });
  });
}

/** Matrice des droits du rôle RH (l'admin conserve toujours tous les droits) */
export function modifierPermissions(user: User, role: Role, permissions: Permission[]): void {
  mutate((db) => {
    if (user.role !== 'admin') throw new Error('Seul un administrateur peut modifier les permissions.');
    if (role !== 'rh') throw new Error('Seules les permissions du rôle RH sont paramétrables.');
    const avant = new Set(db.permissions.rh);
    const apres = new Set(permissions.filter((p) => TOUTES_PERMISSIONS.includes(p)));
    const ajoutees = [...apres].filter((p) => !avant.has(p));
    const retirees = [...avant].filter((p) => !apres.has(p));
    if (ajoutees.length + retirees.length === 0) return;
    db.permissions.rh = TOUTES_PERMISSIONS.filter((p) => apres.has(p));
    journaliser(
      db,
      acteurDe(user),
      'MODIFICATION_PERMISSIONS',
      'Rôle RH',
      null,
      [ajoutees.length ? `Accordées : ${ajoutees.map((p) => LIBELLE_PERMISSION[p]).join(', ')}` : '', retirees.length ? `Retirées : ${retirees.map((p) => LIBELLE_PERMISSION[p]).join(', ')}` : '']
        .filter(Boolean)
        .join(' • '),
    );
    notifier(db, { pour: { role: 'rh' }, titre: 'Vos droits de gestion ont été modifiés', message: "L'administrateur a mis à jour les permissions du rôle RH.", niveau: 'info' });
  });
}

/* ================= Suppression d'un collaborateur ================= */

/**
 * Motifs empêchant la suppression : les bulletins, documents et registres de présence doivent être conservés.
 * La suppression est réservée aux dossiers créés par erreur ; sinon, désactiver l'accès.
 */
export function motifsBlocageSuppression(db: Database, employeId: string): string[] {
  const motifs: string[] = [];
  const paies = db.campagnesPaie.filter((c) => c.lignes.some((l) => l.employeId === employeId)).length;
  if (paies) motifs.push(`${paies} paie(s) calculée(s) ou versée(s)`);
  const docs = db.documents.filter((d) => d.employeId === employeId).length;
  if (docs) motifs.push(`${docs} document(s) certifié(s)`);
  const pointages = db.pointages.filter((p) => p.employeId === employeId).length;
  if (pointages) motifs.push(`${pointages} pointage(s) au registre de présence`);
  const conges = db.conges.filter((c) => c.employeId === employeId && c.statut === 'approuve').length;
  if (conges) motifs.push(`${conges} absence(s) validée(s)`);
  if (db.evolutions.some((ev) => ev.employeId === employeId && ev.type !== 'embauche' && ev.statut === 'appliquee')) motifs.push('des évolutions de carrière appliquées');
  return motifs;
}

export function supprimerEmploye(user: User, employeId: string, motif: string): void {
  mutate((db) => {
    exiger(db, user, 'collaborateurs.supprimer');
    const emp = employe(db, employeId);
    const compte = db.comptes.find((c) => c.employeId === employeId);
    if (compte?.id === user.compteId) throw new Error('Vous ne pouvez pas supprimer votre propre dossier.');
    if (compte) exigerSurCompte(user, compte);
    if (compte?.role === 'admin' && db.comptes.filter((c) => c.role === 'admin' && c.actif).length <= 1)
      throw new Error('Impossible : il doit rester au moins un administrateur actif.');
    const blocages = motifsBlocageSuppression(db, employeId);
    if (blocages.length) throw new Error(`Suppression impossible (${blocages.join(', ')}) : ces données doivent être conservées. Désactivez plutôt l'accès.`);
    if (!motif.trim()) throw new Error('Indiquez le motif de la suppression.');
    db.employes = db.employes.filter((e) => e.id !== employeId);
    db.comptes = db.comptes.filter((c) => c.employeId !== employeId);
    db.evolutions = db.evolutions.filter((ev) => ev.employeId !== employeId);
    db.conges = db.conges.filter((c) => c.employeId !== employeId);
    db.regularisations = db.regularisations.filter((r) => r.employeId !== employeId);
    db.demandesDocuments = db.demandesDocuments.filter((d) => d.employeId !== employeId);
    db.notifications = db.notifications.filter((n) => n.pour.employeId !== employeId);
    db.departements.forEach((d) => {
      if (d.responsableId === employeId) d.responsableId = null;
      d.services.forEach((x) => {
        if (x.responsableId === employeId) x.responsableId = null;
      });
    });
    // L'entrée d'audit est conservée (traçabilité), sans lien vers un dossier qui n'existe plus
    journaliser(db, acteurDe(user), 'SUPPRESSION_EMPLOYE', `${nomComplet(emp)} (${emp.matricule})`, null, motif.trim());
  });
}

/* ================= Absences justifiées / non justifiées ================= */

export interface Justification {
  type: Exclude<DemandeConge['type'], 'rtt'>;
  motifPermission?: DemandeConge['motifPermission'];
  motif: string;
  justificatif: string | null;
}

/** Transforme une absence non justifiée en absence autorisée (congé validé a posteriori) */
export function justifierAbsence(user: User, employeId: string, debut: string, fin: string, j: Justification): DemandeConge {
  return mutate((db) => {
    exiger(db, user, 'absences.gerer');
    exiger(db, user, j.type === 'permission' ? 'permissions.valider' : 'conges.valider');
    const emp = employe(db, employeId);
    const today = dateKey(serverNow());
    if (fin < debut) throw new Error('La date de fin précède la date de début.');
    if (fin > today) throw new Error('Seules les absences passées ou du jour peuvent être justifiées.');
    if (debut < emp.dateEmbauche) throw new Error("La période commence avant la date d'embauche.");
    if (db.conges.some((c) => c.employeId === employeId && c.statut !== 'refuse' && c.debut <= fin && debut <= c.fin))
      throw new Error('Une demande d’absence existe déjà sur cette période : traitez-la depuis la page Congés.');
    const pointee = db.pointages.find((p) => p.employeId === employeId && p.date >= debut && p.date <= fin);
    if (pointee) throw new Error(`Le collaborateur a pointé le ${dateCourte(pointee.date)} : ce jour n'est pas une absence.`);
    const payee = db.campagnesPaie.find((c) => c.statut !== 'brouillon' && c.mois >= moisDe(debut) && c.mois <= moisDe(fin));
    if (payee) throw new Error(`La paie de ${moisLong(payee.mois)} est déjà validée : la régularisation doit passer par la paie suivante.`);
    const jours = dureeConge(debut, fin, 'matin', 'fin', ensembleFeries(db.parametres));
    if (jours <= 0) throw new Error('La période ne contient aucun jour ouvrable.');
    if (j.type === 'permission') {
      const m = j.motifPermission ? MOTIFS_PERMISSION[j.motifPermission] : undefined;
      if (!m) throw new Error('Précisez l’événement justifiant la permission.');
      if (m.jours !== null && jours > m.jours) throw new Error(`Permission limitée à ${m.jours} j pour cet événement (CCGT art. 54).`);
    }
    if (j.type === 'maladie' && !j.justificatif) throw new Error('Un certificat médical est requis pour une absence maladie.');
    if (j.type === 'maternite') throw new Error('Le congé de maternité se déclare depuis la page Congés (période fixée par la loi).');
    if (j.type === 'liberte_preavis') verifierLibertePreavis(db, emp, debut, fin, jours);
    if (j.type === 'conge_paye') {
      const dispo = disponiblePour(calculerDroits(db, emp, today), 'conge_paye')!;
      if (jours > dispo) throw new Error(`Solde de congés insuffisant : ${dispo} j disponible(s).`);
    }
    if (!j.motif.trim()) throw new Error('Indiquez le motif de la justification.');
    const acteur = acteurDe(user);
    const c: DemandeConge = {
      id: uid('cg'),
      reference: `CG-${debut.slice(0, 4)}-${String(db.conges.length + 8).padStart(4, '0')}`,
      employeId,
      type: j.type,
      ...(j.type === 'permission' ? { motifPermission: j.motifPermission } : {}),
      debut,
      debutPeriode: 'matin',
      fin,
      finPeriode: 'fin',
      jours,
      motif: j.motif.trim(),
      justificatif: j.justificatif,
      statut: 'approuve',
      dateDemande: serverNowISO(),
      validateur: acteur.nom,
      traitePar: acteur.nom,
      dateTraitement: serverNowISO(),
      commentaireRH: 'Absence justifiée a posteriori',
    };
    db.conges.push(c);
    journaliser(db, acteur, 'JUSTIFICATION_ABSENCE', c.reference, emp.id, `${LIBELLE_CONGE[c.type]} • ${jours} j du ${dateCourte(debut)} au ${dateCourte(fin)} • ${c.motif}`);
    if (c.type !== 'maladie') creerDocument(db, emp, 'titre_conge', { congeId: c.id, periode: `${dateCourte(c.debut)} — ${dateCourte(c.fin)}`, jours: String(c.jours) }, acteur);
    notifier(db, {
      pour: { employeId },
      titre: 'Absence justifiée',
      message: `${dateCourte(debut)}${fin !== debut ? ` — ${dateCourte(fin)}` : ''} : ${LIBELLE_CONGE[c.type]}`,
      lien: '/employe/conges',
      niveau: 'succes',
    });
    return { ...c };
  });
}

/** Demande au collaborateur de justifier une absence (notification + trace) */
export function relancerAbsence(user: User, employeId: string, jours: string[]): void {
  mutate((db) => {
    exiger(db, user, 'absences.gerer');
    const emp = employe(db, employeId);
    if (jours.length === 0) throw new Error('Aucune absence à relancer.');
    const liste = jours.map(dateCourte).join(', ');
    journaliser(db, acteurDe(user), 'RELANCE_ABSENCE', nomComplet(emp), emp.id, `Absence(s) non justifiée(s) : ${liste}`);
    notifier(db, {
      pour: { employeId },
      titre: 'Absence à justifier',
      message: `Aucun pointage ni congé le ${liste}. Déposez une régularisation ou un justificatif.`,
      lien: '/employe/pointages',
      niveau: 'alerte',
    });
  });
}

/* ================= Notifications ================= */

export const notificationsPour = (db: Database, user: User): Notification[] =>
  db.notifications
    .filter((n) => n.pour.employeId === user.employeId || n.pour.role === user.role)
    .sort((a, b) => b.date.localeCompare(a.date));

export function marquerLues(ids: string[]): void {
  if (ids.length === 0) return;
  mutate((db) => {
    db.notifications.forEach((n) => {
      if (ids.includes(n.id)) n.lu = true;
    });
  });
}
