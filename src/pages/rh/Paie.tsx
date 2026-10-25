import { useMemo, useState } from 'react';
import { useTelechargement } from '../../components/DocumentUI';
import EmployeCell from '../../components/rh/EmployeCell';
import ActionMenu from '../../components/ui/ActionMenu';
import Badge from '../../components/ui/Badge';
import Card, { THEAD_ROW } from '../../components/ui/Card';
import DecisionModal from '../../components/ui/DecisionModal';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import { PAIE } from '../../config/paie';
import { COMPTES, ecrituresPaie, equilibre } from '../../lib/comptabilite';
import { journaliserExport, payerSalaires, preparerPaie, recalculerPaie, rouvrirPaie, validerPaie } from '../../db/api';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { exporterCSV } from '../../lib/export';
import { campagneDuMois, fcfa, totaux } from '../../lib/paie';
import { exporterRapportPDF } from '../../lib/pdfLazy';
import { dateCourte, dateHeure, dateKey, derniersMois, moisDe, moisLong } from '../../lib/time';
import type { StatutCampagne } from '../../types';
import { ElementVariableModal, LignePaieModal, PaiementModal } from './modals/PaieModals';

const ETAPES = [
  { cle: 'preparation', label: 'Préparation', icone: 'calculate' },
  { cle: 'validation', label: 'Contrôle & validation', icone: 'fact_check' },
  { cle: 'paiement', label: 'Versement', icone: 'payments' },
  { cle: 'bulletins', label: 'Bulletins distribués', icone: 'mark_email_read' },
];

const STATUT: Record<StatutCampagne, { label: string; tone: 'amber' | 'brand' | 'emerald' }> = {
  brouillon: { label: 'En préparation', tone: 'amber' },
  validee: { label: 'Validée — à verser', tone: 'brand' },
  payee: { label: 'Versée', tone: 'emerald' },
};

const nb = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const sansDecimales = (n: number) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export default function Paie() {
  const { user, db, today } = useEspaceRH();
  const dialog = useDialog();
  const telechargerBulletin = useTelechargement();
  const moisDispo = useMemo(() => derniersMois(today, 12), [today]);
  // Par défaut : le plus ancien mois non versé parmi les 3 derniers, sinon le mois courant
  const [mois, setMois] = useState(() => moisDispo.slice(0, 3).reverse().find((m) => campagneDuMois(db, m)?.statut !== 'payee') ?? moisDispo[0]);
  const [detail, setDetail] = useState<string | null>(null);
  const [element, setElement] = useState<string | null>(null);
  const [paiement, setPaiement] = useState(false);
  const [reouverture, setReouverture] = useState(false);

  const campagne = campagneDuMois(db, mois);
  const t = campagne ? totaux(campagne.lignes) : null;
  // 0 préparation • 1 contrôle • 2 versement • 4 terminé
  const etapeCourante = !campagne ? 0 : campagne.statut === 'brouillon' ? 1 : campagne.statut === 'validee' ? 2 : 4;
  const moisCourant = mois === moisDe(today);
  const ligneDe = (id: string | null) => (id && campagne ? (campagne.lignes.find((l) => l.employeId === id) ?? null) : null);
  const employeDe = (id: string) => db.employes.find((e) => e.id === id)!;

  const executer = async (action: () => Promise<unknown>, succes: { titre: string; message: string }) => {
    try {
      await action();
      await dialog.alert({ ...succes, tone: 'success' });
    } catch (err) {
      await dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
    }
  };

  const preparer = async () => {
    const ok = await dialog.confirm({
      titre: `Préparer la paie de ${moisLong(mois)} ?`,
      tone: 'info',
      icon: 'calculate',
      message: 'Le calcul reprend automatiquement les salaires en vigueur (évolutions comprises), les primes fixes, les heures supplémentaires pointées et les absences non justifiées.',
      details: moisCourant ? 'Mois en cours : les absences sont arrêtées à hier. Pensez à recalculer juste avant la validation.' : undefined,
      confirmer: 'Préparer la paie',
    });
    if (ok) await executer(() => preparerPaie(user, mois), { titre: 'Paie préparée', message: 'Contrôlez chaque ligne, ajoutez les primes ou retenues exceptionnelles, puis validez.' });
  };

  const valider = async () => {
    if (!campagne || !t) return;
    const ok = await dialog.confirm({
      titre: `Valider la paie de ${moisLong(mois)} ?`,
      tone: 'warning',
      icon: 'fact_check',
      message: 'Les montants seront verrouillés. Vous pourrez encore rouvrir la paie tant que les salaires ne sont pas versés.',
      details: (
        <div className="grid grid-cols-2 gap-1 font-mono">
          <span className="font-sans text-slate-400">Salariés</span>
          <span className="text-right">{t.effectif}</span>
          <span className="font-sans text-slate-400">Net à verser</span>
          <span className="text-right text-white">{fcfa(t.net)}</span>
          <span className="font-sans text-slate-400">Coût employeur</span>
          <span className="text-right">{fcfa(t.coutEmployeur)}</span>
        </div>
      ),
      confirmer: 'Valider la paie',
    });
    if (ok) await executer(() => validerPaie(user, campagne.id), { titre: 'Paie validée', message: 'Exportez l’ordre de virement pour la banque, puis enregistrez le versement.' });
  };

  const recalculer = async () => {
    if (!campagne) return;
    const ok = await dialog.confirm({
      titre: 'Recalculer la paie ?',
      tone: 'info',
      icon: 'refresh',
      message: 'Les salaires, heures supplémentaires et absences sont mis à jour. Les primes et retenues exceptionnelles saisies sont conservées.',
      confirmer: 'Recalculer',
    });
    if (ok) await executer(() => recalculerPaie(user, campagne.id), { titre: 'Paie recalculée', message: 'Les lignes reflètent les dernières données de pointage, de congés et de carrière.' });
  };

  /* ---------- Exports ---------- */
  const auteur = `${user.prenom} ${user.nom}`;
  const exporter = (nom: string, format: 'CSV' | 'PDF', colonnes: string[], lignes: (string | number)[][], fichier: string, sousTitre: string) => {
    if (format === 'CSV') exporterCSV(`${fichier}.csv`, colonnes, lignes);
    else exporterRapportPDF(nom, sousTitre, colonnes, lignes, `${fichier}.pdf`, auteur);
    void journaliserExport(user, `${nom} — ${moisLong(mois)}`, format, lignes.length).catch(() => undefined);
  };
  const exportVirement = () =>
    campagne &&
    exporter(
      'Ordre de virement des salaires',
      'CSV',
      ['Matricule', 'Bénéficiaire', 'Compte bancaire', 'Montant (FCFA)', 'Libellé'],
      campagne.lignes.map((l) => [l.matricule, l.nom, l.compteBancaire, l.net, `SALAIRE ${moisLong(mois).toUpperCase()}`]),
      `virement_salaires_${mois}`,
      '',
    );
  const colonnesLivre = ['Matricule', 'Salarié', 'Poste', 'Base', 'Primes', 'H. sup', 'Absences', 'Brut', 'CNSS sal.', 'ITS', 'ORTB', 'Retenues', 'Net', 'CNSS pat.', 'VPS', 'Coût'];
  const lignesLivre = () =>
    campagne!.lignes.map((l) => [
      l.matricule,
      l.nom,
      l.poste,
      l.salaireBase,
      l.primesFixes.reduce((s, p) => s + p.montant, 0) + l.elements.filter((x) => x.nature === 'prime').reduce((s, x) => s + x.montant, 0),
      l.heuresSup.montant,
      -l.retenueAbsences,
      l.brut,
      l.cnssSalariale,
      l.its,
      l.redevanceOrtb,
      l.autresRetenues,
      l.net,
      l.cnssPatronale,
      l.vps,
      l.coutEmployeur,
    ]);
  const exportLivre = (format: 'CSV' | 'PDF') =>
    campagne && exporter('Livre de paie', format, colonnesLivre, lignesLivre(), `livre_paie_${mois}`, `${moisLong(mois)} • ${STATUT[campagne.statut].label} • net ${fcfa(t!.net)}`);
  const exportCnss = () =>
    campagne &&
    exporter(
      'Déclaration CNSS',
      'CSV',
      ['N° CNSS', 'Matricule', 'Salarié', 'Salaire brut soumis', `Part salariale ${PAIE.tauxCnssSalarial * 100} %`, `Part patronale ${PAIE.tauxCnssPatronal * 100} %`, 'Total'],
      campagne.lignes.map((l) => [l.cnss, l.matricule, l.nom, l.brutCotisable, l.cnssSalariale, l.cnssPatronale, l.cnssSalariale + l.cnssPatronale]),
      `declaration_cnss_${mois}`,
      '',
    );

  // Écritures comptables SYSCOHADA : refusées si le journal n'est pas équilibré
  const exportEcritures = (format: 'CSV' | 'PDF') => {
    if (!campagne) return;
    const ecritures = ecrituresPaie(campagne);
    const controle = equilibre(ecritures);
    const ecart = controle.find((q) => q.ecart !== 0);
    if (ecart) {
      void dialog.alert({ titre: 'Journal déséquilibré', tone: 'danger', message: `Journal ${ecart.journal} : débit ${fcfa(ecart.debit)} ≠ crédit ${fcfa(ecart.credit)}. Export annulé.` });
      return;
    }
    exporter(
      'Écritures comptables de paie (SYSCOHADA)',
      format,
      ['Date', 'Journal', 'Pièce', 'Compte', 'Intitulé du compte', 'Libellé', 'Débit', 'Crédit'],
      ecritures.map((x) => [dateCourte(x.date), x.journal, x.piece, x.compte, COMPTES[x.compte], x.libelle, x.debit || '', x.credit || '']),
      `ecritures_paie_${mois}`,
      `Plan SYSCOHADA révisé • ${controle.map((q) => `${q.journal} : débit = crédit = ${fcfa(q.debit)}`).join(' • ')}`,
    );
  };

  const optionsMois = moisDispo.map((m) => {
    const c = campagneDuMois(db, m);
    return { value: m, label: `${moisLong(m)}${c ? ` — ${STATUT[c.statut].label.toLowerCase()}` : ''}` };
  });

  return (
    <>
      <PageHeader subtitle="Calcul automatique, validation, versement et distribution des bulletins" title="Paie">
        <SelectChip ariaLabel="Mois de paie" icon="calendar_month" onChange={setMois} options={optionsMois} value={mois} />
        {!campagne && (
          <button className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm" onClick={() => void preparer()} type="button">
            <Icon className="text-[16px]" name="calculate" />
            Préparer la paie
          </button>
        )}
        {campagne?.statut === 'brouillon' && (
          <>
            <button className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2" onClick={() => void recalculer()} type="button">
              <Icon className="text-[16px]" name="refresh" />
              Recalculer
            </button>
            <button className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm" onClick={() => void valider()} type="button">
              <Icon className="text-[16px]" name="fact_check" />
              Valider la paie
            </button>
          </>
        )}
        {campagne?.statut === 'validee' && (
          <>
            <button className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2" onClick={() => setReouverture(true)} type="button">
              <Icon className="text-[16px]" name="lock_open" />
              Rouvrir
            </button>
            <button className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm" onClick={() => setPaiement(true)} type="button">
              <Icon className="text-[16px]" name="payments" />
              Enregistrer le versement
            </button>
          </>
        )}
      </PageHeader>

      {/* Étapes */}
      <div className="bg-[#182234] rounded-xl border border-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {ETAPES.map((etape, i) => {
          const fait = i < etapeCourante;
          const actif = i === etapeCourante;
          return (
            <div key={etape.cle} className={`flex items-center gap-3 p-2.5 rounded-lg ${actif ? 'bg-brand-500/10 border border-brand-500/30' : 'border border-transparent'}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                  fait ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : actif ? 'bg-brand-500/20 border-brand-500/40 text-brand-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
              >
                <Icon className="text-[17px]" name={fait ? 'check' : etape.icone} />
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-semibold ${fait || actif ? 'text-white' : 'text-slate-500'}`}>{etape.label}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {i === 0 && (campagne ? `par ${campagne.creePar}` : 'À lancer')}
                  {i === 1 && (campagne?.dateValidation ? `le ${dateCourte(dateKey(new Date(campagne.dateValidation)))}` : '—')}
                  {i === 2 && (campagne?.datePaiement ? `${campagne.modePaiement}` : '—')}
                  {i === 3 && (campagne?.statut === 'payee' ? `${campagne.lignes.length} bulletins` : '—')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!campagne ? (
        <div className="bg-[#182234] rounded-xl border border-slate-800 p-10 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <Icon className="text-[24px]" name="calculate" />
          </div>
          <h2 className="font-display text-sm font-semibold text-white">Aucune paie pour {moisLong(mois)}</h2>
          <p className="text-xs text-slate-400 max-w-md">
            La préparation calcule la paie de chaque collaborateur sous contrat. Une fois les salaires versés, chacun reçoit automatiquement son bulletin dans son espace.
          </p>
          <button className="mt-2 h-9 px-4 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2" onClick={() => void preparer()} type="button">
            <Icon className="text-[16px]" name="calculate" />
            Préparer la paie de {moisLong(mois)}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard droite={<KpiPastille tone={STATUT[campagne.statut].tone}>{STATUT[campagne.statut].label}</KpiPastille>} icon="groups" suffixe="salariés" titre="Effectif payé" valeur={t!.effectif} />
            <KpiCard droite={<KpiPastille tone="slate">H. sup {sansDecimales(t!.heuresSup)}</KpiPastille>} icon="account_balance_wallet" suffixe="FCFA" titre="Masse salariale brute" valeur={<span className="text-xl">{sansDecimales(t!.brut)}</span>} />
            <KpiCard
              droite={<KpiPastille tone="amber">ITS {sansDecimales(t!.its)}</KpiPastille>}
              icon="payments"
              iconClass="text-emerald-400"
              suffixe="FCFA"
              titre="Net à verser"
              valeur={<span className="text-xl">{sansDecimales(t!.net)}</span>}
            />
            <KpiCard
              droite={<KpiPastille tone="slate">CNSS + VPS {sansDecimales(t!.cnssPatronale + t!.vps)}</KpiPastille>}
              icon="corporate_fare"
              suffixe="FCFA"
              titre="Coût employeur"
              valeur={<span className="text-xl">{sansDecimales(t!.coutEmployeur)}</span>}
            />
          </div>

          <Card
            droite={
              <span className="text-[11px] text-slate-400">
                Calculée le {dateHeure(campagne.dateCalcul)}
                {campagne.statut === 'payee' && campagne.datePaiement ? ` • versée le ${dateCourte(dateKey(new Date(campagne.datePaiement)))}` : ''}
              </span>
            }
            flush
            icon="table_view"
            sousTitre={`Montants en FCFA • ${campagne.statut === 'brouillon' ? 'utilisez ⋮ pour ajouter une prime ou une retenue exceptionnelle' : 'paie verrouillée'}`}
            titre={`Journal de paie — ${moisLong(mois)}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className={THEAD_ROW}>
                    <th className="py-3 px-5">Collaborateur</th>
                    <th className="py-3 px-3 text-right">Base</th>
                    <th className="py-3 px-3 text-right">Primes</th>
                    <th className="py-3 px-3 text-right">H. sup</th>
                    <th className="py-3 px-3 text-right">Absences</th>
                    <th className="py-3 px-3 text-right">Brut</th>
                    <th className="py-3 px-3 text-right">CNSS</th>
                    <th className="py-3 px-3 text-right">ITS</th>
                    <th className="py-3 px-3 text-right">Net</th>
                    <th className="py-3 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {campagne.lignes.map((l) => {
                    const primes = l.primesFixes.reduce((s, p) => s + p.montant, 0) + l.elements.filter((x) => x.nature === 'prime').reduce((s, x) => s + x.montant, 0);
                    const bulletin = db.documents.find((d) => d.modele === 'bulletin_paie' && d.params.campagneId === campagne.id && d.employeId === l.employeId);
                    return (
                      <tr key={l.employeId} className="hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => setDetail(l.employeId)}>
                        <td className="py-3 px-5">
                          <EmployeCell detail={`${l.poste}${l.joursContrat < l.joursCalendaires ? ` • prorata ${l.joursContrat}/${l.joursCalendaires} j` : ''}`} employe={employeDe(l.employeId)} lien={false} />
                        </td>
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap text-xs whitespace-nowrap">{nb(l.salaireBase)}</td>
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap text-xs whitespace-nowrap">
                          {primes ? nb(primes) : '—'}
                          {l.elements.length > 0 && <span className="block text-[10px] text-amber-300">{l.elements.length} élément(s) variable(s)</span>}
                        </td>
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap text-xs whitespace-nowrap">{l.heuresSup.montant ? nb(l.heuresSup.montant) : '—'}</td>
                        <td className={`py-3 px-3 text-right font-mono text-xs whitespace-nowrap ${l.retenueAbsences ? 'text-rose-300' : ''}`}>
                          {l.retenueAbsences ? `− ${nb(l.retenueAbsences)}` : '—'}
                          {l.retenueAbsences > 0 && <span className="block text-[10px] text-slate-500">{l.joursAbsence + l.joursSansSolde} j</span>}
                        </td>
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap text-xs whitespace-nowrap text-white">{nb(l.brut)}</td>
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap text-xs whitespace-nowrap text-slate-400">{nb(l.cnssSalariale)}</td>
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap text-xs whitespace-nowrap text-slate-400">{nb(l.its)}</td>
                        <td className={`py-3 px-3 text-right font-mono text-xs font-semibold ${l.net < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{nb(l.net)}</td>
                        <td className="py-3 px-5 text-right">
                          <ActionMenu
                            ariaLabel={`Actions de paie pour ${l.nom}`}
                            items={[
                              { label: 'Voir le détail', icone: 'receipt_long', onSelect: () => setDetail(l.employeId) },
                              {
                                label: 'Ajouter une prime / retenue',
                                icone: 'add_card',
                                onSelect: () => setElement(l.employeId),
                                disabled: campagne.statut !== 'brouillon',
                                description: campagne.statut !== 'brouillon' ? 'Paie verrouillée' : undefined,
                              },
                              {
                                label: 'Télécharger le bulletin',
                                icone: 'download',
                                onSelect: () => bulletin && telechargerBulletin(bulletin),
                                disabled: !bulletin,
                                description: bulletin ? undefined : 'Disponible après le versement',
                              },
                            ]}
                            titre={l.nom}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-700 bg-slate-900/50 text-xs font-semibold">
                    <td className="py-3 px-5 text-slate-300">Total ({t!.effectif})</td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{nb(campagne.lignes.reduce((s, l) => s + l.salaireBase, 0))}</td>
                    <td></td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{nb(t!.heuresSup)}</td>
                    <td></td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap text-white">{nb(t!.brut)}</td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{nb(t!.cnssSalariale)}</td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">{nb(t!.its)}</td>
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap text-emerald-400">{nb(t!.net)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <Card icon="file_download" sousTitre="Chaque export est tracé dans le journal d'audit" titre="Exports">
              <div className="flex flex-col gap-2.5">
                {[
                  { label: 'Ordre de virement (banque)', aide: 'Bénéficiaires, comptes et nets à verser', icone: 'account_balance', action: exportVirement, dispo: campagne.statut !== 'brouillon', format: 'CSV' },
                  { label: 'Livre de paie', aide: 'Toutes les rubriques par salarié', icone: 'menu_book', action: () => exportLivre('PDF'), dispo: true, format: 'PDF' },
                  { label: 'Livre de paie (tableur)', aide: 'Même contenu, pour Excel', icone: 'table_view', action: () => exportLivre('CSV'), dispo: true, format: 'CSV' },
                  { label: 'Écritures comptables', aide: 'Journal de paie et règlement, plan SYSCOHADA révisé', icone: 'account_balance_wallet', action: () => exportEcritures('CSV'), dispo: campagne.statut !== 'brouillon', format: 'CSV' },
                  { label: 'Écritures comptables (PDF)', aide: 'Même journal, pour archivage et contrôle', icone: 'receipt', action: () => exportEcritures('PDF'), dispo: campagne.statut !== 'brouillon', format: 'PDF' },
                  { label: 'Déclaration CNSS', aide: 'Assiettes et cotisations salariales / patronales', icone: 'health_and_safety', action: exportCnss, dispo: campagne.statut !== 'brouillon', format: 'CSV' },
                ].map((x) => (
                  <button
                    key={x.label}
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-left hover:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={!x.dispo}
                    onClick={x.action}
                    title={x.dispo ? undefined : 'Disponible après validation de la paie'}
                    type="button"
                  >
                    <Icon className="text-[20px] text-brand-400" name={x.icone} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-white">{x.label}</span>
                      <span className="block text-[11px] text-slate-500">{x.dispo ? x.aide : 'Disponible après validation'}</span>
                    </span>
                    <Badge size="xs" tone="slate">
                      {x.format}
                    </Badge>
                  </button>
                ))}
              </div>
            </Card>
            <Card icon="rule" sousTitre="Paramétrées dans src/config/paie.ts — à faire valider par votre cabinet comptable" titre="Règles de calcul appliquées">
              <ul className="flex flex-col gap-2 text-xs text-slate-300">
                <li>• Salaire de base au prorata des jours sous contrat ; changement de salaire en cours de mois pris en compte jour par jour.</li>
                <li>• Prime d'ancienneté : 3 % après 3 ans, 5 % après 5 ans, +1 % par an de la 7e à la 20e année (CCGT art. 65).</li>
                <li>
                  • Heures issues des pointages, taux horaire = salaire mensuel hors frais / {String(PAIE.diviseurHoraire).replace('.', ',')} : +{PAIE.majorations.premieres * 100} % de la 41e à la 48e heure, +
                  {PAIE.majorations.suivantes * 100} % au-delà, +{PAIE.majorations.nuit * 100} % la nuit, +{PAIE.majorations.dimancheFerie * 100} % / +{PAIE.majorations.dimancheFerieNuit * 100} % dimanche et férié (CT art. 147, CCGT art. 66).
                </li>
                <li>• Absences non justifiées et sans solde : salaire et primes fixes non dus pour ces jours (CT art. 209) ; retards suivis mais non retenus.</li>
                <li>• Maladie : salaire maintenu selon l'ancienneté (préavis si moins d'un an, 3 mois plein + 3 mois demi, 6 mois après 5 ans), sans carence (CT art. 38, CCGT art. 23).</li>
                <li>• Congés payés : salaire maintenu, complété si le 1/12 des gains des 12 derniers mois est plus favorable (CT art. 165).</li>
                <li>
                  • Sortie : salaire jusqu'au dernier jour, indemnités de préavis et de congés non pris (CT art. 55 et 163), indemnité de licenciement, de maladie, de retraite ou capital décès (CCGT art. 34, 36, 37, 82) ; ITS
                  des rémunérations exceptionnelles avec atténuation (CGI art. 126), indemnité de licenciement exonérée (art. 120).
                </li>
                <li>
                  • CNSS : {(PAIE.tauxCnssSalarial * 100).toFixed(1)} % salarié, {(PAIE.tauxCnssPatronal * 100).toFixed(1)} % employeur, sur la totalité du brut ; VPS {PAIE.tauxVps * 100} % sur la base de l'ITS (CGI art. 193-194).
                </li>
                <li>
                  • ITS : barème mensuel progressif{' '}
                  {PAIE.baremeIts.map(([plafond, taux], i) => `${i ? ' / ' : ''}${taux * 100} %${Number.isFinite(plafond) ? ` jusqu'à ${sansDecimales(plafond)}` : ' au-delà'}`).join('')}
 sur le brut sans déduction de la CNSS, base arrondie au millier inférieur (CGI art. 122, 125, 514) ; redevance ORTB de {sansDecimales(PAIE.redevanceOrtb.mars)} F en mars et {sansDecimales(PAIE.redevanceOrtb.juin)} F en juin (art. 125-2).
                </li>
              </ul>
            </Card>
          </div>
        </>
      )}

      {campagne && (
        <>
          <LignePaieModal campagne={campagne} ligne={ligneDe(detail)} onClose={() => setDetail(null)} />
          <ElementVariableModal campagne={campagne} ligne={ligneDe(element)} onClose={() => setElement(null)} />
          <PaiementModal
            campagne={paiement ? campagne : null}
            net={t?.net ?? 0}
            onClose={() => setPaiement(false)}
            onConfirmer={async (date, mode) => {
              setPaiement(false);
              const ok = await dialog.confirm({
                titre: 'Confirmer le versement des salaires ?',
                tone: 'warning',
                icon: 'payments',
                message: `${fcfa(t!.net)} versés le ${dateCourte(date)} par ${mode.toLowerCase()} à ${t!.effectif} salarié(s). Cette action est définitive : la paie ne pourra plus être modifiée.`,
                confirmer: 'Confirmer le versement',
              });
              if (!ok) return;
              try {
                const n = await payerSalaires(user, campagne.id, date, mode);
                await dialog.alert({
                  titre: 'Salaires versés',
                  tone: 'success',
                  icon: 'mark_email_read',
                  message: `${n} bulletin(s) de paie certifié(s) ont été déposés automatiquement dans les espaces des collaborateurs, qui ont été notifiés.`,
                });
              } catch (err) {
                await dialog.alert({ titre: 'Versement impossible', tone: 'danger', message: messageErreur(err) });
              }
            }}
          />
          <DecisionModal
            approuver={false}
            onClose={() => setReouverture(false)}
            onConfirm={(motif) => {
              setReouverture(false);
              void executer(() => rouvrirPaie(user, campagne.id, motif), { titre: 'Paie rouverte', message: 'Les lignes sont de nouveau modifiables. Validez-la à nouveau après correction.' });
            }}
            open={reouverture}
            resume={<>Paie de {moisLong(mois)} validée par {campagne.valideePar}. Indiquez la raison de la réouverture (tracée dans le journal d'audit).</>}
            titre="Rouvrir la paie"
          />
        </>
      )}
    </>
  );
}
