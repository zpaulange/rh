# SikaRH Pro — Frontend

React 18 + TypeScript + Vite + Tailwind CSS (même configuration `brand` que les maquettes HTML).

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # vérification TypeScript + build de production
```

## Comptes de démonstration

| Rôle    | Email                    | Mot de passe |
|---------|--------------------------|--------------|
| Employé | k.mensah@entreprise.bj   | employe123   |
| RH      | rh@entreprise.bj         | rh123        |
| Admin   | admin@entreprise.bj      | admin123     |

Autres employés : `r.hounkpatin@`, `m.bello@`, `f.sanni@`, `b.agossou@`, `n.kpadonou@`, `g.lawson@` (`@entreprise.bj`, mot de passe `employe123`).

Les trois rôles partagent l'écran `/login` ; chacun est redirigé vers son espace
(`/employe/...`, `/rh/...`, `/admin`) et ne peut pas accéder aux autres.

## Liaison Employé ↔ RH

Les deux espaces lisent et écrivent dans une **base centralisée** (`src/db/`) :
persistée dans le navigateur et synchronisée en direct entre onglets
(un employé qui pointe dans un onglet apparaît aussitôt dans l'onglet RH).

| Côté employé | Côté RH |
|---|---|
| Pointe (heure serveur + GPS + photo) | Registre du jour, retards détectés, hors zone, photo |
| Demande un congé | Validation / refus → titre de congé PDF généré, solde recalculé |
| Demande une régularisation | Validation → pointage corrigé, retard justifié |
| Demande un document | Génération du PDF certifié → disponible dans le coffre de l'employé |
| Modifie ses coordonnées | Notification + trace dans le journal d'audit |
| Reçoit les notifications de décision | Reçoit les notifications de nouvelles demandes et d'alertes |

La base de démonstration est générée par rapport à la date du jour ;
elle peut être réinitialisée dans **RH › Paramètres**.

## Fonctionnalités RH

- **Authentification & accès** : verrouillage après N échecs, expiration de session, désactivation d'un compte (effet immédiat).
- **Données sécurisées** : CNSS, IFU, RIB, NPI, salaire masqués ; chaque affichage est journalisé.
- **Détection automatique des retards** : heure d'embauche + tolérance (jours ouvrés uniquement).
- **Droits aux congés** : CP par mois entamé, quota de permissions, RTT issus des heures supplémentaires.
- **PDF** : attestations, certificats de présence, fiches d'émargement, bulletins, titres de congé — avec code de vérification et empreinte SHA-256 (vérifiables dans l'application).
- **Traçabilité** : journal d'audit filtrable et exportable.
- **Notifications automatiques** (cloche dans la barre supérieure).
- **Heure serveur** : en-tête HTTP `Date` du serveur (l'horloge du poste est ignorée).
- **Géolocalisation & photo** au pointage, zone et règles paramétrables.
- **Tableau de bord** dynamique (présence, retards par département, alertes, absences).
- **Rapports** : présence mensuelle, retards, congés, effectif — export CSV (Excel) et PDF.

## Carrière & paie

- **Salaire et poste** ne se modifient que par une **évolution de carrière** (promotion, augmentation, mutation,
  reclassement) : datée, historisée (avant → après), avec **avenant PDF** et notification au collaborateur.
  Une évolution future est **planifiée** puis appliquée automatiquement à sa date d'effet.
- **Paie mensuelle** (RH › Paie) : Préparation → Contrôle & validation → Versement → Bulletins distribués.
  Calcul : salaire au prorata (changement en cours de mois géré jour par jour), primes fixes, heures supplémentaires
  issues des pointages (+12 % / +35 % / +50 % jour de repos), absences non justifiées, CNSS, ITS, VPS.
  Primes et retenues exceptionnelles ajoutables avant validation.
- **Au versement**, chaque collaborateur reçoit automatiquement son **bulletin de paie certifié** dans ses documents.
- Exports : ordre de virement, livre de paie (PDF/CSV), déclaration CNSS.
- Taux et barème ITS : `src/config/paie.ts` — **à faire valider par le cabinet comptable**.

## À brancher sur le backend

Le stockage navigateur sert de base de démonstration. En production, `src/db/actions.ts`
devient la couche d'appels API, et le serveur doit **lui-même** horodater les pointages,
vérifier la géolocalisation, hacher les mots de passe et conserver le journal d'audit
(un client ne peut pas garantir ces contrôles à lui seul).

Les mentions légales imprimées sur les PDF se règlent dans `src/config/entreprise.ts`.

## Structure

```
src/
  auth/            Session, contrôle des rôles
  db/              Base centralisée (store), données de démo (seed), actions métier
  lib/             Règles (retards, droits), heure serveur, géoloc, PDF, CSV, SHA-256, dates
  components/form/ Champs maison : TextInput, PasswordInput, SearchInput, NumberInput, Textarea,
                   Select (liste déroulante avec recherche), DatePicker, TimePicker, Checkbox, Toggle, RadioGroup
  components/ui/   Dialog (alertes et confirmations — aucun alert/confirm natif), ActionMenu (menu ⋮), Modal…
  components/      Layout (menu par rôle, notifications), éléments RH
  pages/employe/   Espace employé (maquettes d'origine) + modales
  pages/rh/        Espace RH + modales
  config/          Informations légales de l'entreprise
```
