export type Role = 'employe' | 'rh' | 'admin';

/* ---------- Comptes & session ---------- */

export interface Compte {
  id: string;
  email: string;
  motDePasse: string;
  role: Role;
  employeId: string;
  actif: boolean;
  tentativesEchouees: number;
  verrouilleJusqua: string | null;
  derniereConnexion: string | null;
}

export interface User {
  compteId: string;
  employeId: string;
  email: string;
  role: Role;
  prenom: string;
  nom: string;
  departement: string;
  matricule: string;
  avatarUrl: string;
}

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  badge?: 'conges' | 'regularisations' | 'documents' | 'paie' | 'demandes' | 'absences';
  /** Permission(s) requise(s) pour voir l'entrée — l'une d'elles suffit (RH : selon la matrice des rôles) */
  permission?: Permission | Permission[];
}

/* ---------- Rôles & permissions ---------- */

/** Droits de gestion attribuables par rôle (l'admin les détient tous ; l'employé n'a que le libre-service) */
export type Permission =
  | 'tableau_bord.consulter'
  | 'collaborateurs.gerer'
  | 'collaborateurs.supprimer'
  | 'donnees_sensibles.consulter'
  | 'organisation.gerer'
  | 'presences.gerer'
  | 'absences.gerer'
  | 'conges.valider'
  | 'permissions.valider'
  | 'documents.gerer'
  | 'paie.gerer'
  | 'rapports.consulter'
  | 'audit.consulter'
  | 'parametres.gerer'
  | 'comptes.gerer';

/* ---------- Organisation ---------- */

export interface Service {
  id: string;
  nom: string;
  responsableId: string | null;
}

export interface Departement {
  id: string;
  code: string;
  nom: string;
  description: string;
  responsableId: string | null;
  services: Service[];
  dateCreation: string;
}

/* ---------- Employés ---------- */

export type TypeContrat = 'CDI' | 'CDD' | 'Stage';

/** Catégorie déterminant la durée du préavis (Code du travail art. 53, CCGT art. 31) */
export type CategorieProfessionnelle = 'occasionnel' | 'execution' | 'maitrise_cadre';

export interface Employe {
  id: string;
  matricule: string;
  civilite: 'M.' | 'Mme';
  prenom: string;
  nom: string;
  dateNaissance: string;
  nationalite: string;
  poste: string;
  departement: string;
  /** Service au sein du département ('' = rattaché directement au département) */
  service: string;
  dateEmbauche: string;
  /** Dernier jour sous contrat (sortie enregistrée) ; null tant que le collaborateur est en poste */
  dateSortie: string | null;
  contrat: TypeContrat;
  categorie: CategorieProfessionnelle;
  /** Enfants à charge de moins de 15 ans (congé supplémentaire des mères, art. 158) */
  enfantsACharge: number;
  /** Avantages en nature fournis, évalués au forfait (CGI art. 123) */
  avantagesNature: TypeAvantageNature[];
  /** Barème « dirigeants et cadres supérieurs » des avantages en nature (CGI art. 123-3) */
  dirigeant: boolean;
  /** Premier emploi d'un salarié béninois : VPS exonéré 2 ans (CGI art. 192-4) */
  premierEmploi: boolean;
  heuresHebdo: number;
  responsable: string;
  lieuTravail: string;
  telPro: string;
  telPerso: string;
  emailPro: string;
  emailPerso: string;
  adresse: string;
  urgenceNom: string;
  urgenceTel: string;
  cnss: string;
  ifu: string;
  compteBancaire: string;
  npi: string;
  npiVerifie: boolean;
  /** Salaire de base mensuel en vigueur (mis à jour uniquement par les évolutions de carrière) */
  salaireBase: number;
  /** Primes et indemnités versées chaque mois */
  primesFixes: PrimeFixe[];
  avatarUrl: string;
}

export type TypeAvantageNature = 'logement' | 'domesticite' | 'electricite' | 'eau' | 'telephone' | 'nourriture' | 'vehicule_4_roues' | 'vehicule_2_roues';

/* ---------- Sortie du salarié ---------- */

export type MotifSortie =
  | 'demission'
  | 'demission_maternite'
  | 'licenciement'
  | 'licenciement_economique'
  | 'faute_lourde'
  | 'fin_cdd'
  | 'rupture_cdd_accord'
  | 'rupture_essai'
  | 'maladie'
  | 'retraite'
  | 'deces';

/** Exécution du préavis : effectué, dispensé par l'employeur (indemnisé), non respecté par le salarié */
export type ExecutionPreavis = 'effectue' | 'dispense_employeur' | 'non_effectue_salarie' | 'sans_objet';

export type CodeRupture = 'preavis' | 'majoration_conge' | 'liberte' | 'conges' | 'licenciement' | 'maladie' | 'retraite' | 'deces';

/** Indemnité de rupture versée avec la dernière paie */
export interface RubriqueRupture {
  code: CodeRupture;
  libelle: string;
  /** Détail du calcul affiché sur le bulletin et le reçu */
  calcul: string;
  montant: number;
  soumisCnss: boolean;
  soumisIts: boolean;
  /** Rémunération exceptionnelle : ITS avec atténuation (CGI art. 126) */
  exceptionnelle: boolean;
  /** Abattement de 25 % sur la base exceptionnelle (indemnités de fin de carrière, CGI art. 126-3-b) */
  abattement25: boolean;
  reference: string;
}

export interface Sortie {
  id: string;
  reference: string;
  employeId: string;
  motif: MotifSortie;
  /** Date de notification écrite de la rupture (CT art. 30 CCGT) */
  dateNotification: string;
  /** Dernier jour sous contrat */
  dateSortie: string;
  preavis: ExecutionPreavis;
  /** Jours de liberté non utilisés du fait de l'employeur pendant le préavis (CT art. 54) */
  joursLiberteNonUtilises: number;
  /** Fin théorique du préavis légal */
  dateFinPreavis: string | null;
  salaireMoyen: number;
  ancienneteAnnees: number;
  joursCongesRestants: number;
  rubriques: RubriqueRupture[];
  /** Indemnité due par le salarié qui n'a pas respecté le préavis (information ; aucune retenue automatique, CT art. 215 à 219) */
  montantDuParSalarie: number;
  observations: string;
  statut: 'planifiee' | 'effective' | 'annulee';
  creePar: string;
  dateCreation: string;
  certificatId: string | null;
  soldeId: string | null;
}

/* ---------- Carrière & rémunération ---------- */

export interface PrimeFixe {
  libelle: string;
  montant: number;
  /** Entre dans l'assiette des cotisations CNSS */
  soumisCnss: boolean;
  /** Entre dans l'assiette de l'ITS */
  soumisIts: boolean;
  /** Remboursement de frais professionnels : exclu du taux horaire et de l'allocation de congé (art. 165, CCGT art. 52) */
  remboursementFrais: boolean;
}

export type TypeEvolution = 'embauche' | 'promotion' | 'augmentation' | 'mutation' | 'reclassement';

export interface SituationContractuelle {
  poste: string;
  departement: string;
  salaireBase: number;
  primesFixes: PrimeFixe[];
}

export interface EvolutionCarriere {
  id: string;
  reference: string;
  employeId: string;
  type: TypeEvolution;
  dateEffet: string;
  avant: SituationContractuelle | null;
  apres: SituationContractuelle;
  motif: string;
  decidePar: string;
  dateDecision: string;
  /** Une évolution planifiée s'applique automatiquement à sa date d'effet */
  statut: 'planifiee' | 'appliquee';
  documentId: string | null;
}

/* ---------- Paie ---------- */

export interface ElementVariable {
  id: string;
  libelle: string;
  montant: number;
  nature: 'prime' | 'retenue';
  /** Pour une prime : soumise aux cotisations CNSS */
  soumisCnss: boolean;
  /** Pour une prime : soumise à l'ITS */
  soumisIts: boolean;
}

/** Heures supplémentaires décomptées par semaine (Code du travail art. 147, CCGT art. 66) */
export interface HeuresSup {
  /** Jour, de la 41e à la 48e heure : +12 % */
  minutes12: number;
  /** Jour, au-delà de la 48e heure : +35 % */
  minutes35: number;
  /** Nuit (21 h – 5 h) en semaine : +50 % */
  minutesNuit: number;
  /** Jour, dimanche ou jour férié : +50 % */
  minutesDimancheFerie: number;
  /** Nuit, dimanche ou jour férié : +100 % */
  minutesDimancheFerieNuit: number;
  /** Heures complémentaires d'un temps partiel (au-delà du contrat, jusqu'à 40 h) : payées sans majoration */
  minutesComplementaires: number;
  montant: number;
}

export interface LignePaie {
  employeId: string;
  matricule: string;
  nom: string;
  poste: string;
  departement: string;
  /** Salaire de base mensuel en vigueur en fin de période */
  salaireReference: number;
  tauxHoraire: number;
  joursCalendaires: number;
  joursContrat: number;
  salaireBase: number;
  primesFixes: PrimeFixe[];
  heuresSup: HeuresSup;
  elements: ElementVariable[];
  /** Prime d'ancienneté (CCGT art. 65) */
  tauxAnciennete: number;
  primeAnciennete: number;
  joursAbsence: number;
  joursSansSolde: number;
  retenueAbsences: number;
  /** Jours de maladie du mois et part non indemnisée par l'employeur (Code du travail art. 38) */
  joursMaladie: number;
  joursMaladieDemiTraitement: number;
  joursMaladieNonIndemnises: number;
  retenueMaladie: number;
  /** Congés payés pris dans le mois (jours ouvrables) et complément d'allocation (art. 165) */
  joursCongePaye: number;
  complementAllocationConge: number;
  /** Jours calendaires de congé de maternité du mois : salaire intégral maintenu (CT art. 170) */
  joursMaternite: number;
  /** Jours fériés du mois (chômés et payés) */
  joursFeries: number;
  brut: number;
  /** Assiette des cotisations CNSS */
  brutCotisable: number;
  /** Assiette de l'ITS et du VPS : brut, sans déduction de la CNSS (CGI art. 122, 193) */
  brutImposable: number;
  cnssSalariale: number;
  /** Base ITS arrondie au millier inférieur (CGI art. 514) */
  baseIts: number;
  its: number;
  /** Redevance ORTB (CGI art. 125-2) : mars et juin */
  redevanceOrtb: number;
  /** Indemnités de rupture du contrat (dernière paie) */
  indemnitesRupture: RubriqueRupture[];
  /** Avantages en nature : valeur imposable ajoutée au brut puis déduite du net (fournis en nature) */
  avantagesNature: { code: TypeAvantageNature; libelle: string; montant: number }[];
  /** Mois exonéré de VPS (premier emploi, CGI art. 192-4) : part exonérée */
  vpsExonere: number;
  autresRetenues: number;
  net: number;
  cnssPatronale: number;
  vps: number;
  coutEmployeur: number;
  compteBancaire: string;
  cnss: string;
  ifu: string;
}

export type StatutCampagne = 'brouillon' | 'validee' | 'payee';

export interface CampagnePaie {
  id: string;
  reference: string;
  mois: string;
  statut: StatutCampagne;
  lignes: LignePaie[];
  creePar: string;
  dateCreation: string;
  dateCalcul: string;
  valideePar: string | null;
  dateValidation: string | null;
  payeePar: string | null;
  datePaiement: string | null;
  modePaiement: string | null;
}

/* ---------- Pointages ---------- */

export interface GeoPoint {
  lat: number;
  lng: number;
  precision: number;
  distance: number;
  dansZone: boolean;
}

export type SourcePointage = 'biometrique' | 'web' | 'mobile' | 'regularisation';

export interface Pointage {
  id: string;
  employeId: string;
  date: string;
  arrivee: string;
  depart: string | null;
  pauseMinutes: number;
  pauseDebut: string | null;
  source: SourcePointage;
  terminal: string;
  retardMinutes: number;
  geo: GeoPoint | null;
  geoDepart: GeoPoint | null;
  photo: string | null;
  horodatage: 'serveur' | 'local';
}

/* ---------- Demandes ---------- */

export type StatutDemande = 'en_attente' | 'approuve' | 'refuse';

export type TypeConge = 'conge_paye' | 'permission' | 'maladie' | 'rtt' | 'sans_solde' | 'maternite' | 'liberte_preavis';
export type MotifPermission =
  | 'deces_proche'
  | 'deces_famille'
  | 'mariage_travailleur'
  | 'mariage_famille'
  | 'naissance'
  | 'examen';
export type DebutPeriode = 'matin' | 'midi';
export type FinPeriode = 'midi' | 'fin';

export interface DemandeConge {
  id: string;
  reference: string;
  employeId: string;
  type: TypeConge;
  debut: string;
  debutPeriode: DebutPeriode;
  fin: string;
  finPeriode: FinPeriode;
  jours: number;
  motif: string;
  justificatif: string | null;
  /** Motif d'une permission exceptionnelle (CCGT art. 54) */
  motifPermission?: MotifPermission;
  /** Congé de maternité (CT art. 170) : date présumée, date réelle de l'accouchement, prolongation pour maladie */
  dateAccouchementPresumee?: string;
  dateAccouchement?: string;
  prolongationMaladie?: boolean;
  statut: StatutDemande;
  dateDemande: string;
  validateur: string;
  traitePar: string | null;
  dateTraitement: string | null;
  commentaireRH: string;
}

export type TypeRegularisation = 'oubli' | 'retard' | 'mission';

export interface Regularisation {
  id: string;
  reference: string;
  employeId: string;
  type: TypeRegularisation;
  date: string;
  entree: string;
  depart: string;
  motif: string;
  justificatif: string | null;
  statut: StatutDemande;
  dateDemande: string;
  traitePar: string | null;
  dateTraitement: string | null;
  commentaireRH: string;
}

export type TypeDocumentDemande = 'attestation_travail' | 'attestation_salaire' | 'certificat_presence' | 'duplicata_paie';
export type FormatDelivrance = 'digital' | 'paper';

export interface DemandeDocument {
  id: string;
  reference: string;
  employeId: string;
  type: TypeDocumentDemande;
  destinataire: string;
  format: FormatDelivrance;
  commentaire: string;
  statut: 'en_attente' | 'pret' | 'refuse';
  dateDemande: string;
  traitePar: string | null;
  dateTraitement: string | null;
  documentId: string | null;
  commentaireRH: string;
  /** Mois concerné (duplicata de bulletin, certificat de présence) */
  mois?: string;
}

/* ---------- Documents générés ---------- */

export type CategorieDocument = 'bulletins' | 'titres_conge' | 'attestations' | 'contrats' | 'pointages';
export type ModeleDocument = TypeDocumentDemande | 'bulletin_paie' | 'titre_conge' | 'fiche_emargement' | 'avenant' | 'certificat_travail' | 'solde_tout_compte';

export interface DocumentGenere {
  id: string;
  reference: string;
  employeId: string;
  modele: ModeleDocument;
  categorie: CategorieDocument;
  titre: string;
  sousTitre: string;
  date: string;
  code: string;
  empreinte: string;
  generePar: string;
  params: Record<string, string>;
}

/* ---------- Notifications & audit ---------- */

export interface Notification {
  id: string;
  date: string;
  pour: { role?: Role; employeId?: string };
  titre: string;
  message: string;
  lien?: string;
  niveau: 'info' | 'succes' | 'alerte';
  lu: boolean;
}

export type ActionAudit =
  | 'CONNEXION'
  | 'DECONNEXION'
  | 'ECHEC_CONNEXION'
  | 'COMPTE_VERROUILLE'
  | 'SESSION_EXPIREE'
  | 'POINTAGE_ARRIVEE'
  | 'POINTAGE_DEPART'
  | 'POINTAGE_PAUSE'
  | 'RETARD_DETECTE'
  | 'POINTAGE_HORS_ZONE'
  | 'DEMANDE_CONGE'
  | 'VALIDATION_CONGE'
  | 'REFUS_CONGE'
  | 'DEMANDE_REGULARISATION'
  | 'VALIDATION_REGULARISATION'
  | 'REFUS_REGULARISATION'
  | 'DEMANDE_DOCUMENT'
  | 'GENERATION_DOCUMENT'
  | 'REFUS_DOCUMENT'
  | 'TELECHARGEMENT_DOCUMENT'
  | 'VERIFICATION_DOCUMENT'
  | 'MODIFICATION_PROFIL'
  | 'CREATION_EMPLOYE'
  | 'MODIFICATION_EMPLOYE'
  | 'ACTIVATION_COMPTE'
  | 'DESACTIVATION_COMPTE'
  | 'DEVERROUILLAGE_COMPTE'
  | 'REINITIALISATION_MOT_DE_PASSE'
  | 'CONSULTATION_DONNEES_SENSIBLES'
  | 'EXPORT_RAPPORT'
  | 'MODIFICATION_PARAMETRES'
  | 'EVOLUTION_CARRIERE'
  | 'APPLICATION_EVOLUTION'
  | 'PREPARATION_PAIE'
  | 'MODIFICATION_PAIE'
  | 'VALIDATION_PAIE'
  | 'REOUVERTURE_PAIE'
  | 'PAIEMENT_SALAIRES'
  | 'SUPPRESSION_EMPLOYE'
  | 'CREATION_DEPARTEMENT'
  | 'MODIFICATION_DEPARTEMENT'
  | 'SUPPRESSION_DEPARTEMENT'
  | 'CHANGEMENT_ROLE'
  | 'MODIFICATION_PERMISSIONS'
  | 'JUSTIFICATION_ABSENCE'
  | 'RELANCE_ABSENCE'
  | 'ACCES_REFUSE'
  | 'SORTIE_EMPLOYE'
  | 'ANNULATION_SORTIE'
  | 'APPLICATION_SORTIE';

export interface AuditEntry {
  id: string;
  date: string;
  acteur: string;
  acteurRole: Role | 'systeme';
  compteId: string | null;
  action: ActionAudit;
  cible: string;
  employeId: string | null;
  details: string;
}

/* ---------- Paramètres ---------- */

export interface JourFerie {
  date: string;
  libelle: string;
  /** Date estimée (fête religieuse mobile fixée chaque année par décret) */
  estime: boolean;
}

export interface Parametres {
  heureDebut: string;
  heureFin: string;
  toleranceRetard: number;
  heuresJour: number;
  site: { nom: string; lat: number; lng: number; rayon: number };
  geolocObligatoire: boolean;
  photoObligatoire: boolean;
  /** Jours ouvrables de congé acquis par mois de service effectif (art. 158 : 2 j minimum) */
  cpParMois: number;
  /** Permissions familiales non déductibles du congé, par an (art. 159 : 10 j maximum) */
  quotaPermissions: number;
  /** Autorise à prendre par anticipation les congés en cours d'acquisition (disposition plus favorable que l'art. 160) */
  anticipationConges: boolean;
  /** Date de reprise des soldes dans SikaRH : les périodes antérieures ne sont pas recalculées */
  dateRepriseSoldes: string;
  /** Début du registre de pointage : les absences antérieures ne sont pas déduites */
  dateDebutPointage: string;
  sessionMinutes: number;
  tentativesMax: number;
  verrouillageMinutes: number;
  joursFeries: JourFerie[];
}

/* ---------- Base centralisée ---------- */

export interface Database {
  version: number;
  comptes: Compte[];
  employes: Employe[];
  pointages: Pointage[];
  conges: DemandeConge[];
  regularisations: Regularisation[];
  demandesDocuments: DemandeDocument[];
  documents: DocumentGenere[];
  notifications: Notification[];
  audit: AuditEntry[];
  evolutions: EvolutionCarriere[];
  campagnesPaie: CampagnePaie[];
  departements: Departement[];
  sorties: Sortie[];
  /** Matrice des droits de gestion par rôle (admin : tous, non modifiable) */
  permissions: Record<Role, Permission[]>;
  parametres: Parametres;
}
