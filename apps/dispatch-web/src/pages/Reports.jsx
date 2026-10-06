import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";
import { getSocket } from "../lib/socket.js";
import RideEditModal from "../components/RideEditModal.jsx";
import { lundiDe, decaler, periodeSemaines, periodeDates, dateLongue, jourCivil } from "../lib/semaines.js";

// Page Rapports (refaite le 6 octobre 2026 à la demande du propriétaire) :
// - elle s'ouvre sur la semaine en cours, sans rien choisir ; des flèches passent aux semaines
//   précédentes ou suivantes, sur 1, 2 ou 4 semaines ; des dates libres restent possibles ;
// - les courses sont classées par chauffeur, effectuées ET à effectuer, avec le récapitulatif de
//   chacun (montant, redevance) ; un clic sur une course ouvre sa fiche pour la corriger ;
// - les chiffres suivent la même règle que le récap des chauffeurs et les exports : date de la
//   course (heure du Québec), montants et redevance sur les courses effectuées (serveur,
//   lib/rapports.js). Avant, la page comptait les courses par date de fin et sans leur détail.
const argent = (n) => `${Number(n || 0).toFixed(2).replace(".", ",")} $`;
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const COULEUR_STATUT = { COMPLETED: "#3fa796", ACCEPTED: "#f5a623", EN_ROUTE: "#f5a623", STARTED: "#5b8def", REQUESTED: "#8b99b5", BROADCAST: "#8b99b5" };

function TableCourses({ courses, onOuvrir }) {
  if (!courses.length) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Aucune course.</div>;
  const th = { textAlign: "left", padding: "6px 8px", color: "var(--muted)", fontSize: 12, fontWeight: 600 };
  const td = { padding: "6px 8px", fontSize: 13, borderTop: "1px solid var(--border)", verticalAlign: "top" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={th}>Date</th><th style={th}>Heure</th><th style={th}>Client</th><th style={th}>Départ</th><th style={th}>Destination</th><th style={{ ...th, textAlign: "right" }}>Montant</th><th style={th}>Statut</th></tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id} onClick={() => onOuvrir(c.id)} style={{ cursor: "pointer", opacity: c.effectuee ? 1 : 0.85 }} title="Ouvrir la course pour la corriger">
              <td style={td}>{c.date}</td>
              <td style={td}>{c.heure}</td>
              <td style={td}>{c.client || "—"}</td>
              <td style={td}>{c.ville || c.depart}</td>
              <td style={td}>
                {c.destination}
                {c.arrets?.length > 0 && <div style={{ color: "var(--muted)", fontSize: 12 }}>via {c.arrets.join(" → ")}</div>}
              </td>
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{c.montant > 0 ? argent(c.montant) : "à confirmer"}</td>
              <td style={{ ...td, color: COULEUR_STATUT[c.statut] || "inherit", whiteSpace: "nowrap" }}>{c.statutLibelle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totaux({ effectuees, aEffectuer }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span className="chip" style={{ color: "#3fa796" }}>{pluriel(effectuees.nombre, "effectuée")} · {argent(effectuees.montant)}</span>
      <span className="chip" style={{ color: "#f5a623" }}>Redevance à payer : {argent(effectuees.redevance)}</span>
      {aEffectuer.nombre > 0 && <span className="chip">{pluriel(aEffectuer.nombre, "course")} à effectuer · {argent(aEffectuer.montant)}</span>}
    </div>
  );
}

export default function Reports() {
  const [lundi, setLundi] = useState(() => lundiDe(new Date()));
  const [nombreSemaines, setNombreSemaines] = useState(1);
  const [dates, setDates] = useState(null); // { du, au } quand le Dispatch choisit ses propres dates
  const [rapport, setRapport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [openRideId, setOpenRideId] = useState(null);

  const range = useMemo(() => (dates ? periodeDates(dates.du, dates.au) : periodeSemaines(lundi, nombreSemaines)), [lundi, nombreSemaines, dates]);
  const titre = dates
    ? `Du ${dateLongue(range.from)} au ${dateLongue(range.to)}`
    : `Semaine${nombreSemaines > 1 ? "s" : ""} du ${dateLongue(range.from)} au ${dateLongue(range.to)}`;
  const cetteSemaine = lundiDe(new Date()).getTime();
  const position = dates ? "" : lundi.getTime() === cetteSemaine ? "Semaine en cours" : lundi.getTime() < cetteSemaine ? "Semaine passée" : "Semaine à venir";

  const load = () => api.reportPeriod(range).then(setRapport).catch((e) => setMessage(e.message));
  useEffect(() => { setRapport(null); load(); }, [range.from, range.to]);
  // Les statuts changent en direct (course effectuée, affectée...) : le rapport suit.
  useEffect(() => {
    const socket = getSocket();
    const recharger = () => load();
    socket.on("ride:updated", recharger);
    socket.on("ride:created", recharger);
    return () => { socket.off("ride:updated", recharger); socket.off("ride:created", recharger); };
  }, [range.from, range.to]);

  const allerA = (n) => { setDates(null); setLundi((l) => decaler(l, n)); };
  const cetteSemaineCi = () => { setDates(null); setLundi(lundiDe(new Date())); };

  const recalculer = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await api.generateWeeklyReport();
      setMessage(`Récap de la semaine dernière recalculé pour ${pluriel(r.count, "chauffeur")}, sans notification. Le récap part automatiquement chaque lundi à 4 h 00.`);
      playSound("action");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (format) => {
    setBusy(true);
    setMessage("");
    try {
      await api.downloadReport(format, range);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row">
        <h1>Rapports</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn outline" disabled={busy} onClick={() => download("pdf")}>Télécharger PDF</button>
          <button className="btn outline" disabled={busy} onClick={() => download("xlsx")}>Télécharger Excel</button>
          <button className="btn outline" disabled={busy} onClick={recalculer} title="Recalcule le récap de la semaine dernière visible dans l'application des chauffeurs, sans leur renvoyer de notification">Recalculer le récap de la semaine dernière</button>
        </div>
      </div>

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn outline" onClick={() => allerA(-1)}>← Semaine précédente</button>
        <button className={`btn ${!dates && lundi.getTime() === cetteSemaine ? "" : "outline"}`} onClick={cetteSemaineCi}>Cette semaine</button>
        <button className="btn outline" onClick={() => allerA(1)}>Semaine suivante →</button>
        <select className="input" style={{ width: 150, marginTop: 0 }} value={nombreSemaines} onChange={(e) => { setDates(null); setNombreSemaines(Number(e.target.value)); }}>
          <option value={1}>1 semaine</option>
          <option value={2}>2 semaines</option>
          <option value={4}>4 semaines</option>
        </select>
        <span style={{ color: "var(--muted)", fontSize: 13, marginLeft: 8 }}>ou dates libres :</span>
        <input className="input" type="date" style={{ width: 150, marginTop: 0 }} value={dates?.du || jourCivil(range.from)} onChange={(e) => e.target.value && setDates({ du: e.target.value, au: dates?.au || jourCivil(range.to) })} />
        <input className="input" type="date" style={{ width: 150, marginTop: 0 }} value={dates?.au || jourCivil(range.to)} onChange={(e) => e.target.value && setDates({ du: dates?.du || jourCivil(range.from), au: e.target.value })} />
      </div>

      <h3 style={{ marginBottom: 4 }}>{titre}</h3>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
        {position && `${position} · `}Chaque course compte à sa date (heure de prise en charge prévue). Montants et redevance : courses effectuées. Cliquez une course pour la corriger.
      </div>
      {message && <div style={{ color: "#8b99b5", fontSize: 13, marginBottom: 10 }}>{message}</div>}
      {!rapport && <div className="card" style={{ color: "#8b99b5" }}>Chargement…</div>}

      {rapport && (
        <>
          <div className="card">
            <div className="row"><strong>Total de la période</strong><Totaux {...rapport.general} /></div>
            {rapport.annulees > 0 && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{pluriel(rapport.annulees, "course annulée")} sur la période, non comptée{rapport.annulees > 1 ? "s" : ""}.</div>}
          </div>

          <h3>Par chauffeur</h3>
          {rapport.chauffeurs.length === 0 && <div className="card" style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course affectée sur cette période.</div>}
          {rapport.chauffeurs.map((b) => (
            <div key={b.chauffeur.id} className="card">
              <div className="row" style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 16 }}>{b.chauffeur.name}</strong>
                <Totaux effectuees={b.effectuees} aEffectuer={b.aEffectuer} />
              </div>
              <TableCourses courses={b.courses} onOuvrir={setOpenRideId} />
            </div>
          ))}

          {rapport.nonAssignees.courses.length > 0 && (
            <>
              <h3>Courses sans chauffeur</h3>
              <div className="card"><TableCourses courses={rapport.nonAssignees.courses} onOuvrir={setOpenRideId} /></div>
            </>
          )}

          <h3>Par client (courses effectuées)</h3>
          <div className="card">
            {rapport.clients.map((row, i) => (
              <div key={row.client.id || i} className="row" style={{ padding: "6px 0" }}>
                <span>{row.client.name}</span>
                <span className="chip">{pluriel(row.nombre, "course")}</span>
                <span>{argent(row.montant)}</span>
              </div>
            ))}
            {rapport.clients.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course effectuée sur cette période.</div>}
          </div>
        </>
      )}

      {openRideId && <RideEditModal rideId={openRideId} onClose={() => setOpenRideId(null)} onSaved={load} />}
    </div>
  );
}
