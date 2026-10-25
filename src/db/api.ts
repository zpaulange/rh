import { API_URL } from '../lib/serverTime';
import type { SaisieSortie } from '../lib/sortie';
import type {
  CampagnePaie,
  Database,
  DemandeConge,
  DemandeDocument,
  Departement,
  DocumentGenere,
  ElementVariable,
  Employe,
  EvolutionCarriere,
  GeoPoint,
  ModeleDocument,
  Parametres,
  Permission,
  Pointage,
  Regularisation,
  Role,
  SituationContractuelle,
  Sortie,
  SourcePointage,
  TypeEvolution,
  User,
} from '../types';
import { definirEtat, getDB } from './store';

// Client de l'API SikaRH.
// Chaque action métier correspond à un endpoint REST du backend ; elle renvoie une promesse, et le cache
// local (db/store.ts) est mis à jour avec la vue renvoyée par le serveur avant qu'elle ne soit résolue.

export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
  ) {
    super(message);
  }
}

let surSessionPerdue: (() => void) | null = null;
/** Appelée quand le serveur signale une session expirée ou un accès retiré */
export function quandSessionPerdue(f: (() => void) | null): void {
  surSessionPerdue = f;
}

export async function requete<T>(chemin: string, options: { methode?: Methode; corps?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${chemin}`, {
      method: options.methode ?? 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-SikaRH': '1' },
      body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
    });
  } catch {
    throw new ErreurApi('Serveur injoignable : vérifiez votre connexion et réessayez.', 0);
  }
  const donnees = (await res.json().catch(() => null)) as (T & { erreur?: string }) | null;
  if (!res.ok) {
    if (res.status === 401 && !chemin.startsWith('/auth/')) surSessionPerdue?.();
    throw new ErreurApi(donnees?.erreur ?? `Erreur ${res.status}`, res.status);
  }
  return donnees as T;
}

/* ---------- Session ---------- */

export interface ReponseSession {
  compteId: string;
  etat: Database;
  serveur: { demo: boolean };
}

export const connexion = (email: string, motDePasse: string, persistante: boolean) =>
  requete<ReponseSession>('/auth/connexion', { methode: 'POST', corps: { email, motDePasse, persistante } });
export const reprendreSession = () => requete<ReponseSession>('/auth/session');
export const deconnexion = (expiree: boolean) => requete<{ ok: true }>('/auth/deconnexion', { methode: 'POST', corps: { expiree } });

/* ---------- Données ---------- */

let rafraichissement: Promise<void> | null = null;
/** Recharge la vue de l'utilisateur (une seule requête à la fois) */
export function rafraichirEtat(): Promise<void> {
  if (!rafraichissement)
    rafraichissement = requete<Database>('/etat')
      .then(definirEtat)
      .finally(() => {
        rafraichissement = null;
      });
  return rafraichissement;
}

/** Suit les modifications en temps réel (Server-Sent Events) ; renvoie la fonction d'arrêt */
export function suivreRevisions(): () => void {
  let source: EventSource | null = null;
  let relance: number | undefined;
  const ouvrir = () => {
    source = new EventSource(`${API_URL}/evenements`, { withCredentials: true });
    source.addEventListener('revision', (e) => {
      if (Number((e as MessageEvent).data) > getDB().version) void rafraichirEtat().catch(() => undefined);
    });
    source.onerror = () => {
      // Flux fermé (session expirée, serveur redémarré) : vérification puis reconnexion
      if (source?.readyState === EventSource.CLOSED) {
        source = null;
        relance = window.setTimeout(() => {
          void rafraichirEtat()
            .then(ouvrir)
            .catch(() => undefined);
        }, 5000);
      }
    };
  };
  ouvrir();
  return () => {
    window.clearTimeout(relance);
    source?.close();
  };
}

/* ---------- Données envoyées à l'API ---------- */

export interface DonneesPointage {
  geo: GeoPoint | null;
  photo: string | null;
  source: SourcePointage;
}
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
export type NouvelleRegularisation = Pick<Regularisation, 'type' | 'date' | 'entree' | 'depart' | 'motif' | 'justificatif'>;
export type NouvelleDemandeDocument = Pick<DemandeDocument, 'type' | 'destinataire' | 'format' | 'commentaire' | 'mois'>;
export type Coordonnees = Pick<Employe, 'telPerso' | 'emailPerso' | 'adresse' | 'urgenceNom' | 'urgenceTel'>;
export type NouvelEmploye = Omit<Employe, 'id' | 'matricule' | 'avatarUrl' | 'npiVerifie' | 'dateSortie'>;
export interface NouvelleEvolution {
  type: Exclude<TypeEvolution, 'embauche'>;
  dateEffet: string;
  apres: SituationContractuelle;
  motif: string;
}
export interface NouvelleSortie extends SaisieSortie {
  observations: string;
}
export interface Justification {
  type: Exclude<DemandeConge['type'], 'rtt'>;
  motifPermission?: DemandeConge['motifPermission'];
  motif: string;
  justificatif: string | null;
}
export interface DonneesDepartement {
  code: string;
  nom: string;
  description: string;
  responsableId: string | null;
}
export interface DonneesService {
  nom: string;
  responsableId: string | null;
}

/* ---------- Actions métier (API REST) ---------- */

type Methode = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** Requête REST correspondant à une action : méthode, ressource, corps */
type Route = [methode: Methode, chemin: string, corps?: unknown];

const seg = encodeURIComponent;

/** Exécute une commande ; le serveur renvoie son résultat et la vue à jour de l'utilisateur */
async function commande<R>([methode, chemin, corps]: Route): Promise<R> {
  const r = await requete<{ resultat: R; etat: Database }>(chemin, { methode, corps: corps ?? {} });
  definirEtat(r.etat);
  return r.resultat;
}

/**
 * Action métier exécutée par le serveur : action<Résultat>()((arguments) => [méthode, chemin, corps]).
 * L'utilisateur passé en premier argument est ignoré : le serveur utilise toujours celui de la session.
 */
const action =
  <R = void>() =>
  <A extends unknown[]>(route: (...args: A) => Route) =>
  (_user: User, ...args: A): Promise<R> =>
    commande<R>(route(...args));

/** Position transmise au serveur : la distance et l'appartenance à la zone y sont recalculées */
const position = (geo: GeoPoint | null) => (geo ? { lat: geo.lat, lng: geo.lng, precision: geo.precision } : null);

// Pointages
export const pointerArrivee = action<Pointage>()((d: DonneesPointage) => ['POST', '/pointages/arrivee', { geo: position(d.geo), photo: d.photo, source: d.source }]);
export const basculerPause = action()(() => ['POST', '/pointages/pause']);
export const pointerDepart = action()((geo: GeoPoint | null) => ['POST', '/pointages/depart', { geo: position(geo) }]);

// Congés et permissions
export const demanderConge = action<DemandeConge>()((d: NouvelleDemandeConge) => ['POST', '/conges', d]);
export const deciderConge = action()((id: string, approuver: boolean, commentaire: string) => ['POST', `/conges/${seg(id)}/decision`, { approuver, commentaire }]);
export const declarerAccouchement = action<DemandeConge>()((id: string, date: string) => ['POST', `/conges/${seg(id)}/accouchement`, { date }]);
export const prolongerMaternite = action<DemandeConge>()((id: string, justificatif: string) => ['POST', `/conges/${seg(id)}/prolongation`, { justificatif }]);

// Régularisations et absences
export const demanderRegularisation = action<Regularisation>()((d: NouvelleRegularisation) => ['POST', '/regularisations', d]);
export const deciderRegularisation = action()((id: string, approuver: boolean, commentaire: string) => ['POST', `/regularisations/${seg(id)}/decision`, { approuver, commentaire }]);
export const justifierAbsence = action<DemandeConge>()((employeId: string, debut: string, fin: string, justification: Justification) => [
  'POST',
  '/absences/justification',
  { employeId, debut, fin, justification },
]);
export const relancerAbsence = action()((employeId: string, jours: string[]) => ['POST', '/absences/relance', { employeId, jours }]);

// Documents
export const demanderDocument = action<DemandeDocument>()((d: NouvelleDemandeDocument) => ['POST', '/demandes-documents', d]);
export const traiterDemandeDocument = action<DocumentGenere>()((id: string) => ['POST', `/demandes-documents/${seg(id)}/traitement`]);
export const refuserDemandeDocument = action()((id: string, motif: string) => ['POST', `/demandes-documents/${seg(id)}/refus`, { motif }]);
export const genererDocumentManuel = action<DocumentGenere>()((employeId: string, modele: ModeleDocument, params: Record<string, string>) => [
  'POST',
  '/documents',
  { employeId, modele, params },
]);
export const journaliserTelechargement = action()((doc: DocumentGenere) => ['POST', `/documents/${seg(doc.id)}/telechargement`]);
export const verifierDocument = action<DocumentGenere | null>()((code: string) => ['POST', '/documents/verification', { code }]);

// Collaborateurs
export const modifierCoordonnees = action()((c: Coordonnees) => ['PUT', '/profil/coordonnees', c]);
export const creerEmploye = action<{ employe: Employe; motDePasse: string }>()((donnees: NouvelEmploye, role: Role) => ['POST', '/employes', { donnees, role }]);
export const modifierEmploye = action()((id: string, patch: Partial<Employe>) => ['PATCH', `/employes/${seg(id)}`, patch]);
export const supprimerEmploye = action()((id: string, motif: string) => ['DELETE', `/employes/${seg(id)}`, { motif }]);
export const consulterDonneesSensibles = action()((id: string) => ['POST', `/employes/${seg(id)}/consultation-donnees-sensibles`]);
export const enregistrerEvolution = action<EvolutionCarriere>()((id: string, evolution: NouvelleEvolution) => ['POST', `/employes/${seg(id)}/evolutions`, evolution]);
export const enregistrerSortie = action<Sortie>()((id: string, sortie: NouvelleSortie) => ['POST', `/employes/${seg(id)}/sortie`, sortie]);
export const annulerSortie = action()((id: string, motif: string) => ['POST', `/sorties/${seg(id)}/annulation`, { motif }]);

// Comptes d'accès et permissions
export const changerAcces = action()((employeId: string, actif: boolean) => ['PATCH', `/comptes/${seg(employeId)}/acces`, { actif }]);
export const deverrouillerCompte = action()((employeId: string) => ['POST', `/comptes/${seg(employeId)}/deverrouillage`]);
export const reinitialiserMotDePasse = action<{ email: string; motDePasse: string }>()((employeId: string) => ['POST', `/comptes/${seg(employeId)}/mot-de-passe`]);
export const changerRole = action()((employeId: string, role: Role, motif: string) => ['PATCH', `/comptes/${seg(employeId)}/role`, { role, motif }]);
export const modifierPermissions = action()((role: Role, permissions: Permission[]) => ['PUT', `/permissions/${seg(role)}`, { permissions }]);

// Organisation
export const creerDepartement = action<Departement>()((d: DonneesDepartement) => ['POST', '/departements', d]);
export const modifierDepartement = action()((id: string, d: DonneesDepartement) => ['PUT', `/departements/${seg(id)}`, d]);
export const supprimerDepartement = action()((id: string) => ['DELETE', `/departements/${seg(id)}`]);
export const ajouterService = action()((id: string, d: DonneesService) => ['POST', `/departements/${seg(id)}/services`, d]);
export const modifierService = action()((id: string, serviceId: string, d: DonneesService) => ['PUT', `/departements/${seg(id)}/services/${seg(serviceId)}`, d]);
export const supprimerService = action<number>()((id: string, serviceId: string) => ['DELETE', `/departements/${seg(id)}/services/${seg(serviceId)}`]);

// Paie
export const preparerPaie = action<CampagnePaie>()((mois: string) => ['POST', '/paies', { mois }]);
export const recalculerPaie = action()((id: string) => ['POST', `/paies/${seg(id)}/recalcul`]);
export const ajouterElementVariable = action()((id: string, employeId: string, element: Omit<ElementVariable, 'id'>) => ['POST', `/paies/${seg(id)}/elements`, { employeId, element }]);
export const supprimerElementVariable = action()((id: string, employeId: string, elementId: string) => ['DELETE', `/paies/${seg(id)}/elements/${seg(employeId)}/${seg(elementId)}`]);
export const validerPaie = action()((id: string) => ['POST', `/paies/${seg(id)}/validation`]);
export const rouvrirPaie = action()((id: string, motif: string) => ['POST', `/paies/${seg(id)}/reouverture`, { motif }]);
export const payerSalaires = action<number>()((id: string, datePaiement: string, modePaiement: string) => ['POST', `/paies/${seg(id)}/versement`, { datePaiement, modePaiement }]);

// Paramètres, rapports
export const modifierParametres = action()((p: Parametres) => ['PUT', '/parametres', p]);
export const journaliserExport = action()((rapport: string, format: 'CSV' | 'PDF', lignes: number) => ['POST', '/exports/journal', { rapport, format, lignes }]);

/** Marque des notifications de l'utilisateur comme lues */
export const marquerLues = (ids: string[]) => commande<null>(['POST', '/notifications/lues', { ids }]);

/** Réinitialise les données de démonstration (administrateur, serveur en mode démonstration) */
export async function reinitialiserDemo(): Promise<void> {
  await requete<{ ok: true }>('/demo/reinitialiser', { methode: 'POST', corps: {} });
  await rafraichirEtat();
}

// Lectures calculées localement sur les données reçues
export { moisReference, motifsBlocageSuppression, notificationsPour } from './lecture';
