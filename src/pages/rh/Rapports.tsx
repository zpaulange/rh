import { useMemo, useState } from 'react';
import Card, { THEAD_ROW } from '../../components/ui/Card';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import SelectChip from '../../components/ui/SelectChip';
import { useDialog } from '../../components/ui/Dialog';
import { journaliserExport } from '../../db/actions';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { exporterCSV } from '../../lib/export';
import { exporterRapportPDF } from '../../lib/pdfLazy';
import { LIBELLE_CONGE, decompteHeuresSup, estEnRetard, retardJustifie, statsMois } from '../../lib/rules';
import { dateCourte, dateKey, derniersMois, dernierDuMois, dureeHM, heureHM, moisComplets, moisDe, moisLong, nombre } from '../../lib/time';

type TypeRapport = 'presence' | 'retards' | 'conges' | 'effectif';

const RAPPORTS: { id: TypeRapport; titre: string; description: string; icon: string }[] = [
  { id: 'presence', titre: 'Présence mensuelle', description: 'Jours travaillés, heures, retards, absences et taux de présence par collaborateur', icon: 'event_available' },
  { id: 'retards', titre: 'Retards détaillés', description: 'Chaque retard détecté automatiquement, justifié ou non', icon: 'schedule' },
  { id: 'conges', titre: 'Congés & absences', description: 'Congés validés sur la période, par type et collaborateur', icon: 'beach_access' },
  { id: 'effectif', titre: 'Effectif & contrats', description: 'Registre du personnel : poste, contrat, ancienneté, accès', icon: 'groups' },
];

interface Rapport {
  colonnes: string[];
  lignes: (string | number)[][];
  synthese: string;
}

export default function Rapports() {
  const { user, db, now, today } = useEspaceRH();
  const dialog = useDialog();
  const [type, setType] = useState<TypeRapport>('presence');
  const moisDispo = useMemo(() => derniersMois(today, 12), [today]);
  const [mois, setMois] = useState(moisDispo[0]);
  const [departement, setDepartement] = useState('tous');
  const departements = useMemo(() => [...new Set(db.employes.map((e) => e.departement))].sort(), [db]);

  const rapport: Rapport = useMemo(() => {
    const employes = db.employes
      .filter((e) => departement === 'tous' || e.departement === departement)
      .sort((a, b) => a.nom.localeCompare(b.nom));
    const ids = new Set(employes.map((e) => e.id));
    const nom = (id: string) => {
      const e = db.employes.find((x) => x.id === id)!;
      return `${e.prenom} ${e.nom}`;
    };

    switch (type) {
      case 'presence': {
        let totalMin = 0;
        let totalRetards = 0;
        const lignes = employes.map((e) => {
          const s = statsMois(db, e.id, mois, today, now);
          // Même décompte que la paie : semaines complètes rattachées au mois de leur dimanche
          const heuresSup = decompteHeuresSup(db, e, (dimanche) => moisDe(dimanche) === mois).total;
          const attendus = s.joursTravailles + s.absences;
          totalMin += s.minutes;
          totalRetards += s.retards + s.retardsJustifies;
          return [
            e.matricule,
            `${e.prenom} ${e.nom}`,
            e.departement,
            s.joursOuvres,
            s.joursTravailles,
            dureeHM(s.minutes),
            dureeHM(heuresSup),
            s.retards,
            s.retardsJustifies,
            s.absences,
            s.joursConge,
            attendus ? `${Math.round((s.joursTravailles / attendus) * 100)} %` : '—',
          ];
        });
        return {
          colonnes: ['Matricule', 'Collaborateur', 'Département', 'J. ouvrés', 'J. travaillés', 'Heures', 'Heures sup.', 'Retards', 'Retards justifiés', 'Absences', 'J. congé', 'Présence'],
          lignes,
          synthese: `${lignes.length} collaborateur(s) • ${dureeHM(totalMin)} travaillées • ${totalRetards} retard(s)`,
        };
      }
      case 'retards': {
        const lignes = db.pointages
          .filter((p) => ids.has(p.employeId) && moisDe(p.date) === mois && estEnRetard(p, db.parametres))
          .sort((a, b) => a.date.localeCompare(b.date) || a.arrivee.localeCompare(b.arrivee))
          .map((p) => {
            const e = db.employes.find((x) => x.id === p.employeId)!;
            return [
              dateCourte(p.date),
              e.matricule,
              nom(p.employeId),
              e.departement,
              heureHM(p.arrivee),
              p.retardMinutes,
              retardJustifie(db, p) ? 'Oui' : 'Non',
              p.terminal,
              p.geo ? (p.geo.dansZone ? 'Sur site' : `Hors zone (${p.geo.distance} m)`) : 'Non localisé',
            ];
          });
        const cumul = lignes.reduce((s, l) => s + Number(l[5]), 0);
        return {
          colonnes: ['Date', 'Matricule', 'Collaborateur', 'Département', 'Arrivée', 'Retard (min)', 'Justifié', 'Terminal', 'Localisation'],
          lignes,
          synthese: `${lignes.length} retard(s) • ${cumul} min cumulées • tolérance ${db.parametres.toleranceRetard} min après ${db.parametres.heureDebut}`,
        };
      }
      case 'conges': {
        const debut = `${mois}-01`;
        const fin = dernierDuMois(mois);
        const lignes = db.conges
          .filter((c) => ids.has(c.employeId) && c.statut === 'approuve' && c.debut <= fin && c.fin >= debut)
          .sort((a, b) => a.debut.localeCompare(b.debut))
          .map((c) => [nom(c.employeId), LIBELLE_CONGE[c.type], dateCourte(c.debut), dateCourte(c.fin), nombre(c.jours), c.traitePar ?? '', c.reference]);
        const total = db.conges
          .filter((c) => ids.has(c.employeId) && c.statut === 'approuve' && c.debut <= fin && c.fin >= debut)
          .reduce((s, c) => s + c.jours, 0);
        return {
          colonnes: ['Collaborateur', 'Type', 'Début', 'Fin', 'Jours', 'Validé par', 'Référence'],
          lignes,
          synthese: `${lignes.length} absence(s) validée(s) • ${nombre(total)} jour(s)`,
        };
      }
      case 'effectif': {
        const lignes = employes.map((e) => {
          const compte = db.comptes.find((c) => c.employeId === e.id);
          const moisAnc = moisComplets(e.dateEmbauche, today);
          return [
            e.matricule,
            `${e.civilite} ${e.prenom} ${e.nom}`,
            e.poste,
            e.departement,
            e.contrat,
            dateCourte(e.dateEmbauche),
            `${Math.floor(moisAnc / 12)} an(s) ${moisAnc % 12} mois`,
            e.heuresHebdo,
            compte ? (compte.actif ? `Actif (${compte.role})` : 'Désactivé') : 'Aucun',
          ];
        });
        return {
          colonnes: ['Matricule', 'Collaborateur', 'Poste', 'Département', 'Contrat', 'Embauche', 'Ancienneté', 'H/sem.', 'Accès'],
          lignes,
          synthese: `${lignes.length} collaborateur(s) • ${employes.filter((e) => e.contrat === 'CDI').length} CDI`,
        };
      }
    }
  }, [db, type, mois, departement, today, now]);

  const meta = RAPPORTS.find((r) => r.id === type)!;
  const periode = type === 'effectif' ? `au ${dateCourte(today)}` : moisLong(mois);
  const portee = departement === 'tous' ? 'Tous départements' : departement;
  const fichier = `rapport_${type}_${type === 'effectif' ? today : mois}`;

  const exporter = (format: 'CSV' | 'PDF') => {
    if (rapport.lignes.length === 0) {
      void dialog.alert({ titre: 'Rien à exporter', tone: 'warning', message: 'Aucune donnée ne correspond à cette période et à ce département. Modifiez les filtres puis réessayez.' });
      return;
    }
    if (format === 'CSV') exporterCSV(`${fichier}.csv`, rapport.colonnes, rapport.lignes);
    else exporterRapportPDF(`${meta.titre} — ${periode}`, `${portee} • ${rapport.synthese}`, rapport.colonnes, rapport.lignes, `${fichier}.pdf`, `${user.prenom} ${user.nom}`);
    journaliserExport(user, `${meta.titre} (${periode}, ${portee})`, format, rapport.lignes.length);
    void dialog.alert({
      titre: 'Rapport exporté',
      tone: 'success',
      icon: format === 'PDF' ? 'picture_as_pdf' : 'table_view',
      message: `« ${meta.titre} — ${periode} » a été téléchargé au format ${format} (${rapport.lignes.length} ligne(s)). L'export est tracé dans le journal d'audit.`,
    });
  };

  const exports = db.audit
    .filter((a) => a.action === 'EXPORT_RAPPORT')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <>
      <PageHeader subtitle="Exportation des rapports administratifs (CSV compatible Excel, PDF)" title="Rapports">
        {type !== 'effectif' && (
          <SelectChip ariaLabel="Mois" icon="calendar_month" onChange={setMois} options={moisDispo.map((m) => ({ value: m, label: moisLong(m) }))} value={mois} />
        )}
        <SelectChip
          ariaLabel="Département"
          icon="apartment"
          onChange={setDepartement}
          options={[{ value: 'tous', label: 'Tous les départements' }, ...departements.map((d) => ({ value: d, label: d }))]}
          value={departement}
        />
        <button className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2" onClick={() => exporter('CSV')} type="button">
          <Icon name="table_view" className="text-[16px]" />
          Export CSV
        </button>
        <button className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm" onClick={() => exporter('PDF')} type="button">
          <Icon name="picture_as_pdf" className="text-[16px]" />
          Export PDF
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {RAPPORTS.map((r) => {
          const actif = r.id === type;
          return (
            <button
              key={r.id}
              className={`text-left p-5 rounded-xl border shadow-sm transition-colors ${
                actif ? 'bg-brand-500/10 border-brand-500/40' : 'bg-[#182234] border-slate-800 hover:border-slate-700'
              }`}
              onClick={() => setType(r.id)}
              type="button"
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${actif ? 'text-brand-300' : 'text-slate-400'}`}>{r.titre}</span>
                <Icon name={r.icon} className={`text-[18px] ${actif ? 'text-brand-400' : 'text-slate-500'}`} filled={actif} />
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{r.description}</p>
            </button>
          );
        })}
      </div>

      <Card flush icon="preview" sousTitre={`${periode} • ${portee} • ${rapport.synthese}`} titre={`Aperçu — ${meta.titre}`}>
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-[#182234]">
              <tr className={THEAD_ROW}>
                {rapport.colonnes.map((c) => (
                  <th key={c} className="py-3 px-4 whitespace-nowrap first:pl-5">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {rapport.lignes.map((l, i) => (
                <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                  {l.map((v, j) => (
                    <td key={j} className="py-2.5 px-4 text-xs whitespace-nowrap first:pl-5">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
              {rapport.lignes.length === 0 && (
                <tr>
                  <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={rapport.colonnes.length}>
                    Aucune donnée pour cette sélection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card icon="history" sousTitre="Chaque export est tracé dans le journal d'audit" titre="Derniers exports">
        <div className="flex flex-col gap-2.5">
          {exports.length === 0 && <p className="text-xs text-slate-500">Aucun export pour l'instant.</p>}
          {exports.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-200 truncate">
                <Icon className="text-[14px] text-slate-500 align-middle mr-1.5" name="file_download" />
                {a.cible} <span className="text-slate-500">• {a.details}</span>
              </span>
              <span className="text-slate-500 shrink-0">
                {a.acteur} • {dateCourte(dateKey(new Date(a.date)))} {heureHM(a.date)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
