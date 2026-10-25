import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ENTREPRISE } from '../config/entreprise';
import { LIBELLE_EVOLUTION, MOTIFS_SORTIE, PAIE } from '../config/paie';
import { cumulsAnnuels, lignePayee, mentionExoneration, rubriquesHeuresSup } from './paie';
import type { Database, DocumentGenere, Employe } from '../types';
import { LIBELLE_CONGE, minutesTravaillees, retardJustifie, estEnRetard } from './rules';
import { ajouterJours, dateCourte, dateKey, dateLongue, dateMoisLong, dureeHM, estOuvre, heureHM, moisDe, moisLong } from './time';

// Les polices standard de jsPDF ne gèrent pas les espaces insécables produits par Intl
const pdfTexte = (s: string) => s.replace(/[  ]/g, ' ');
const fcfa = (n: number) => pdfTexte(`${new Intl.NumberFormat('fr-FR').format(Math.round(n))} FCFA`);


const CATEGORIE_COURTE = { occasionnel: 'travailleur occasionnel, saisonnier ou temporaire', execution: "agent d'exécution", maitrise_cadre: 'agent de maîtrise, cadre ou assimilé' } as const;

const BLEU: [number, number, number] = [37, 99, 235];
const ENCRE: [number, number, number] = [30, 41, 59];
const GRIS: [number, number, number] = [100, 116, 139];

function entete(doc: jsPDF, titre: string, reference: string) {
  doc.setFillColor(...BLEU);
  doc.roundedRect(20, 16, 10, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...ENCRE);
  doc.text(ENTREPRISE.nom, 34, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(ENTREPRISE.adresse, 34, 28);
  doc.text(`${ENTREPRISE.rccm} • ${ENTREPRISE.ifu}`, 34, 32);
  doc.text(`Réf. ${reference}`, 190, 23, { align: 'right' });
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 38, 190, 38);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...ENCRE);
  doc.text(pdfTexte(titre.toUpperCase()), 105, 54, { align: 'center' });
}

function paragraphe(doc: jsPDF, texte: string, y: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...ENCRE);
  const lignes = doc.splitTextToSize(pdfTexte(texte), 170);
  doc.text(lignes, 20, y, { lineHeightFactor: 1.6 });
  return y + lignes.length * 11 * 0.3528 * 1.6 + 4;
}

/** Bloc de signature (≈ 22 mm) ; passe sur une nouvelle page s'il empiète sur le pied de page. Renvoie l'ordonnée utilisée. */
function signature(doc: jsPDF, dateISO: string, yVoulu: number): number {
  let y = yVoulu;
  if (y + 22 > 268) {
    doc.addPage();
    y = 30;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...ENCRE);
  doc.text(`Fait à ${ENTREPRISE.ville}, le ${dateMoisLong(dateKey(new Date(dateISO))).replace(/^0/, '')}`, 190, y, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(pdfTexte(ENTREPRISE.signataire), 190, y + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(ENTREPRISE.fonctionSignataire, 190, y + 15, { align: 'right' });
  doc.text('Signature électronique e-ID', 190, y + 20, { align: 'right' });
  return y;
}

function piedDePage(doc: jsPDF, d: DocumentGenere) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(20, 272, 190, 272);
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.setFont('helvetica', 'bold');
    doc.text(`Code de vérification : ${d.code}`, 20, 277);
    doc.setFont('helvetica', 'normal');
    doc.text(`Empreinte SHA-256 : ${d.empreinte}`, 20, 281);
    doc.text(
      `Document généré le ${dateCourte(dateKey(new Date(d.date)))} à ${heureHM(d.date)} par ${pdfTexte(d.generePar)} • Authenticité vérifiable dans SikaRH (Documents › Vérification)`,
      20,
      285,
    );
    doc.text(`${i} / ${pages}`, 190, 277, { align: 'right' });
  }
}

function tableauPointages(doc: jsPDF, db: Database, e: Employe, mois: string, y: number): number {
  const lignes = db.pointages
    .filter((p) => p.employeId === e.id && moisDe(p.date) === mois)
    .sort((a, b) => a.date.localeCompare(b.date));
  let total = 0;
  const body = lignes.map((p) => {
    const minutes = minutesTravaillees(p, new Date(p.depart ?? p.arrivee));
    total += minutes;
    const statut = estEnRetard(p, db.parametres) ? (retardJustifie(db, p) ? 'Retard justifié' : `Retard ${p.retardMinutes} min`) : "À l'heure";
    return [dateCourte(p.date), heureHM(p.arrivee), p.depart ? heureHM(p.depart) : '—', dureeHM(p.pauseMinutes), dureeHM(minutes), statut, pdfTexte(p.terminal)];
  });
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Arrivée', 'Départ', 'Pause', 'Durée', 'Statut', 'Terminal']],
    body,
    foot: [['Total', '', '', '', dureeHM(total), `${lignes.length} jour(s)`, '']],
    theme: 'grid',
    styles: { fontSize: 8.5, textColor: ENCRE },
    headStyles: { fillColor: BLEU },
    footStyles: { fillColor: [241, 245, 249], textColor: ENCRE, fontStyle: 'bold' },
    margin: { left: 20, right: 20, bottom: 30 },
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
}

/** Construit le PDF d'un document certifié à partir des données centralisées */
export function construirePDF(db: Database, d: DocumentGenere): jsPDF {
  const e = db.employes.find((x) => x.id === d.employeId);
  if (!e) throw new Error('Collaborateur introuvable.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: d.titre, subject: d.reference, author: ENTREPRISE.nom, keywords: d.code });
  const nom = `${e.civilite} ${e.prenom} ${e.nom.toUpperCase()}`;
  const identite = `${nom}, né(e) le ${dateLongue(e.dateNaissance).replace(/^\S+ /, '')}, de nationalité ${e.nationalite.toLowerCase()}, NPI ${e.npi}, matricule ${e.matricule}`;
  let y = 72;

  switch (d.modele) {
    case 'attestation_travail':
    case 'attestation_salaire': {
      entete(doc, d.modele === 'attestation_salaire' ? 'Attestation de salaire' : "Attestation de travail et d'emploi", d.reference);
      y = paragraphe(doc, `${ENTREPRISE.formuleSignataire}, ${ENTREPRISE.signataire}, ${ENTREPRISE.fonctionSignataire.toLowerCase()} de ${ENTREPRISE.nom}, atteste que :`, y);
      y = paragraphe(doc, `${identite},`, y + 2);
      y = paragraphe(
        doc,
        `est employé(e) au sein de notre entreprise depuis le ${dateLongue(e.dateEmbauche).replace(/^\S+ /, '')} en qualité de ${e.poste} (${e.departement}), sous contrat à durée ${e.contrat === 'CDI' ? 'indéterminée (CDI)' : e.contrat === 'CDD' ? 'déterminée (CDD)' : 'de stage'}, pour un horaire de ${e.heuresHebdo} heures par semaine.`,
        y + 2,
      );
      if (d.modele === 'attestation_salaire') {
        const derniers = db.campagnesPaie
          .filter((c) => c.statut === 'payee' && c.lignes.some((l) => l.employeId === e.id))
          .sort((a, b) => b.mois.localeCompare(a.mois))
          .slice(0, 3)
          .map((c) => c.lignes.find((l) => l.employeId === e.id)!);
        const primes = e.primesFixes.reduce((s, p) => s + p.montant, 0);
        y = paragraphe(
          doc,
          `L'intéressé(e) perçoit un salaire de base mensuel brut de ${fcfa(e.salaireBase)}${primes ? `, auquel s'ajoutent des primes et indemnités fixes de ${fcfa(primes)} par mois` : ''}.`,
          y + 2,
        );
        if (derniers.length) {
          const moyenneNet = derniers.reduce((s, l) => s + l.net, 0) / derniers.length;
          const moyenneBrut = derniers.reduce((s, l) => s + l.brut, 0) / derniers.length;
          y = paragraphe(
            doc,
            `Sur les ${derniers.length} dernier(s) mois de paie versés, sa rémunération moyenne s'établit à ${fcfa(moyenneBrut)} brut, soit ${fcfa(moyenneNet)} net par mois.`,
            y,
          );
        }
      }
      if (d.params.destinataire) y = paragraphe(doc, `Destinataire : ${d.params.destinataire}.`, y + 2);
      y = paragraphe(doc, 'La présente attestation est délivrée à la demande de l’intéressé(e) pour servir et valoir ce que de droit.', y + 2);
      signature(doc, d.date, y + 14);
      break;
    }
    case 'certificat_presence':
    case 'fiche_emargement': {
      const mois = d.params.mois;
      entete(doc, d.modele === 'fiche_emargement' ? "Fiche d'émargement mensuelle" : 'Certificat de présence', d.reference);
      y = paragraphe(
        doc,
        d.modele === 'certificat_presence'
          ? `${ENTREPRISE.formuleSignataire}, ${ENTREPRISE.signataire}, certifie que ${nom} (${e.poste}, matricule ${e.matricule}) a été présent(e) à son poste aux dates ci-dessous pour la période de ${moisLong(mois)}, selon le registre horodaté des pointages.`
          : `Collaborateur : ${nom} • ${e.poste} • ${e.departement} • Matricule ${e.matricule}. Période : ${moisLong(mois)}. Horodatage serveur.`,
        y,
      );
      y = tableauPointages(doc, db, e, mois, y + 2);
      signature(doc, d.date, y + 4);
      break;
    }
    case 'bulletin_paie':
    case 'duplicata_paie': {
      const mois = d.params.mois;
      const paye = lignePayee(db, e.id, mois);
      if (!paye) throw new Error(`Aucune paie versée pour ${moisLong(mois)} : bulletin indisponible.`);
      const { campagne, ligne: l } = paye;
      entete(doc, d.modele === 'duplicata_paie' ? 'Duplicata — Bulletin de paie' : 'Bulletin de paie', d.reference);
      const infos: [string, string][] = [
        ['Salarié', `${nom} — ${e.matricule}`],
        ['Emploi', `${l.poste} • ${l.departement}`],
        ['Embauche / contrat', `${dateMoisLong(e.dateEmbauche).replace(/^0/, '')} • ${e.contrat} • ${e.heuresHebdo} h / semaine`],
        ['N° CNSS / IFU', `${e.cnss} • ${e.ifu}`],
        ['Période', `${moisLong(mois)} (${l.joursContrat} / ${l.joursCalendaires} jours sous contrat)`],
        ['Paiement', `${campagne.datePaiement ? dateMoisLong(dateKey(new Date(campagne.datePaiement))).replace(/^0/, '') : '—'} • ${campagne.modePaiement ?? ''} • ${l.compteBancaire}`],
      ];
      autoTable(doc, {
        startY: 62,
        body: infos,
        theme: 'plain',
        styles: { fontSize: 8.5, textColor: ENCRE, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38, textColor: GRIS } },
        margin: { left: 20, right: 20 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

      const h = (m: number) => `${(m / 60).toFixed(2).replace('.', ',')} h`;
      const exoneration = (p: { soumisCnss: boolean; soumisIts: boolean }) => (mentionExoneration(p) ? ` (${mentionExoneration(p)})` : '');
      const corps: (string | number)[][] = [
        ['Salaire de base', fcfa(l.salaireReference), l.joursContrat < l.joursCalendaires ? `prorata ${l.joursContrat}/${l.joursCalendaires}` : '', fcfa(l.salaireBase), ''],
        ...(l.primeAnciennete ? [['Prime d’ancienneté (CCGT art. 65)', fcfa(l.salaireBase), `${l.tauxAnciennete} %`, fcfa(l.primeAnciennete), '']] : []),
        ...l.primesFixes.map((p) => [p.libelle + exoneration(p), '', '', fcfa(p.montant), '']),
        ...rubriquesHeuresSup(l.heuresSup, l.tauxHoraire).map((r) => [r.libelle, h(r.minutes), `${fcfa(l.tauxHoraire)}/h`, fcfa(r.montant), '']),
        ...(l.complementAllocationConge
          ? [[`Complément d’allocation de congé (${l.joursCongePaye} j, règle du 1/12)`, '', '', fcfa(l.complementAllocationConge), '']]
          : []),
        ...l.elements.filter((x) => x.nature === 'prime').map((x) => [x.libelle + exoneration(x), '', '', fcfa(x.montant), '']),
        ...(l.indemnitesRupture ?? []).map((r) => [`${r.libelle} (${r.reference})${exoneration(r)}`, '', '', fcfa(r.montant), '']),
        ...(l.avantagesNature ?? []).map((a) => [`Avantage en nature : ${a.libelle} (forfait CGI art. 123)`, '', '', fcfa(a.montant), '']),
        ...(l.joursCongePaye && !l.complementAllocationConge ? [[`Congés payés (${l.joursCongePaye} j ouvrables, salaire maintenu)`, '', '', 'inclus', '']] : []),
        ...(l.joursFeries ? [[`Jours fériés chômés payés (${l.joursFeries} j)`, '', '', 'inclus', '']] : []),
        ...(l.retenueAbsences
          ? [[`Absences non rémunérées (${l.joursAbsence + l.joursSansSolde} j, salaire et primes)`, '', '', '', fcfa(l.retenueAbsences)]]
          : []),
        ...(l.joursMaternite ? [[`Congé de maternité (${l.joursMaternite} j, salaire maintenu — CT art. 170)`, '', '', 'inclus', '']] : []),
        ...(l.joursMaladie && !l.retenueMaladie ? [[`Maladie (${l.joursMaladie} j, salaire maintenu — CT art. 38)`, '', '', 'inclus', '']] : []),
        ...(l.retenueMaladie
          ? [[`Maladie au-delà du maintien (${l.joursMaladieDemiTraitement} j à 50 %, ${l.joursMaladieNonIndemnises} j non indemnisés)`, '', '', '', fcfa(l.retenueMaladie)]]
          : []),
        [{ content: 'SALAIRE BRUT', styles: { fontStyle: 'bold' } } as unknown as string, '', '', { content: fcfa(l.brut), styles: { fontStyle: 'bold' } } as unknown as string, ''],
        [`Cotisation CNSS salariale`, fcfa(l.brutCotisable), `${(PAIE.tauxCnssSalarial * 100).toFixed(1).replace('.', ',')} %`, '', fcfa(l.cnssSalariale)],
        [`Impôt sur traitements et salaires (ITS)`, fcfa(l.baseIts), 'barème', '', fcfa(l.its)],
        ...(l.redevanceOrtb ? [['Redevance ORTB (CGI art. 125-2)', '', '', '', fcfa(l.redevanceOrtb)]] : []),
        ...((l.avantagesNature ?? []).length ? [['Avantages en nature fournis (déduits du net)', '', '', '', fcfa(l.avantagesNature.reduce((t, a) => t + a.montant, 0))]] : []),
        ...l.elements.filter((x) => x.nature === 'retenue').map((x) => [x.libelle, '', '', '', fcfa(x.montant)]),
      ];
      autoTable(doc, {
        startY: y,
        head: [['Rubrique', 'Base', 'Taux', 'Gains', 'Retenues']],
        body: corps.map((r) => r.map((c) => (typeof c === 'string' ? pdfTexte(c) : c))),
        foot: [['NET À PAYER', '', '', '', fcfa(l.net)]],
        theme: 'grid',
        styles: { fontSize: 8.5, textColor: ENCRE },
        headStyles: { fillColor: BLEU },
        footStyles: { fillColor: [219, 234, 254], textColor: ENCRE, fontStyle: 'bold', fontSize: 10 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        margin: { left: 20, right: 20 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

      const cumuls = cumulsAnnuels(db, e.id, mois);
      autoTable(doc, {
        startY: y,
        head: [['Charges patronales (information)', 'Montant', `Cumuls ${mois.slice(0, 4)}`, 'Montant']],
        body: [
          [`CNSS employeur (${(PAIE.tauxCnssPatronal * 100).toFixed(1).replace('.', ',')} % de ${fcfa(l.brutCotisable)})`, fcfa(l.cnssPatronale), 'Brut cumulé', fcfa(cumuls.brut)],
          [`Versement patronal (VPS ${PAIE.tauxVps * 100} %)${l.vpsExonere ? ` — exonéré ${fcfa(l.vpsExonere)} (1er emploi, CGI art. 192)` : ''}`, fcfa(l.vps), 'ITS cumulé', fcfa(cumuls.its)],
          ['Coût total employeur', fcfa(l.coutEmployeur), 'Net cumulé', fcfa(cumuls.net)],
        ].map((r) => r.map(pdfTexte)),
        theme: 'grid',
        styles: { fontSize: 8, textColor: ENCRE },
        headStyles: { fillColor: [100, 116, 139] },
        columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
        margin: { left: 20, right: 20 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      if (y > 262) {
        doc.addPage();
        y = 30;
      }
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(pdfTexte('Bulletin à conserver sans limitation de durée. Les heures supplémentaires sont issues du registre horodaté des pointages.'), 20, y);
      signature(doc, d.date, y + 10);
      break;
    }
    case 'avenant': {
      entete(doc, 'Avenant au contrat de travail', d.reference);
      const ev = db.evolutions.find((x) => x.id === d.params.evolutionId);
      y = paragraphe(doc, `Entre ${ENTREPRISE.nom}, représentée par ${ENTREPRISE.signataire}, ${ENTREPRISE.fonctionSignataire.toLowerCase()}, et ${identite}, il est convenu ce qui suit :`, y);
      if (ev) {
        const av = ev.avant;
        const ap = ev.apres;
        const primes = (s: typeof ap | null) => (s && s.primesFixes.length ? s.primesFixes.map((p) => `${p.libelle} ${fcfa(p.montant)}`).join(', ') : '—');
        autoTable(doc, {
          startY: y + 2,
          head: [['', 'Situation antérieure', 'Nouvelle situation']],
          body: [
            ['Emploi', av?.poste ?? '—', ap.poste],
            ['Département', av?.departement ?? '—', ap.departement],
            ['Salaire de base mensuel brut', av ? fcfa(av.salaireBase) : '—', fcfa(ap.salaireBase)],
            ['Primes et indemnités mensuelles', primes(av), primes(ap)],
          ].map((r) => r.map(pdfTexte)),
          theme: 'grid',
          styles: { fontSize: 9.5, textColor: ENCRE },
          headStyles: { fillColor: BLEU },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [241, 245, 249] } },
          margin: { left: 20, right: 20 },
        });
        y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        const hausse = av && av.salaireBase ? ((ap.salaireBase - av.salaireBase) / av.salaireBase) * 100 : 0;
        y = paragraphe(
          doc,
          `Article 1 — Nature : ${LIBELLE_EVOLUTION[ev.type].toLowerCase()}${hausse ? ` (revalorisation de ${hausse.toFixed(1).replace('.', ',')} %)` : ''}. Motif : ${ev.motif}`,
          y,
        );
        y = paragraphe(doc, `Article 2 — Date d'effet : les présentes dispositions prennent effet le ${dateMoisLong(ev.dateEffet).replace(/^0/, '')}.`, y);
        y = paragraphe(doc, 'Article 3 — Les autres clauses du contrat de travail demeurent inchangées.', y);
      }
      const ySignature = signature(doc, d.date, y + 10);
      doc.setFontSize(9);
      doc.setTextColor(...GRIS);
      doc.text(pdfTexte('Le salarié (lu et approuvé)'), 20, ySignature + 10);
      break;
    }
    case 'titre_conge': {
      entete(doc, 'Titre officiel de congé', d.reference);
      const c = db.conges.find((x) => x.id === d.params.congeId);
      y = paragraphe(doc, `Le service des Ressources Humaines de ${ENTREPRISE.nom} autorise ${nom} (${e.poste}) à s'absenter dans les conditions suivantes :`, y);
      if (c) {
        let reprise = ajouterJours(c.fin, 1);
        while (!estOuvre(reprise)) reprise = ajouterJours(reprise, 1);
        autoTable(doc, {
          startY: y + 2,
          body: [
            ['Nature', LIBELLE_CONGE[c.type]],
            ['Période', `Du ${dateLongue(c.debut)} (${c.debutPeriode === 'midi' ? 'midi' : 'matin'}) au ${dateLongue(c.fin)} (${c.finPeriode === 'midi' ? 'midi' : 'fin de journée'})`],
            ['Durée', `${c.jours} jour(s) ouvrable(s)`],
            ['Date de reprise', `${dateLongue(reprise)} à ${db.parametres.heureDebut}`],
            ['Demande', `${c.reference} du ${dateCourte(dateKey(new Date(c.dateDemande)))}`],
            ['Validé par', `${c.traitePar ?? '—'} le ${c.dateTraitement ? dateCourte(dateKey(new Date(c.dateTraitement))) : '—'}`],
          ],
          theme: 'grid',
          styles: { fontSize: 10, textColor: ENCRE },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45, fillColor: [241, 245, 249] } },
          margin: { left: 20, right: 20 },
        });
        y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      } else {
        y = paragraphe(doc, `Période : ${d.params.periode} • ${d.params.jours} jour(s) ouvrable(s).`, y + 2);
      }
      signature(doc, d.date, y + 10);
      break;
    }
    case 'certificat_travail': {
      // CT art. 62 : le certificat indique exclusivement les dates d'entrée et de sortie, la nature et les dates des emplois occupés et la catégorie
      entete(doc, 'Certificat de travail', d.reference);
      const sortie = db.sorties.find((x) => x.id === d.params.sortieId);
      const fin = sortie?.dateSortie ?? e.dateSortie ?? dateKey(new Date(d.date));
      y = paragraphe(doc, `${ENTREPRISE.formuleSignataire}, ${ENTREPRISE.signataire}, ${ENTREPRISE.fonctionSignataire.toLowerCase()} de ${ENTREPRISE.nom}, certifie que ${nom}, matricule ${e.matricule}, a été ${e.civilite === 'Mme' ? 'employée' : 'employé'} dans l'entreprise du ${dateMoisLong(e.dateEmbauche).replace(/^0/, '')} au ${dateMoisLong(fin).replace(/^0/, '')}.`, y);
      const etapes = db.evolutions
        .filter((ev) => ev.employeId === e.id && ev.statut === 'appliquee' && ev.dateEffet <= fin)
        .sort((a, b) => a.dateEffet.localeCompare(b.dateEffet));
      const emplois = etapes.length ? etapes.map((ev, i) => ({ poste: ev.apres.poste, du: ev.dateEffet, au: i + 1 < etapes.length ? ajouterJours(etapes[i + 1].dateEffet, -1) : fin })) : [{ poste: e.poste, du: e.dateEmbauche, au: fin }];
      // Fusion des étapes successives au même emploi (une augmentation ne change pas la nature de l'emploi)
      const fusion = emplois.reduce<typeof emplois>((acc, x) => {
        const der = acc[acc.length - 1];
        if (der && der.poste === x.poste) der.au = x.au;
        else acc.push({ ...x });
        return acc;
      }, []);
      y = paragraphe(doc, 'Emplois successivement occupés :', y + 2);
      autoTable(doc, {
        startY: y,
        head: [['Emploi', 'Du', 'Au']],
        body: fusion.map((x) => [x.poste, dateCourte(x.du), dateCourte(x.au)].map(pdfTexte)),
        theme: 'grid',
        styles: { fontSize: 10, textColor: ENCRE },
        headStyles: { fillColor: BLEU },
        margin: { left: 20, right: 20 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      y = paragraphe(doc, `Catégorie professionnelle : ${CATEGORIE_COURTE[e.categorie]}.`, y);
      y = paragraphe(doc, 'Certificat délivré pour servir et valoir ce que de droit. Exempt de tout droit de timbre et d’enregistrement (Code du travail, art. 62).', y + 2);
      signature(doc, d.date, y + 8);
      break;
    }
    case 'solde_tout_compte': {
      entete(doc, 'Reçu pour solde de tout compte', d.reference);
      const sortie = db.sorties.find((x) => x.id === d.params.sortieId);
      const paye = lignePayee(db, e.id, d.params.mois);
      const l = paye?.ligne;
      y = paragraphe(
        doc,
        `${nom}, matricule ${e.matricule}, reconnaît avoir reçu de ${ENTREPRISE.nom}, à l'occasion de la cessation de son contrat de travail (${sortie ? MOTIFS_SORTIE[sortie.motif].libelle.toLowerCase() : 'sortie'}, dernier jour le ${sortie ? dateCourte(sortie.dateSortie) : '—'}), la somme nette de ${l ? fcfa(l.net) : d.params.net}, détaillée ci-dessous :`,
        y,
      );
      if (l) {
        const rupture = (l.indemnitesRupture ?? []).reduce((t, r) => t + r.montant, 0);
        autoTable(doc, {
          startY: y + 2,
          head: [['Élément', 'Référence', 'Montant']],
          body: [
            ['Salaire et accessoires du dernier mois (brut)', moisLong(d.params.mois), fcfa(l.brut - rupture)],
            ...(l.indemnitesRupture ?? []).map((r) => [r.libelle, r.reference, fcfa(r.montant)]),
            ['Total brut', '', fcfa(l.brut)],
            ['Cotisation CNSS salariale', '', `- ${fcfa(l.cnssSalariale)}`],
            ['Impôt sur traitements et salaires', 'CGI art. 125 et 126', `- ${fcfa(l.its)}`],
            ...(l.redevanceOrtb ? [['Redevance ORTB', 'CGI art. 125-2', `- ${fcfa(l.redevanceOrtb)}`]] : []),
            ...(l.autresRetenues ? [['Autres retenues', '', `- ${fcfa(l.autresRetenues)}`]] : []),
          ].map((r) => r.map(pdfTexte)),
          foot: [['NET VERSÉ', '', fcfa(l.net)].map(pdfTexte)],
          theme: 'grid',
          styles: { fontSize: 9, textColor: ENCRE },
          headStyles: { fillColor: BLEU },
          footStyles: { fillColor: [219, 234, 254], textColor: ENCRE, fontStyle: 'bold' },
          columnStyles: { 2: { halign: 'right' } },
          margin: { left: 20, right: 20 },
        });
        y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }
      if (sortie && sortie.montantDuParSalarie > 0)
        y = paragraphe(doc, `Pour information : indemnité de préavis non respecté due par le salarié, ${fcfa(sortie.montantDuParSalarie)} (CT art. 55) ; aucune retenue n'a été opérée sur ce solde.`, y);
      y = paragraphe(
        doc,
        "Conformément à l'article 225 du Code du travail, la mention « pour solde de tout compte » n'est pas opposable au salarié : celui-ci conserve l'intégralité des droits qu'il tient de son contrat, des conventions et de la loi. Un certificat de travail lui est remis (art. 62).",
        y + 2,
      );
      const ySignature = signature(doc, d.date, y + 8);
      doc.setFontSize(9);
      doc.setTextColor(...GRIS);
      doc.text(pdfTexte('Le salarié (signature précédée de la date)'), 20, ySignature + 10);
      break;
    }
  }

  piedDePage(doc, d);
  return doc;
}

export function telechargerPDF(db: Database, d: DocumentGenere): void {
  construirePDF(db, d).save(`${d.reference}.pdf`);
}

/** Rapport administratif tabulaire (paysage) */
export function exporterRapportPDF(titre: string, sousTitre: string, colonnes: string[], lignes: (string | number)[][], fichier: string, auteur: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  doc.setFillColor(...BLEU);
  doc.roundedRect(15, 12, 8, 8, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...ENCRE);
  doc.text(pdfTexte(titre), 27, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(pdfTexte(`${ENTREPRISE.nom} • ${sousTitre}`), 27, 23);
  autoTable(doc, {
    startY: 30,
    head: [colonnes],
    body: lignes.map((l) => l.map((c) => pdfTexte(String(c)))),
    theme: 'striped',
    styles: { fontSize: 8, textColor: ENCRE },
    headStyles: { fillColor: BLEU },
    margin: { left: 15, right: 15, bottom: 16 },
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text(pdfTexte(`Généré le ${dateCourte(dateKey(new Date()))} à ${heureHM(new Date())} par ${auteur} • SikaRH`), 15, 203);
      doc.text(`Page ${n}`, 282, 203, { align: 'right' });
    },
  });
  doc.save(fichier);
}
