import { LIBELLE_EVOLUTION } from '../config/paie';
import { construireDocument } from '../lib/documents';
import { ensembleFeries, joursFeriesBenin } from '../lib/feries';
import { calculerLignePaie, employesAPayer, fcfa } from '../lib/paie';
import { calculerRetard, dureeConge } from '../lib/rules';
import {
  ajouterJours,
  dateCourte,
  dateKey,
  dernierDuMois,
  estOuvre,
  heureHM,
  instant,
  jourSemaine,
  lundi,
  minutesDepuisMinuit,
  moisDe,
  moisLong,
} from '../lib/time';
import { PERMISSIONS_PAR_DEFAUT } from '../lib/permissions';
import type {
  AuditEntry,
  Compte,
  CampagnePaie,
  Database,
  Departement,
  DemandeConge,
  DemandeDocument,
  DocumentGenere,
  Employe,
  EvolutionCarriere,
  PrimeFixe,
  TypeEvolution,
  GeoPoint,
  Notification,
  Parametres,
  Pointage,
  Regularisation,
  SourcePointage,
} from '../types';

// Base de démonstration générée par rapport à la date du jour, pour que
// les tableaux de bord, retards et soldes restent cohérents quel que soit le jour d'ouverture.

const AVATAR_KOFFI =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC3Pw0NWj-_1T203jI6a7wK5a8XVIkV_IoPIjokwfsmfdz2aSsshSGtGZnNNNOA5h9YMu-zHe-CcUuEiB-Xt6rRKwLiY_bXO5bqTkJKfkJf2-ST7EhgjdnkLEnTzedZeF5nNT7G5N6_0QQqn1DjoqxKcNbg9vD2_No5kyiIUe_vWwavtvyMW_s6WDS4lH5BW4wEeuMu1ltAC5DS_1xUfdTNCUQMLv-yDHwnkyA6hpv7OmlEg5Ngnwxr';

const SITE: Parametres['site'] = { nom: 'Siège Cotonou — Haie Vive', lat: 6.357, lng: 2.391, rayon: 200 };

const PARAMETRES_BASE: Omit<Parametres, 'joursFeries' | 'dateRepriseSoldes' | 'dateDebutPointage'> = {
  heureDebut: '08:00',
  heureFin: '17:00',
  toleranceRetard: 10,
  heuresJour: 8,
  site: SITE,
  geolocObligatoire: true,
  photoObligatoire: true,
  cpParMois: 2,
  quotaPermissions: 10,
  anticipationConges: false,
  sessionMinutes: 30,
  tentativesMax: 5,
  verrouillageMinutes: 15,
};

/** Générateur pseudo-aléatoire déterministe (mulberry32) */
function prng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const ouvreAvant = (key: string): string => {
  let k = key;
  while (!estOuvre(k)) k = ajouterJours(k, -1);
  return k;
};
const ouvreApres = (key: string): string => {
  let k = key;
  while (!estOuvre(k)) k = ajouterJours(k, 1);
  return k;
};

type Base = Omit<Employe, 'id' | 'avatarUrl' | 'lieuTravail' | 'heuresHebdo' | 'npiVerifie' | 'nationalite' | 'primesFixes' | 'categorie' | 'enfantsACharge' | 'service' | 'dateSortie' | 'avantagesNature' | 'dirigeant' | 'premierEmploi'> &
  Partial<Pick<Employe, 'avatarUrl' | 'nationalite'>>;

const EMPLOYES: (Base & { id: string; email: string; role: Compte['role']; motDePasse: string; profilRetard: number; source: SourcePointage })[] = [
  {
    id: 'e-koffi',
    email: 'k.mensah@entreprise.bj',
    motDePasse: 'employe123',
    role: 'employe',
    profilRetard: 0,
    source: 'biometrique',
    matricule: 'BN-4092',
    civilite: 'M.',
    prenom: 'Koffi',
    nom: 'Mensah',
    dateNaissance: '1991-06-14',
    poste: 'Lead Tech Développeur',
    departement: 'Ingénierie Logicielle',
    dateEmbauche: '2021-03-01',
    contrat: 'CDI',
    responsable: 'G. Lawson (CTO)',
    telPro: '+229 97 00 12 34',
    telPerso: '+229 95 44 88 12',
    emailPro: 'k.mensah@entreprise.bj',
    emailPerso: 'mensah.koffi91@gmail.com',
    adresse: 'Quartier Haie Vive, Cotonou',
    urgenceNom: 'Aimée Mensah',
    urgenceTel: '+229 96 11 22 33',
    cnss: '108-452-9812-70',
    ifu: '0201810349281',
    compteBancaire: 'BOA Bénin — BJ061 01001 002345678901 22',
    npi: '1991 0614 4092 11',
    salaireBase: 850000,
    avatarUrl: AVATAR_KOFFI,
  },
  {
    id: 'e-aicha',
    email: 'rh@entreprise.bj',
    motDePasse: 'rh123',
    role: 'rh',
    profilRetard: 0.03,
    source: 'biometrique',
    matricule: 'BN-1021',
    civilite: 'Mme',
    prenom: 'Aïcha',
    nom: 'Dossou',
    dateNaissance: '1986-02-09',
    poste: 'Responsable Ressources Humaines',
    departement: 'Ressources Humaines',
    dateEmbauche: '2018-09-03',
    contrat: 'CDI',
    responsable: 'Direction Générale',
    telPro: '+229 97 00 10 21',
    telPerso: '+229 96 21 45 78',
    emailPro: 'rh@entreprise.bj',
    emailPerso: 'aicha.dossou@gmail.com',
    adresse: 'Cadjèhoun, Cotonou',
    urgenceNom: 'Paul Dossou',
    urgenceTel: '+229 97 88 21 10',
    cnss: '108-221-4471-12',
    ifu: '0201605512873',
    compteBancaire: 'Ecobank Bénin — BJ104 01001 004512369874 51',
    npi: '1986 0209 1021 07',
    salaireBase: 1100000,
  },
  {
    id: 'e-admin',
    email: 'admin@entreprise.bj',
    motDePasse: 'admin123',
    role: 'admin',
    profilRetard: 0.02,
    source: 'web',
    matricule: 'BN-0001',
    civilite: 'M.',
    prenom: 'Serge',
    nom: 'Ahouansou',
    dateNaissance: '1983-11-21',
    poste: 'Administrateur Systèmes',
    departement: 'Direction SI',
    dateEmbauche: '2017-01-16',
    contrat: 'CDI',
    responsable: 'Direction Générale',
    telPro: '+229 97 00 00 01',
    telPerso: '+229 95 12 33 40',
    emailPro: 'admin@entreprise.bj',
    emailPerso: 's.ahouansou@gmail.com',
    adresse: 'Fidjrossè, Cotonou',
    urgenceNom: 'Clarisse Ahouansou',
    urgenceTel: '+229 96 40 22 18',
    cnss: '108-114-2280-03',
    ifu: '0201502236641',
    compteBancaire: 'Orabank Bénin — BJ115 01001 006631245789 08',
    npi: '1983 1121 0001 44',
    salaireBase: 1050000,
  },
  {
    id: 'e-gildas',
    email: 'g.lawson@entreprise.bj',
    motDePasse: 'employe123',
    role: 'employe',
    profilRetard: 0.04,
    source: 'web',
    matricule: 'BN-0007',
    civilite: 'M.',
    prenom: 'Gildas',
    nom: 'Lawson',
    dateNaissance: '1980-04-02',
    poste: 'Directeur Technique (CTO)',
    departement: 'Direction Technique',
    dateEmbauche: '2016-05-02',
    contrat: 'CDI',
    responsable: 'Direction Générale',
    telPro: '+229 97 00 00 07',
    telPerso: '+229 96 77 10 02',
    emailPro: 'g.lawson@entreprise.bj',
    emailPerso: 'gildas.lawson@gmail.com',
    adresse: 'Akpakpa, Cotonou',
    urgenceNom: 'Edwige Lawson',
    urgenceTel: '+229 97 32 18 90',
    cnss: '108-009-7741-55',
    ifu: '0201402219876',
    compteBancaire: 'BOA Bénin — BJ061 01001 001122334455 07',
    npi: '1980 0402 0007 21',
    salaireBase: 1650000,
  },
  {
    id: 'e-rodrigue',
    email: 'r.hounkpatin@entreprise.bj',
    motDePasse: 'employe123',
    role: 'employe',
    profilRetard: 0.3,
    source: 'biometrique',
    matricule: 'BN-4120',
    civilite: 'M.',
    prenom: 'Rodrigue',
    nom: 'Hounkpatin',
    dateNaissance: '1996-08-30',
    poste: 'Développeur Full-Stack',
    departement: 'Ingénierie Logicielle',
    dateEmbauche: '2023-02-13',
    contrat: 'CDI',
    responsable: 'K. Mensah (Lead Tech)',
    telPro: '+229 97 00 41 20',
    telPerso: '+229 66 54 12 09',
    emailPro: 'r.hounkpatin@entreprise.bj',
    emailPerso: 'rodrigue.hk@gmail.com',
    adresse: 'Godomey, Abomey-Calavi',
    urgenceNom: 'Bernadette Hounkpatin',
    urgenceTel: '+229 95 08 77 31',
    cnss: '108-771-3402-88',
    ifu: '0202308811452',
    compteBancaire: 'UBA Bénin — BJ150 01001 007845123690 33',
    npi: '1996 0830 4120 63',
    salaireBase: 520000,
  },
  {
    id: 'e-mariam',
    email: 'm.bello@entreprise.bj',
    motDePasse: 'employe123',
    role: 'employe',
    profilRetard: 0.04,
    source: 'biometrique',
    matricule: 'BN-3310',
    civilite: 'Mme',
    prenom: 'Mariam',
    nom: 'Bello',
    dateNaissance: '1990-12-05',
    poste: 'Comptable Principale',
    departement: 'Finance & Comptabilité',
    dateEmbauche: '2020-07-01',
    contrat: 'CDI',
    responsable: 'Direction Financière',
    telPro: '+229 97 00 33 10',
    telPerso: '+229 61 22 45 87',
    emailPro: 'm.bello@entreprise.bj',
    emailPerso: 'mariam.bello@yahoo.fr',
    adresse: 'Zogbo, Cotonou',
    urgenceNom: 'Ibrahim Bello',
    urgenceTel: '+229 97 45 63 21',
    cnss: '108-554-1190-26',
    ifu: '0202007743120',
    compteBancaire: 'Ecobank Bénin — BJ104 01001 003214569870 12',
    npi: '1990 1205 3310 09',
    salaireBase: 690000,
  },
  {
    id: 'e-fatou',
    email: 'f.sanni@entreprise.bj',
    motDePasse: 'employe123',
    role: 'employe',
    profilRetard: 0.1,
    source: 'mobile',
    matricule: 'BN-2215',
    civilite: 'Mme',
    prenom: 'Fatou',
    nom: 'Sanni',
    dateNaissance: '1994-03-17',
    poste: 'Chargée de clientèle',
    departement: 'Commercial',
    dateEmbauche: '2022-10-03',
    contrat: 'CDD',
    responsable: 'Direction Commerciale',
    telPro: '+229 97 00 22 15',
    telPerso: '+229 94 33 21 08',
    emailPro: 'f.sanni@entreprise.bj',
    emailPerso: 'fatou.sanni@gmail.com',
    adresse: 'Gbégamey, Cotonou',
    urgenceNom: 'Moussa Sanni',
    urgenceTel: '+229 96 54 87 12',
    cnss: '108-663-2207-41',
    ifu: '0202210092234',
    compteBancaire: 'BOA Bénin — BJ061 01001 009987654321 44',
    npi: '1994 0317 2215 30',
    salaireBase: 410000,
  },
  {
    id: 'e-brice',
    email: 'b.agossou@entreprise.bj',
    motDePasse: 'employe123',
    role: 'employe',
    profilRetard: 0.06,
    source: 'biometrique',
    matricule: 'BN-4501',
    civilite: 'M.',
    prenom: 'Brice',
    nom: 'Agossou',
    dateNaissance: '1993-09-11',
    poste: 'Technicien Support',
    departement: 'Support & Exploitation',
    dateEmbauche: '2021-11-15',
    contrat: 'CDI',
    responsable: 'G. Lawson (CTO)',
    telPro: '+229 97 00 45 01',
    telPerso: '+229 67 41 20 33',
    emailPro: 'b.agossou@entreprise.bj',
    emailPerso: 'brice.agossou@gmail.com',
    adresse: 'Agla, Cotonou',
    urgenceNom: 'Rachelle Agossou',
    urgenceTel: '+229 96 30 11 47',
    cnss: '108-902-5563-18',
    ifu: '0202111457789',
    compteBancaire: 'Orabank Bénin — BJ115 01001 004433221100 65',
    npi: '1993 0911 4501 52',
    salaireBase: 380000,
  },
  {
    id: 'e-nadege',
    email: 'n.kpadonou@entreprise.bj',
    motDePasse: 'employe123',
    role: 'employe',
    profilRetard: 0.02,
    source: 'biometrique',
    matricule: 'BN-1088',
    civilite: 'Mme',
    prenom: 'Nadège',
    nom: 'Kpadonou',
    dateNaissance: '1997-01-25',
    poste: 'Assistante RH & Paie',
    departement: 'Ressources Humaines',
    dateEmbauche: '2024-01-08',
    contrat: 'CDD',
    responsable: 'A. Dossou (RRH)',
    telPro: '+229 97 00 10 88',
    telPerso: '+229 90 12 78 45',
    emailPro: 'n.kpadonou@entreprise.bj',
    emailPerso: 'nadege.kpadonou@gmail.com',
    adresse: 'Sainte-Rita, Cotonou',
    urgenceNom: 'Hubert Kpadonou',
    urgenceTel: '+229 97 66 54 32',
    cnss: '108-998-1123-77',
    ifu: '0202401023356',
    compteBancaire: 'UBA Bénin — BJ150 01001 002211335577 19',
    npi: '1997 0125 1088 14',
    salaireBase: 330000,
  },
];

// Semaine type de Koffi Mensah, reprise des maquettes (jour ISO → arrivée, départ, pause, terminal)
const SEMAINE_KOFFI: Record<number, { arr: string; dep: string; pause: number; source: SourcePointage; terminal: string }> = {
  1: { arr: '07:55', dep: '17:40', pause: 75, source: 'biometrique', terminal: 'Biométrique (RDC)' },
  2: { arr: '08:24', dep: '17:38', pause: 59, source: 'web', terminal: 'Portail Web (Régul.)' },
  3: { arr: '08:00', dep: '17:15', pause: 60, source: 'biometrique', terminal: 'Biométrique (RDC)' },
  4: { arr: '07:52', dep: '17:10', pause: 68, source: 'biometrique', terminal: 'Biométrique (RDC)' },
  5: { arr: '07:58', dep: '17:02', pause: 64, source: 'mobile', terminal: 'Mobile (GPS)' },
};

interface Etape {
  type: TypeEvolution;
  /** Date ISO, ou décalage en mois par rapport au mois courant (ex. -3 = 1er jour d'il y a 3 mois) */
  date: string | number;
  poste: string;
  departement?: string;
  salaire: number;
  primes: PrimeFixe[];
  motif: string;
}

const TRANSPORT = (montant: number): PrimeFixe => ({ libelle: 'Indemnité de transport', montant, soumisCnss: false, soumisIts: true, remboursementFrais: true });

// Parcours de carrière de démonstration (la dernière étape appliquée correspond au dossier actuel)
const PARCOURS: Record<string, Etape[]> = {
  'e-koffi': [
    { type: 'embauche', date: '2021-03-01', poste: 'Développeur Full-Stack', salaire: 520000, primes: [TRANSPORT(20000)], motif: 'Embauche en CDI' },
    { type: 'promotion', date: '2023-01-01', poste: 'Développeur Senior', salaire: 680000, primes: [TRANSPORT(25000)], motif: 'Évaluation annuelle 2022 : objectifs dépassés' },
    {
      type: 'promotion',
      date: -3,
      poste: 'Lead Tech Développeur',
      salaire: 850000,
      primes: [TRANSPORT(25000), { libelle: 'Prime de responsabilité', montant: 50000, soumisCnss: true, soumisIts: true, remboursementFrais: false }],
      motif: "Prise en charge de l'équipe Plateforme (4 développeurs)",
    },
  ],
  'e-aicha': [
    { type: 'embauche', date: '2018-09-03', poste: 'Responsable Ressources Humaines', salaire: 950000, primes: [TRANSPORT(30000), { libelle: 'Indemnité de logement', montant: 75000, soumisCnss: true, soumisIts: true, remboursementFrais: false }], motif: 'Embauche en CDI' },
    { type: 'augmentation', date: -9, poste: 'Responsable Ressources Humaines', salaire: 1100000, primes: [TRANSPORT(30000), { libelle: 'Indemnité de logement', montant: 75000, soumisCnss: true, soumisIts: true, remboursementFrais: false }], motif: 'Revalorisation annuelle' },
  ],
  'e-admin': [{ type: 'embauche', date: '2017-01-16', poste: 'Administrateur Systèmes', salaire: 1050000, primes: [TRANSPORT(25000)], motif: 'Embauche en CDI' }],
  'e-gildas': [
    { type: 'embauche', date: '2016-05-02', poste: 'Architecte Logiciel', salaire: 1200000, primes: [TRANSPORT(30000)], motif: 'Embauche en CDI' },
    {
      type: 'promotion',
      date: '2020-01-01',
      poste: 'Directeur Technique (CTO)',
      departement: 'Direction Technique',
      salaire: 1650000,
      primes: [TRANSPORT(40000), { libelle: 'Indemnité de représentation', montant: 150000, soumisCnss: true, soumisIts: true, remboursementFrais: false }],
      motif: 'Nomination au comité de direction',
    },
  ],
  'e-rodrigue': [
    { type: 'embauche', date: '2023-02-13', poste: 'Développeur Full-Stack', salaire: 450000, primes: [TRANSPORT(20000)], motif: 'Embauche en CDI' },
    { type: 'augmentation', date: '2024-03-01', poste: 'Développeur Full-Stack', salaire: 520000, primes: [TRANSPORT(20000)], motif: 'Fin de période probatoire et évaluation positive' },
    { type: 'promotion', date: 1, poste: 'Développeur Senior', salaire: 600000, primes: [TRANSPORT(20000)], motif: 'Montée en compétences sur le module de paie' },
  ],
  'e-mariam': [
    { type: 'embauche', date: '2020-07-01', poste: 'Comptable', salaire: 600000, primes: [TRANSPORT(20000)], motif: 'Embauche en CDI' },
    { type: 'promotion', date: -6, poste: 'Comptable Principale', salaire: 690000, primes: [TRANSPORT(20000)], motif: 'Reprise de la clôture mensuelle et des déclarations' },
  ],
  'e-fatou': [{ type: 'embauche', date: '2022-10-03', poste: 'Chargée de clientèle', salaire: 410000, primes: [TRANSPORT(20000)], motif: 'Embauche en CDD' }],
  'e-brice': [
    { type: 'embauche', date: '2021-11-15', poste: 'Technicien Support', salaire: 380000, primes: [TRANSPORT(15000), { libelle: "Prime d'astreinte", montant: 30000, soumisCnss: true, soumisIts: true, remboursementFrais: false }], motif: 'Embauche en CDI' },
  ],
  'e-nadege': [{ type: 'embauche', date: '2024-01-08', poste: 'Assistante RH & Paie', salaire: 330000, primes: [TRANSPORT(15000)], motif: 'Embauche en CDD' }],
};

// Catégorie professionnelle (préavis, maintien du salaire en maladie) et enfants à charge de moins de 15 ans
const CATEGORIE_SEED: Record<string, Employe['categorie']> = {
  'e-koffi': 'maitrise_cadre',
  'e-aicha': 'maitrise_cadre',
  'e-admin': 'maitrise_cadre',
  'e-gildas': 'maitrise_cadre',
  'e-mariam': 'maitrise_cadre',
};
// Avantages en nature fournis (évalués au forfait, CGI art. 123)
const AVANTAGES_SEED: Record<string, Employe['avantagesNature']> = {
  'e-gildas': ['vehicule_4_roues', 'telephone'],
  'e-aicha': ['telephone'],
};

// Service de rattachement au sein du département
const SERVICE_SEED: Record<string, string> = {
  'e-koffi': 'Plateforme',
  'e-rodrigue': 'Plateforme',
  'e-aicha': 'Administration du personnel',
  'e-nadege': 'Paie & déclarations',
  'e-admin': 'Infrastructure & sécurité',
  'e-mariam': 'Comptabilité générale',
  'e-fatou': 'Relation client',
  'e-brice': 'Support utilisateurs',
};

// Organisation : départements, services et responsables
const DEPARTEMENTS_SEED: Omit<Departement, 'dateCreation'>[] = [
  { id: 'dep-dt', code: 'DT', nom: 'Direction Technique', description: 'Pilotage des équipes techniques et de la feuille de route produit.', responsableId: 'e-gildas', services: [] },
  {
    id: 'dep-ing',
    code: 'ING',
    nom: 'Ingénierie Logicielle',
    description: 'Conception, développement et maintenance des produits.',
    responsableId: 'e-koffi',
    services: [
      { id: 'srv-plateforme', nom: 'Plateforme', responsableId: 'e-koffi' },
      { id: 'srv-mobile', nom: 'Applications mobiles', responsableId: null },
    ],
  },
  {
    id: 'dep-rh',
    code: 'RH',
    nom: 'Ressources Humaines',
    description: 'Recrutement, administration du personnel, paie et relations sociales.',
    responsableId: 'e-aicha',
    services: [
      { id: 'srv-adm-perso', nom: 'Administration du personnel', responsableId: 'e-aicha' },
      { id: 'srv-paie', nom: 'Paie & déclarations', responsableId: 'e-nadege' },
    ],
  },
  {
    id: 'dep-dsi',
    code: 'DSI',
    nom: 'Direction SI',
    description: "Systèmes d'information, sécurité et administration des accès.",
    responsableId: 'e-admin',
    services: [{ id: 'srv-infra', nom: 'Infrastructure & sécurité', responsableId: 'e-admin' }],
  },
  {
    id: 'dep-fin',
    code: 'FIN',
    nom: 'Finance & Comptabilité',
    description: 'Comptabilité, trésorerie et déclarations fiscales et sociales.',
    responsableId: 'e-mariam',
    services: [{ id: 'srv-compta', nom: 'Comptabilité générale', responsableId: 'e-mariam' }],
  },
  {
    id: 'dep-com',
    code: 'COM',
    nom: 'Commercial',
    description: 'Ventes et relation client.',
    responsableId: null,
    services: [{ id: 'srv-client', nom: 'Relation client', responsableId: 'e-fatou' }],
  },
  {
    id: 'dep-sup',
    code: 'SUP',
    nom: 'Support & Exploitation',
    description: 'Assistance aux utilisateurs et exploitation des services.',
    responsableId: null,
    services: [{ id: 'srv-support', nom: 'Support utilisateurs', responsableId: 'e-brice' }],
  },
];

const ENFANTS_SEED: Record<string, number> = { 'e-koffi': 1, 'e-aicha': 2, 'e-mariam': 1, 'e-gildas': 3, 'e-fatou': 0, 'e-nadege': 1 };

const TERMINAL: Record<SourcePointage, string> = {
  biometrique: 'Biométrique (RDC)',
  web: 'Portail Web',
  mobile: 'Mobile (GPS)',
  regularisation: 'Portail Web (Régul.)',
};

export function creerBaseInitiale(): Database {
  const rand = prng(20241024);
  const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const now = new Date();
  const today = dateKey(now);
  const nowMin = minutesDepuisMinuit(heureHM(now));
  const annee = today.slice(0, 4);
  const moisCourant = moisDe(today);
  // Jours fériés de l'année précédente, en cours et suivante
  const PARAMETRES: Parametres = {
    ...PARAMETRES_BASE,
    // Reprise des soldes au 1er janvier de l'année précédente ; le registre de pointage commence avec l'historique généré
    dateRepriseSoldes: `${Number(annee) - 1}-01-01`,
    dateDebutPointage: today,
    joursFeries: [Number(annee) - 1, Number(annee), Number(annee) + 1].flatMap(joursFeriesBenin),
  };
  const feries = ensembleFeries(PARAMETRES);
  const RH = 'Aïcha Dossou';

  const employes: Employe[] = EMPLOYES.map((e) => ({
    id: e.id,
    matricule: e.matricule,
    civilite: e.civilite,
    prenom: e.prenom,
    nom: e.nom,
    dateNaissance: e.dateNaissance,
    nationalite: e.nationalite ?? 'Béninoise',
    poste: e.poste,
    departement: e.departement,
    service: SERVICE_SEED[e.id] ?? '',
    dateEmbauche: e.dateEmbauche,
    dateSortie: null,
    avantagesNature: AVANTAGES_SEED[e.id] ?? [],
    dirigeant: e.id === 'e-gildas',
    premierEmploi: e.id === 'e-nadege',
    contrat: e.contrat,
    categorie: CATEGORIE_SEED[e.id] ?? 'execution',
    enfantsACharge: ENFANTS_SEED[e.id] ?? 0,
    heuresHebdo: 40,
    responsable: e.responsable,
    lieuTravail: 'Siège Cotonou',
    telPro: e.telPro,
    telPerso: e.telPerso,
    emailPro: e.emailPro,
    emailPerso: e.emailPerso,
    adresse: e.adresse,
    urgenceNom: e.urgenceNom,
    urgenceTel: e.urgenceTel,
    cnss: e.cnss,
    ifu: e.ifu,
    compteBancaire: e.compteBancaire,
    npi: e.npi,
    npiVerifie: true,
    salaireBase: e.salaireBase,
    primesFixes: [],
    avatarUrl: e.avatarUrl ?? '',
  }));

  /* ---------- Carrières ---------- */
  const moisRelatif = (n: number) => {
    let m = moisCourant;
    for (let i = 0; i < Math.abs(n); i++) m = moisDe(n > 0 ? ajouterJours(dernierDuMois(m), 1) : ajouterJours(`${m}-01`, -1));
    return `${m}-01`;
  };
  const evolutions: EvolutionCarriere[] = [];
  employes.forEach((emp) => {
    let precedente: EvolutionCarriere | null = null;
    for (const etape of PARCOURS[emp.id] ?? []) {
      const dateEffet = typeof etape.date === 'number' ? moisRelatif(etape.date) : etape.date;
      const apres = { poste: etape.poste, departement: etape.departement ?? emp.departement, salaireBase: etape.salaire, primesFixes: etape.primes };
      const ev: EvolutionCarriere = {
        id: `ev-seed-${evolutions.length + 1}`,
        reference: `EV-${dateEffet.slice(0, 4)}-${String(evolutions.length + 1).padStart(4, '0')}`,
        employeId: emp.id,
        type: etape.type,
        dateEffet,
        avant: precedente ? precedente.apres : null,
        apres,
        motif: etape.motif,
        decidePar: RH,
        dateDecision: instant(etape.type === 'embauche' ? dateEffet : ouvreAvant(ajouterJours(dateEffet < today ? dateEffet : today, -12)), '10:00'),
        statut: dateEffet <= today ? 'appliquee' : 'planifiee',
        documentId: null,
      };
      evolutions.push(ev);
      if (ev.statut === 'appliquee') Object.assign(emp, { ...apres, primesFixes: apres.primesFixes.map((p) => ({ ...p })) });
      precedente = ev;
    }
  });

  const comptes: Compte[] = EMPLOYES.map((e) => ({
    id: `c-${e.id.slice(2)}`,
    email: e.email,
    motDePasse: e.motDePasse,
    role: e.role,
    employeId: e.id,
    actif: true,
    tentativesEchouees: 0,
    verrouilleJusqua: null,
    derniereConnexion: null,
  }));

  const audit: AuditEntry[] = [];
  const notifications: Notification[] = [];
  let auditSeq = 0;
  const log = (date: string, acteur: string, acteurRole: AuditEntry['acteurRole'], action: AuditEntry['action'], cible: string, employeId: string | null, details: string) =>
    audit.push({ id: `a-seed-${++auditSeq}`, date, acteur, acteurRole, compteId: null, action, cible, employeId, details });
  let notifSeq = 0;
  const notifier = (n: Omit<Notification, 'id' | 'lu'> & { lu?: boolean }) =>
    notifications.push({ id: `n-seed-${++notifSeq}`, lu: false, ...n });

  /* ---------- Congés ---------- */
  const conges: DemandeConge[] = [];
  let congeSeq = 0;
  const conge = (
    employeId: string,
    type: DemandeConge['type'],
    debut: string,
    fin: string,
    statut: DemandeConge['statut'],
    dateDemande: string,
    motif: string,
    validateur: string,
    debutPeriode: DemandeConge['debutPeriode'] = 'matin',
    finPeriode: DemandeConge['finPeriode'] = 'fin',
  ) => {
    const traite = statut !== 'en_attente';
    const c: DemandeConge = {
      id: `cg-seed-${++congeSeq}`,
      reference: `CG-${annee}-${String(congeSeq + 7).padStart(4, '0')}`,
      employeId,
      type,
      debut,
      debutPeriode,
      fin,
      finPeriode,
      jours: dureeConge(debut, fin, debutPeriode, finPeriode, feries),
      motif,
      justificatif: type === 'maladie' ? 'certificat_medical.pdf' : null,
      statut,
      dateDemande: instant(dateDemande, '09:12'),
      validateur,
      traitePar: traite ? RH : null,
      dateTraitement: traite ? instant(ajouterJours(dateDemande, 1), '10:30') : null,
      commentaireRH: statut === 'refuse' ? 'Période de mise en production : merci de décaler la demande.' : '',
    };
    conges.push(c);
    return c;
  };

  let debutCpKoffi = ajouterJours(today, 14);
  while (jourSemaine(debutCpKoffi) !== 2) debutCpKoffi = ajouterJours(debutCpKoffi, 1);
  conge('e-koffi', 'conge_paye', debutCpKoffi, ajouterJours(debutCpKoffi, 6), 'en_attente', ouvreAvant(ajouterJours(today, -2)), 'Congé familial planifié.', 'Direction Tech (N+1)');
  const permKoffi = ouvreAvant(ajouterJours(today, -20));
  const permissionKoffi = conge('e-koffi', 'permission', permKoffi, permKoffi, 'approuve', ajouterJours(permKoffi, -3), 'Mariage d’un frère.', 'RH & Paie');
  permissionKoffi.motifPermission = 'mariage_famille';
  const cpKoffi = lundi(ajouterJours(today, -70));
  conge('e-koffi', 'conge_paye', cpKoffi, ajouterJours(cpKoffi, 3), 'approuve', ajouterJours(cpKoffi, -13), 'Vacances.', 'Direction Tech (N+1)', 'midi');
  const malKoffi = ajouterJours(lundi(ajouterJours(today, -130)), 2);
  conge('e-koffi', 'maladie', malKoffi, ajouterJours(malKoffi, 1), 'approuve', malKoffi, 'Arrêt maladie (paludisme).', 'RH & Paie');

  conge('e-brice', 'conge_paye', ajouterJours(today, -3), ajouterJours(today, 4), 'approuve', ajouterJours(today, -20), 'Congé annuel.', 'Direction Tech (N+1)');
  const cpMariam = lundi(ajouterJours(today, 21));
  conge('e-mariam', 'conge_paye', cpMariam, ajouterJours(cpMariam, 2), 'en_attente', ouvreAvant(ajouterJours(today, -1)), 'Voyage familial à Parakou.', 'Direction Financière (N+1)');
  const permNadege = ouvreApres(ajouterJours(today, 10));
  conge('e-nadege', 'permission', permNadege, permNadege, 'en_attente', ouvreAvant(today), 'Soutenance de master.', 'RH & Paie').motifPermission = 'examen';
  const refusRod = lundi(ajouterJours(today, -40));
  conge('e-rodrigue', 'conge_paye', refusRod, ajouterJours(refusRod, 4), 'refuse', ajouterJours(refusRod, -10), 'Repos.', 'Direction Tech (N+1)');
  conge('e-gildas', 'conge_paye', lundi(ajouterJours(today, -55)), ajouterJours(lundi(ajouterJours(today, -55)), 4), 'approuve', ajouterJours(today, -75), 'Congé annuel.', 'Direction Générale');

  const enConge = (employeId: string, key: string) =>
    conges.some((c) => c.employeId === employeId && c.statut === 'approuve' && c.debut <= key && key <= c.fin);

  /* ---------- Pointages ---------- */
  const veille = ouvreAvant(ajouterJours(today, -1));
  const oubliKoffi = ouvreAvant(ajouterJours(today, -16));
  const mardiKoffi = (() => {
    let k = ajouterJours(today, -1);
    while (jourSemaine(k) !== 2) k = ajouterJours(k, -1);
    return k;
  })();

  const geoSite = (): GeoPoint => {
    const lat = SITE.lat + (rand() - 0.5) * 0.0005;
    const lng = SITE.lng + (rand() - 0.5) * 0.0005;
    return { lat, lng, precision: ri(8, 25), distance: ri(5, 40), dansZone: true };
  };
  const geoHorsZone = (): GeoPoint => {
    const distance = ri(1200, 3800);
    return { lat: SITE.lat + distance / 111000, lng: SITE.lng + (rand() - 0.5) * 0.01, precision: ri(15, 40), distance, dansZone: false };
  };

  const pointages: Pointage[] = [];
  let ptSeq = 0;
  // Historique de pointage : au moins le mois précédent complet (base de la dernière paie)
  const debutMoisPrecedent = moisDe(ajouterJours(`${moisCourant}-01`, -1)) + '-01';
  const debutHisto = ajouterJours(today, -45) < debutMoisPrecedent ? ajouterJours(today, -45) : debutMoisPrecedent;
  PARAMETRES.dateDebutPointage = debutHisto;

  for (const e of EMPLOYES) {
    for (let k = debutHisto; k <= today; k = ajouterJours(k, 1)) {
      if (!estOuvre(k) || feries.has(k) || enConge(e.id, k)) continue;
      const estKoffi = e.id === 'e-koffi';
      // Koffi pointe lui-même aujourd'hui (démonstration caméra + géolocalisation)
      if (k === today && estKoffi) continue;
      if (!estKoffi && rand() < 0.02 && k !== today) continue;

      let arr: number;
      let dep = minutesDepuisMinuit('17:00') + ri(0, 45);
      let pause = ri(45, 75);
      let source = e.source;
      let terminal = TERMINAL[source];

      const recent = k >= ajouterJours(today, -10);
      if (estKoffi && recent && SEMAINE_KOFFI[jourSemaine(k)]) {
        const s = SEMAINE_KOFFI[jourSemaine(k)];
        arr = minutesDepuisMinuit(s.arr);
        dep = minutesDepuisMinuit(s.dep);
        pause = s.pause;
        source = s.source;
        terminal = s.terminal;
        if (jourSemaine(k) === 2 && k !== mardiKoffi) {
          arr = minutesDepuisMinuit('07:58');
          source = 'biometrique';
          terminal = TERMINAL.biometrique;
        }
      } else if (e.id === 'e-rodrigue' && k === veille) {
        arr = minutesDepuisMinuit('08:37');
      } else if (rand() < e.profilRetard) {
        arr = minutesDepuisMinuit('08:00') + ri(12, 42);
      } else {
        arr = minutesDepuisMinuit('07:45') + (rand() < 0.15 ? ri(15, 23) : ri(0, 14));
      }

      let depart: string | null = instant(k, hm(dep));
      if (k === today) {
        if (nowMin < arr + 1) continue;
        if (nowMin < dep) {
          depart = null;
          pause = nowMin > 14 * 60 ? pause : 0;
        }
      }
      if (estKoffi && k === oubliKoffi) {
        source = 'regularisation';
        terminal = TERMINAL.regularisation;
      }

      const arrivee = instant(k, hm(arr));
      const mobile = source === 'mobile' || source === 'web';
      const geo = mobile && rand() < 0.3 && e.id === 'e-fatou' ? geoHorsZone() : geoSite();
      pointages.push({
        id: `pt-seed-${++ptSeq}`,
        employeId: e.id,
        date: k,
        arrivee,
        depart,
        pauseMinutes: pause,
        pauseDebut: null,
        source,
        terminal,
        retardMinutes: calculerRetard(arrivee, PARAMETRES),
        geo,
        geoDepart: depart ? geo : null,
        photo: null,
        horodatage: 'serveur',
      });
    }
  }

  /* ---------- Régularisations ---------- */
  const regularisations: Regularisation[] = [
    {
      id: 'rg-seed-1',
      reference: `REG-${annee}-2490`,
      employeId: 'e-koffi',
      type: 'retard',
      date: mardiKoffi,
      entree: '08:24',
      depart: '17:38',
      motif: 'Mission extérieure client',
      justificatif: 'ordre_de_mission.pdf',
      statut: 'approuve',
      dateDemande: instant(mardiKoffi, '11:05'),
      traitePar: 'Direction RH',
      dateTraitement: instant(mardiKoffi, '15:20'),
      commentaireRH: 'Ordre de mission vérifié.',
    },
    {
      id: 'rg-seed-2',
      reference: `REG-${annee}-2412`,
      employeId: 'e-koffi',
      type: 'oubli',
      date: oubliKoffi,
      entree: '07:57',
      depart: '17:20',
      motif: 'Incident réseau campus régularisé',
      justificatif: null,
      statut: 'approuve',
      dateDemande: instant(oubliKoffi, '17:45'),
      traitePar: 'Direction RH',
      dateTraitement: instant(ajouterJours(oubliKoffi, 1), '09:10'),
      commentaireRH: '',
    },
    {
      id: 'rg-seed-3',
      reference: `REG-${annee}-2531`,
      employeId: 'e-rodrigue',
      type: 'retard',
      date: veille,
      entree: '08:37',
      depart: '17:30',
      motif: 'Panne de moto sur la route de Godomey, facture du garage jointe.',
      justificatif: 'facture_garage.pdf',
      statut: 'en_attente',
      dateDemande: instant(veille, '09:02'),
      traitePar: null,
      dateTraitement: null,
      commentaireRH: '',
    },
    {
      id: 'rg-seed-4',
      reference: `REG-${annee}-2534`,
      employeId: 'e-fatou',
      type: 'mission',
      date: ouvreAvant(ajouterJours(veille, -1)),
      entree: '08:30',
      depart: '16:45',
      motif: 'Rendez-vous client à Porto-Novo avant de rejoindre le siège.',
      justificatif: null,
      statut: 'en_attente',
      dateDemande: instant(ouvreAvant(ajouterJours(veille, -1)), '17:10'),
      traitePar: null,
      dateTraitement: null,
      commentaireRH: '',
    },
  ];

  /* ---------- Documents ---------- */
  const documents: DocumentGenere[] = [];
  let docSeq = 0;
  const genererDoc = (employe: Employe, modele: DocumentGenere['modele'], params: Record<string, string>, dateISO: string, generePar: string) => {
    const doc = construireDocument({ id: `doc-seed-${++docSeq}`, employe, modele, params, dateISO, generePar, sequence: 800 + docSeq });
    documents.push(doc);
    return doc;
  };
  const koffi = employes[0];
  const moisPrecedent = moisDe(ajouterJours(`${moisCourant}-01`, -1));

  // Avenants des évolutions (hors embauche)
  evolutions
    .filter((ev) => ev.type !== 'embauche')
    .forEach((ev) => {
      const emp = employes.find((x) => x.id === ev.employeId)!;
      const doc = genererDoc(
        emp,
        'avenant',
        { evolutionId: ev.id, typeLibelle: LIBELLE_EVOLUTION[ev.type], dateEffet: dateCourte(ev.dateEffet), poste: ev.apres.poste },
        ev.dateDecision,
        RH,
      );
      ev.documentId = doc.id;
    });

  // Paies versées depuis janvier : bulletins distribués automatiquement à chaque versement
  const campagnesPaie: CampagnePaie[] = [];
  const dbPaie = { employes, pointages, conges, evolutions, campagnesPaie, sorties: [], parametres: PARAMETRES } as unknown as Database;
  const moisHisto = moisDe(debutHisto);
  for (let m = 1; m < Number(moisCourant.slice(5)); m++) {
    const mois = `${annee}-${String(m).padStart(2, '0')}`;
    const lignes = employesAPayer(dbPaie, mois)
      .map((e) => calculerLignePaie(dbPaie, e, mois, { todayKey: today, sansPointages: mois < moisHisto }))
      .filter((l): l is NonNullable<typeof l> => l !== null);
    const jourPaie = ouvreAvant(dernierDuMois(mois));
    const campagne: CampagnePaie = {
      id: `pay-seed-${m}`,
      reference: `PAIE-${mois}`,
      mois,
      statut: 'payee',
      lignes,
      creePar: 'Nadège Kpadonou',
      dateCreation: instant(ajouterJours(jourPaie, -4), '09:00'),
      dateCalcul: instant(ajouterJours(jourPaie, -2), '15:00'),
      valideePar: RH,
      dateValidation: instant(ajouterJours(jourPaie, -1), '11:00'),
      payeePar: RH,
      datePaiement: instant(jourPaie, '16:00'),
      modePaiement: 'Virement bancaire',
    };
    campagnesPaie.push(campagne);
    lignes.forEach((l) =>
      genererDoc(
        employes.find((x) => x.id === l.employeId)!,
        'bulletin_paie',
        { mois, campagneId: campagne.id, net: fcfa(l.net), datePaiement: `payé le ${dateCourte(jourPaie)}` },
        campagne.datePaiement!,
        'Système (paie)',
      ),
    );
  }
  genererDoc(koffi, 'fiche_emargement', { mois: moisPrecedent }, instant(`${moisCourant}-01`, '07:00'), 'Système (pointage)');
  genererDoc(koffi, 'attestation_travail', {}, instant(ouvreAvant(ajouterJours(today, -40)), '10:15'), RH);
  conges
    .filter((c) => c.employeId === 'e-koffi' && c.statut === 'approuve' && c.type !== 'maladie')
    .forEach((c) =>
      genererDoc(koffi, 'titre_conge', { congeId: c.id, periode: `${dateCourte(c.debut)} — ${dateCourte(c.fin)}`, jours: String(c.jours) }, c.dateTraitement!, RH),
    );

  const jourAttSal = ouvreAvant(ajouterJours(today, -2));
  const attSalaire = genererDoc(koffi, 'attestation_salaire', { destinataire: 'BOA Bénin — Agence Principale Cotonou' }, instant(jourAttSal, '14:40'), RH);

  const demandesDocuments: DemandeDocument[] = [
    {
      id: 'dd-seed-1',
      reference: 'AT-SAL-882',
      employeId: 'e-koffi',
      type: 'attestation_salaire',
      destinataire: 'BOA Bénin — Agence Principale Cotonou',
      format: 'digital',
      commentaire: 'Préciser la confirmation de CDI et le salaire net moyen des 3 derniers mois.',
      statut: 'pret',
      dateDemande: instant(ouvreAvant(ajouterJours(jourAttSal, -1)), '09:30'),
      traitePar: RH,
      dateTraitement: attSalaire.date,
      documentId: attSalaire.id,
      commentaireRH: '',
    },
    {
      id: 'dd-seed-2',
      reference: 'AT-EMP-891',
      employeId: 'e-koffi',
      type: 'attestation_travail',
      destinataire: 'Ambassade de France — Demande de visa',
      format: 'digital',
      commentaire: '',
      statut: 'en_attente',
      dateDemande: instant(veille, '16:05'),
      traitePar: null,
      dateTraitement: null,
      documentId: null,
      commentaireRH: '',
    },
    {
      id: 'dd-seed-3',
      reference: 'AT-SAL-893',
      employeId: 'e-fatou',
      type: 'attestation_salaire',
      destinataire: 'Ecobank Bénin — Prêt immobilier',
      format: 'paper',
      commentaire: 'Joindre le détail des primes.',
      statut: 'en_attente',
      dateDemande: instant(ouvreAvant(today), '08:47'),
      traitePar: null,
      dateTraitement: null,
      documentId: null,
      commentaireRH: '',
    },
  ];

  /* ---------- Notifications ---------- */
  notifier({
    date: permissionKoffi.dateTraitement!,
    pour: { employeId: 'e-koffi' },
    titre: `Congé ${permKoffi.slice(8, 10)}/${permKoffi.slice(5, 7)} approuvé`,
    message: 'Validation managériale confirmée',
    lien: '/employe/conges',
    niveau: 'succes',
    lu: true,
  });
  notifier({
    date: instant(dernierDuMois(moisPrecedent), '18:00'),
    pour: { employeId: 'e-koffi' },
    titre: 'Fiche de paie disponible',
    message: `${moisLong(moisPrecedent)} • net versé ${fcfa(campagnesPaie.find((c) => c.mois === moisPrecedent)?.lignes.find((l) => l.employeId === 'e-koffi')?.net ?? 0)}`,
    lien: '/employe/documents',
    niveau: 'info',
    lu: true,
  });
  notifier({
    date: instant(attSalaire.date.slice(0, 10), '14:41'),
    pour: { employeId: 'e-koffi' },
    titre: 'Attestation de salaire prête',
    message: 'Disponible dans votre coffre-fort numérique',
    lien: '/employe/documents',
    niveau: 'succes',
  });
  notifier({
    date: instant(veille, '08:00'),
    pour: { role: 'employe' },
    titre: 'Clôture congés annuels',
    message: 'Échéance vendredi 17h00',
    niveau: 'alerte',
  });
  notifier({
    date: conges[5].dateDemande,
    pour: { role: 'rh' },
    titre: 'Nouvelle demande de congé',
    message: 'Mariam Bello — Congé Annuel Payé (3 j)',
    lien: '/rh/conges',
    niveau: 'info',
  });
  notifier({
    date: conges[0].dateDemande,
    pour: { role: 'rh' },
    titre: 'Nouvelle demande de congé',
    message: 'Koffi Mensah — Congé Annuel Payé (5 j)',
    lien: '/rh/conges',
    niveau: 'info',
  });
  notifier({
    date: regularisations[2].dateDemande,
    pour: { role: 'rh' },
    titre: 'Régularisation à traiter',
    message: `Rodrigue Hounkpatin — retard du ${dateCourte(veille)}`,
    lien: '/rh/pointages',
    niveau: 'alerte',
  });
  notifier({
    date: demandesDocuments[2].dateDemande,
    pour: { role: 'rh' },
    titre: 'Demande de document',
    message: 'Fatou Sanni — Attestation de salaire (papier)',
    lien: '/rh/documents',
    niveau: 'info',
  });

  /* ---------- Traçabilité ---------- */
  const nomDe = (id: string) => {
    const e = employes.find((x) => x.id === id)!;
    return `${e.prenom} ${e.nom}`;
  };
  conges.forEach((c) => {
    log(c.dateDemande, nomDe(c.employeId), 'employe', 'DEMANDE_CONGE', c.reference, c.employeId, `${c.jours} j du ${dateCourte(c.debut)} au ${dateCourte(c.fin)}`);
    if (c.statut !== 'en_attente')
      log(c.dateTraitement!, RH, 'rh', c.statut === 'approuve' ? 'VALIDATION_CONGE' : 'REFUS_CONGE', c.reference, c.employeId, c.commentaireRH || 'Décision enregistrée');
  });
  regularisations.forEach((r) => {
    log(r.dateDemande, nomDe(r.employeId), 'employe', 'DEMANDE_REGULARISATION', r.reference, r.employeId, r.motif);
    if (r.statut === 'approuve') log(r.dateTraitement!, RH, 'rh', 'VALIDATION_REGULARISATION', r.reference, r.employeId, r.commentaireRH || 'Validée');
  });
  documents.forEach((d) =>
    log(d.date, d.generePar, d.generePar.startsWith('Système') ? 'systeme' : 'rh', 'GENERATION_DOCUMENT', d.reference, d.employeId, d.titre),
  );
  evolutions.forEach((ev) =>
    log(
      ev.dateDecision,
      ev.decidePar,
      'rh',
      'EVOLUTION_CARRIERE',
      `${nomDe(ev.employeId)} — ${LIBELLE_EVOLUTION[ev.type]}`,
      ev.employeId,
      `${ev.apres.poste} • ${fcfa(ev.apres.salaireBase)} • effet ${dateCourte(ev.dateEffet)}${ev.statut === 'planifiee' ? ' (planifiée)' : ''}`,
    ),
  );
  campagnesPaie.forEach((c) =>
    log(c.datePaiement!, c.payeePar!, 'rh', 'PAIEMENT_SALAIRES', c.reference, null, `${c.lignes.length} bulletin(s) distribué(s) • net ${fcfa(c.lignes.reduce((t, l) => t + l.net, 0))}`),
  );
  pointages
    .filter((p) => p.date >= ajouterJours(today, -3) && p.retardMinutes > PARAMETRES.toleranceRetard)
    .forEach((p) => log(p.arrivee, 'Système', 'systeme', 'RETARD_DETECTE', nomDe(p.employeId), p.employeId, `Arrivée ${heureHM(p.arrivee)} • ${p.retardMinutes} min de retard`));
  pointages
    .filter((p) => p.date === today && p.retardMinutes > PARAMETRES.toleranceRetard)
    .forEach((p) =>
      notifier({
        date: p.arrivee,
        pour: { role: 'rh' },
        titre: 'Retard détecté',
        message: `${nomDe(p.employeId)} — arrivée ${heureHM(p.arrivee)} (${p.retardMinutes} min)`,
        lien: '/rh/pointages',
        niveau: 'alerte',
      }),
    );

  return {
    version: 8,
    comptes,
    employes,
    pointages,
    conges,
    regularisations,
    demandesDocuments,
    documents,
    notifications,
    audit,
    evolutions,
    campagnesPaie,
    sorties: [],
    departements: DEPARTEMENTS_SEED.map((d) => ({ ...d, services: d.services.map((x) => ({ ...x })), dateCreation: instant('2016-01-04', '09:00') })),
    permissions: { admin: [...PERMISSIONS_PAR_DEFAUT.admin], rh: [...PERMISSIONS_PAR_DEFAUT.rh], employe: [] },
    parametres: PARAMETRES,
  };
}
