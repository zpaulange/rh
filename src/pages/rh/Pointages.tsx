import { useMemo, useState } from 'react';
import PointageDetailModal from '../../components/PointageDetailModal';
import EmployeCell from '../../components/rh/EmployeCell';
import GeoBadge from '../../components/rh/GeoBadge';
import StatutJourBadge from '../../components/rh/StatutJourBadge';
import Badge from '../../components/ui/Badge';
import Card, { THEAD_ROW } from '../../components/ui/Card';
import DecisionModal from '../../components/ui/DecisionModal';
import { DatePicker } from '../../components/form';
import Icon from '../../components/ui/Icon';
import KpiCard, { KpiPastille } from '../../components/ui/KpiCard';
import PageHeader from '../../components/ui/PageHeader';
import PhotoLightbox, { PhotoMiniature } from '../../components/ui/PhotoLightbox';
import SelectChip from '../../components/ui/SelectChip';
import TabFilter from '../../components/ui/TabFilter';
import { messageErreur, useDialog } from '../../components/ui/Dialog';
import { deciderRegularisation, journaliserExport } from '../../db/api';
import { LIBELLE_REGULARISATION } from '../../lib/rules';
import { useEspaceRH } from '../../hooks/useEspaceRH';
import { exporterCSV } from '../../lib/export';
import { exporterRapportPDF } from '../../lib/pdfLazy';
import { estEnRetard, minutesTravaillees, pointageDuJour, retardJustifie, statutJour, type StatutJour } from '../../lib/rules';
import { dateCourte, dateHeure, dateLongue, dureeHHMM, dureeHM, heureHM } from '../../lib/time';
import type { Employe, Pointage, Regularisation } from '../../types';

type Filtre = 'tous' | 'retards' | 'hors_zone' | 'sans_photo' | 'absents';

const TYPE_REG = LIBELLE_REGULARISATION;

interface LigneJour {
  e: Employe;
  p: Pointage | undefined;
  statut: StatutJour;
}

export default function Pointages() {
  const { user, db, now, today } = useEspaceRH();
  const dialog = useDialog();
  const [date, setDate] = useState(today);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [ongletReg, setOngletReg] = useState<'attente' | 'traitees'>('attente');
  const [photo, setPhoto] = useState<{ src: string; legende: string } | null>(null);
  const [detail, setDetail] = useState<{ p: Pointage; nom: string } | null>(null);
  const [decision, setDecision] = useState<{ r: Regularisation; approuver: boolean } | null>(null);
  const params = db.parametres;

  const actifs = useMemo(() => {
    const ids = new Set(db.comptes.filter((c) => c.actif).map((c) => c.employeId));
    return db.employes.filter((e) => ids.has(e.id)).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [db]);

  const lignes: LigneJour[] = useMemo(
    () =>
      actifs
        .map((e) => ({ e, p: pointageDuJour(db, e.id, date), statut: statutJour(db, e.id, date, today, now) }))
        .sort((a, b) => (a.p && b.p ? a.p.arrivee.localeCompare(b.p.arrivee) : a.p ? -1 : b.p ? 1 : 0)),
    [actifs, db, date, today, now],
  );

  const pointes = lignes.filter((l) => l.p);
  const retards = pointes.filter((l) => estEnRetard(l.p!, params));
  const horsZone = pointes.filter((l) => l.p!.geo && !l.p!.geo.dansZone);
  const sansPhoto = pointes.filter((l) => (l.p!.source === 'web' || l.p!.source === 'mobile') && !l.p!.photo);
  const absents = lignes.filter((l) => l.statut === 'absent' || l.statut === 'non_pointe');
  const conges = lignes.filter((l) => l.statut === 'conge').length;
  const retardMoyen = retards.length ? Math.round(retards.reduce((s, l) => s + l.p!.retardMinutes, 0) / retards.length) : 0;

  const visibles = {
    tous: lignes,
    retards,
    hors_zone: horsZone,
    sans_photo: sansPhoto,
    absents,
  }[filtre];

  const regularisations = useMemo(() => {
    const toutes = [...db.regularisations].sort((a, b) => b.dateDemande.localeCompare(a.dateDemande));
    return ongletReg === 'attente' ? toutes.filter((r) => r.statut === 'en_attente') : toutes.filter((r) => r.statut !== 'en_attente').slice(0, 15);
  }, [db, ongletReg]);
  const enAttente = db.regularisations.filter((r) => r.statut === 'en_attente').length;

  const employeDe = (id: string) => db.employes.find((e) => e.id === id)!;

  const colonnesExport = ['Matricule', 'Collaborateur', 'Département', 'Arrivée', 'Départ', 'Pause', 'Durée', 'Retard (min)', 'Statut', 'Localisation', 'Distance (m)', 'Photo', 'Terminal', 'Horodatage'];
  const donneesExport = () =>
    visibles.map(({ e, p, statut }) => [
      e.matricule,
      `${e.prenom} ${e.nom}`,
      e.departement,
      p ? heureHM(p.arrivee) : '',
      p?.depart ? heureHM(p.depart) : '',
      p ? dureeHHMM(p.pauseMinutes) : '',
      p ? dureeHM(minutesTravaillees(p, now)) : '',
      p && estEnRetard(p, params) ? `${p.retardMinutes}${retardJustifie(db, p) ? ' (justifié)' : ''}` : '',
      { present: 'Présent', en_pause: 'En pause', parti: 'Parti', conge: 'En congé', ferie: 'Jour férié', absent: 'Absent', non_ouvre: 'Non ouvré', non_pointe: 'Non pointé', hors_contrat: 'Pas encore en poste' }[statut],
      p?.geo ? (p.geo.dansZone ? 'Sur site' : 'Hors zone') : p ? 'Non localisé' : '',
      p?.geo ? p.geo.distance : '',
      p ? (p.photo ? 'Oui' : 'Non') : '',
      p?.terminal ?? '',
      p?.horodatage ?? '',
    ]);

  const exporter = (format: 'CSV' | 'PDF') => {
    const data = donneesExport();
    if (format === 'CSV') exporterCSV(`pointages_${date}.csv`, colonnesExport, data);
    else exporterRapportPDF(`Registre des pointages — ${dateLongue(date)}`, `${data.length} collaborateur(s) • tolérance ${params.toleranceRetard} min • horodatage serveur`, colonnesExport, data, `pointages_${date}.pdf`, `${user.prenom} ${user.nom}`);
    void journaliserExport(user, `Registre des pointages du ${dateCourte(date)}`, format, data.length).catch(() => undefined);
  };

  return (
    <>
      <PageHeader subtitle="Registre horodaté, détection automatique des retards et contrôle de présence" title="Pointages & retards">
        <DatePicker ariaLabel="Date du registre" className="w-40" max={today} onChange={(v) => v && setDate(v)} required value={date} variant="chip" />
        <SelectChip
          ariaLabel="Filtre"
          icon="filter_list"
          onChange={setFiltre}
          options={[
            { value: 'tous', label: 'Tous' },
            { value: 'retards', label: `Retards (${retards.length})` },
            { value: 'hors_zone', label: `Hors zone (${horsZone.length})` },
            { value: 'sans_photo', label: `Sans photo (${sansPhoto.length})` },
            { value: 'absents', label: `Absents / non pointés (${absents.length})` },
          ]}
          prefixe="Afficher:"
          value={filtre}
        />
        <button className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-2" onClick={() => exporter('CSV')} type="button">
          <Icon name="table_view" className="text-[16px]" />
          CSV
        </button>
        <button className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-2 shadow-sm" onClick={() => exporter('PDF')} type="button">
          <Icon name="picture_as_pdf" className="text-[16px]" />
          Exporter PDF
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          droite={<KpiPastille tone="brand">{conges} en congé</KpiPastille>}
          icon="how_to_reg"
          progression={actifs.length - conges ? (pointes.length / (actifs.length - conges)) * 100 : 0}
          suffixe={`/ ${actifs.length - conges} attendus`}
          titre="Présents"
          valeur={pointes.length}
        />
        <KpiCard
          droite={<KpiPastille tone={retards.length ? 'amber' : 'emerald'}>{retards.length ? `Moy. ${retardMoyen} min` : 'Aucun'}</KpiPastille>}
          icon="schedule"
          iconClass="text-amber-400"
          titre="Retards détectés"
          valeur={retards.length}
          valeurClass={retards.length ? 'text-amber-300' : 'text-white'}
        />
        <KpiCard
          droite={<KpiPastille tone={horsZone.length ? 'amber' : 'emerald'}>Rayon {params.site.rayon} m</KpiPastille>}
          icon="wrong_location"
          iconClass="text-amber-400"
          titre="Pointages hors zone"
          valeur={horsZone.length}
        />
        <KpiCard
          droite={<KpiPastille tone={absents.length ? 'rose' : 'emerald'}>{sansPhoto.length} sans photo</KpiPastille>}
          icon="person_off"
          iconClass="text-rose-400"
          titre="Absents / non pointés"
          valeur={absents.length}
        />
      </div>

      <Card
        droite={
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <Icon name="rule" className="text-[15px] text-brand-400" />
            Retard si arrivée &gt; {params.heureDebut} + {params.toleranceRetard} min • photo et GPS {params.photoObligatoire && params.geolocObligatoire ? 'obligatoires' : 'selon paramètres'}
          </span>
        }
        flush
        icon="view_list"
        sousTitre={dateLongue(date)}
        titre="Registre de présence"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Collaborateur</th>
                <th className="py-3 px-4">Arrivée</th>
                <th className="py-3 px-4">Départ</th>
                <th className="py-3 px-4">Pause</th>
                <th className="py-3 px-4">Durée</th>
                <th className="py-3 px-4">Retard</th>
                <th className="py-3 px-4">Localisation</th>
                <th className="py-3 px-4">Photo</th>
                <th className="py-3 px-4">Terminal</th>
                <th className="py-3 px-5 text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {visibles.map(({ e, p, statut }) => (
                <tr
                  key={e.id}
                  className={`hover:bg-slate-800/40 transition-colors ${p ? 'cursor-pointer' : ''}`}
                  onClick={() => p && setDetail({ p, nom: `${e.prenom} ${e.nom}` })}
                >
                  <td className="py-3 px-5">
                    <EmployeCell employe={e} lien={false} />
                  </td>
                  <td className={`py-3 px-4 font-mono text-xs ${p && estEnRetard(p, params) ? 'text-amber-300' : 'text-white'}`}>
                    {p ? (
                      <span className="inline-flex items-center gap-1" title={p.horodatage === 'serveur' ? 'Heure serveur' : 'Heure locale'}>
                        {heureHM(p.arrivee)}
                        <Icon name={p.horodatage === 'serveur' ? 'dns' : 'computer'} className="text-[12px] text-slate-500" />
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-300">{p?.depart ? heureHM(p.depart) : '—'}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-400">{p ? dureeHHMM(p.pauseMinutes) : '—'}</td>
                  <td className="py-3 px-4 font-mono text-xs">{p ? dureeHM(minutesTravaillees(p, now)) : '—'}</td>
                  <td className="py-3 px-4">
                    {p && estEnRetard(p, params) ? (
                      <Badge tone={retardJustifie(db, p) ? 'amber' : 'rose'}>
                        {p.retardMinutes} min{retardJustifie(db, p) ? ' • justifié' : ''}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4" onClick={(ev) => ev.stopPropagation()}>
                    {p ? <GeoBadge geo={p.geo} /> : <span className="text-xs text-slate-500">—</span>}
                  </td>
                  <td className="py-3 px-4" onClick={(ev) => ev.stopPropagation()}>
                    {p ? <PhotoMiniature legende={`${e.prenom} ${e.nom} — ${heureHM(p.arrivee)}`} onOpen={setPhoto} src={p.photo} /> : <span className="text-xs text-slate-500">—</span>}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-300 whitespace-nowrap">{p?.terminal ?? '—'}</td>
                  <td className="py-3 px-5 text-right">
                    <StatutJourBadge statut={statut} />
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={10}>
                    Aucune ligne pour ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        droite={
          <TabFilter
            onChange={setOngletReg}
            options={[
              { value: 'attente', label: `En attente (${enAttente})` },
              { value: 'traitees', label: 'Traitées récemment' },
            ]}
            value={ongletReg}
          />
        }
        flush
        icon="edit_calendar"
        sousTitre="Demandes soumises par les collaborateurs depuis leur espace"
        titre="Demandes de régularisation"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <th className="py-3 px-5">Collaborateur</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Date concernée</th>
                <th className="py-3 px-4">Déclaré</th>
                <th className="py-3 px-4">Pointé</th>
                <th className="py-3 px-4">Motif</th>
                <th className="py-3 px-5 text-right">{ongletReg === 'attente' ? 'Décision' : 'Statut'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {regularisations.map((r) => {
                const e = employeDe(r.employeId);
                const p = pointageDuJour(db, r.employeId, r.date);
                return (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors align-top">
                    <td className="py-3 px-5">
                      <EmployeCell detail={`Réf. ${r.reference} • ${dateHeure(r.dateDemande)}`} employe={e} />
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300 whitespace-nowrap">{TYPE_REG[r.type]}</td>
                    <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">{dateCourte(r.date)}</td>
                    <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                      {r.entree} — {r.depart}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                      {p ? `${heureHM(p.arrivee)} — ${p.depart ? heureHM(p.depart) : '…'}` : 'Aucun'}
                      {p && estEnRetard(p, params) && <span className="block text-[11px] text-amber-300 font-sans">Retard {p.retardMinutes} min</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300 max-w-xs">
                      <p className="line-clamp-2">{r.motif}</p>
                      {r.justificatif && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-brand-400">
                          <Icon name="attach_file" className="text-[13px]" />
                          {r.justificatif}
                        </span>
                      )}
                      {r.commentaireRH && <p className="mt-1 text-[11px] text-slate-500">RH : {r.commentaireRH}</p>}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {r.statut === 'en_attente' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                            onClick={() => setDecision({ r, approuver: true })}
                            type="button"
                          >
                            Valider
                          </button>
                          <button
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                            onClick={() => setDecision({ r, approuver: false })}
                            type="button"
                          >
                            Refuser
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <Badge tone={r.statut === 'approuve' ? 'emerald' : 'rose'}>{r.statut === 'approuve' ? 'Validée' : 'Refusée'}</Badge>
                          <span className="text-[11px] text-slate-500">{r.traitePar}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {regularisations.length === 0 && (
                <tr>
                  <td className="py-8 px-5 text-center text-xs text-slate-500" colSpan={7}>
                    {ongletReg === 'attente' ? 'Aucune demande en attente.' : 'Aucune demande traitée.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <PhotoLightbox onClose={() => setPhoto(null)} photo={photo} />
      <PointageDetailModal nom={detail?.nom} onClose={() => setDetail(null)} pointage={detail?.p ?? null} />
      <DecisionModal
        approuver={decision?.approuver ?? true}
        onClose={() => setDecision(null)}
        onConfirm={async (commentaire) => {
          if (!decision) return;
          try {
            await deciderRegularisation(user, decision.r.id, decision.approuver, commentaire);
            void dialog.alert({
              titre: decision.approuver ? 'Régularisation validée' : 'Régularisation refusée',
              tone: decision.approuver ? 'success' : 'info',
              message: decision.approuver
                ? decision.r.type === 'oubli'
                  ? 'Le pointage du jour a été corrigé avec les horaires déclarés. Le collaborateur a été notifié.'
                  : 'Le retard est désormais marqué comme justifié. Le collaborateur a été notifié.'
                : 'Le collaborateur a été notifié avec le motif du refus.',
            });
          } catch (err) {
            void dialog.alert({ titre: 'Action impossible', tone: 'danger', message: messageErreur(err) });
          }
          setDecision(null);
        }}
        open={decision !== null}
        resume={
          decision && (
            <>
              <strong className="text-white">
                {employeDe(decision.r.employeId).prenom} {employeDe(decision.r.employeId).nom}
              </strong>{' '}
              — {TYPE_REG[decision.r.type]} du {dateCourte(decision.r.date)} ({decision.r.entree} — {decision.r.depart})
              <br />
              <span className="text-slate-400">{decision.r.motif}</span>
              {decision.approuver && decision.r.type === 'oubli' && (
                <span className="block mt-1 text-amber-300">Les horaires déclarés remplaceront le pointage du jour.</span>
              )}
            </>
          )
        }
        titre={decision?.approuver ? 'Valider la régularisation' : 'Refuser la régularisation'}
      />
    </>
  );
}
