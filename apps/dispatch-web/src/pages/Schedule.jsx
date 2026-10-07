import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { playSound } from "../lib/sound.js";
import RideEditModal from "../components/RideEditModal.jsx";
import { startOfWeek, addDays, scheduleItemsForDay, jourMois } from "../lib/scheduleOrder.js";
import { heure } from "../lib/heure.js";
import { localInputToIso } from "../lib/status.js";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const STATUS_LABEL = {
  REQUESTED: "Demandée", BROADCAST: "Diffusée", ACCEPTED: "Acceptée",
  EN_ROUTE: "En route", STARTED: "En cours", COMPLETED: "Terminée",
  CANCELLED: "Annulée", REFUSED: "Refusée",
};

export default function Schedule({ user }) {
  // Modifier une course depuis la Cédule exige aussi la permission Courses (règle du serveur).
  const peutModifierCourses = user?.role === "DISPATCH" || Boolean(user?.permissions?.includes("courses"));
  const [erreurChargement, setErreurChargement] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState([]);
  const [rides, setRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ driverId: "", label: "", startsAt: "" });
  const [error, setError] = useState("");
  const [openRideId, setOpenRideId] = useState(null);

  // Audit du 7 octobre 2026 : chargements indépendants (F04 : la liste des chauffeurs exigeait la
  // permission Chauffeurs et bloquait toute la page) ; les courses immédiates, sans heure prévue,
  // apparaissent le jour de leur création (B10 : elles n'apparaissaient jamais).
  const load = async () => {
    const [e, d, r] = await Promise.allSettled([api.listSchedule(), api.listDriverChoices(), api.listRides()]);
    if (e.status === "fulfilled") setEntries(e.value);
    if (d.status === "fulfilled") setDrivers(d.value);
    if (r.status === "fulfilled") setRides(r.value.filter((ride) => !["CANCELLED", "REFUSED"].includes(ride.status)));
    const echec = [e, r].find((x) => x.status === "rejected");
    setErreurChargement(echec ? `Chargement incomplet : ${echec.reason?.message || "erreur inconnue"}` : "");
  };

  useEffect(() => { load(); }, []);

  // La Cédule suit les courses en direct, comme la page Courses (F17).
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    for (const e of ["ride:created", "ride:updated", "ride:deleted"]) socket.on(e, refresh);
    return () => { for (const e of ["ride:created", "ride:updated", "ride:deleted"]) socket.off(e, refresh); };
  }, []);

  const create = async () => {
    setError("");
    try {
      // form.startsAt vient d'un <input type="datetime-local"> : une chaîne SANS fuseau horaire
      // (ex. "2026-09-10T14:00"). Si on l'envoyait telle quelle, le serveur (dont l'horloge n'est
      // pas forcément dans le même fuseau que le navigateur) la réinterpréterait dans SON propre
      // fuseau, décalant l'heure affichée ensuite. En construisant le Date ICI, c'est le fuseau du
      // navigateur (donc celui de la personne qui saisit l'heure) qui fait foi ; on envoie un
      // instant UTC non ambigu (.toISOString()) que le serveur n'a plus besoin d'interpréter.
      // Heure saisie = heure de Montréal, quel que soit le fuseau de l'ordinateur (F03).
      const startsAt = localInputToIso(form.startsAt);
      if (!startsAt) { setError("Indiquez la date et l'heure du créneau."); return; }
      await api.createScheduleEntry({ ...form, startsAt });
      setForm({ driverId: "", label: "", startsAt: "" });
      setShowAdd(false);
      playSound("action");
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteScheduleEntry(id);
      playSound("action");
    } catch (e) {
      window.alert(e.message || "Suppression impossible pour le moment.");
    }
    load();
  };

  // Une seule liste par journée : les courses (besoin #19, cliquables pour ouvrir la fiche) et les
  // créneaux mélangés, classés par heure. Le calcul est mémorisé car la page se re-rend à chaque
  // frappe du formulaire « Nouveau créneau », et la liste des courses peut être longue.
  const jours = useMemo(
    () => Array.from({ length: 7 }, (_, i) => scheduleItemsForDay({ rides, entries, weekStart, dayIndex: i })),
    [rides, entries, weekStart]
  );

  return (
    <div>
      <div className="row">
        <h1>Cédule de la semaine</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn outline" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Semaine précédente</button>
          <button className="btn outline" onClick={() => setWeekStart(addDays(weekStart, 7))}>Semaine suivante →</button>
          <button className="btn" onClick={() => setShowAdd(true)}>Ajouter un créneau</button>
        </div>
      </div>

      {erreurChargement && (
        <div className="card" role="alert" style={{ color: "#e85d4c", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{erreurChargement}</span>
          <button className="btn outline" onClick={load}>Réessayer</button>
        </div>
      )}
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Jours et heures du Québec (heure de Montréal).</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        {DAYS.map((label, i) => {
          const date = addDays(weekStart, i);
          return (
            <div key={label} className="card" style={{ minHeight: 160 }}>
              <div style={{ fontSize: 12, color: "#8b99b5", marginBottom: 8 }}>
                {label} {jourMois(date)}
              </div>
              {jours[i].map((item) => (item.kind === "ride" ? (
                <div
                  key={item.id}
                  role={peutModifierCourses ? "button" : undefined}
                  tabIndex={peutModifierCourses ? 0 : undefined}
                  onClick={() => peutModifierCourses && setOpenRideId(item.ride.id)}
                  onKeyDown={(e) => { if (peutModifierCourses && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenRideId(item.ride.id); } }}
                  style={{ background: "rgba(245,166,35,0.12)", border: "1px solid var(--amber)", borderRadius: 8, padding: "6px 8px", marginBottom: 6, fontSize: 12, cursor: peutModifierCourses ? "pointer" : "default" }}
                >
                  <div className="row">
                    <strong>{item.ride.scheduledFor ? heure(item.ride.scheduledFor) : `${heure(item.ride.createdAt)} · immédiate`}</strong>
                    <span style={{ color: "var(--amber)", fontSize: 11 }}>{STATUS_LABEL[item.ride.status] || item.ride.status}{peutModifierCourses ? " · ✎ modifier" : ""}</span>
                  </div>
                  <div>{item.ride.pickupAddress} → {item.ride.destAddress}{item.ride.stops?.length ? ` (+${item.ride.stops.length} arrêt${item.ride.stops.length > 1 ? "s" : ""})` : ""}</div>
                  <div style={{ color: "#8b99b5" }}>
                    {item.ride.client?.name || "Client non spécifié"}{item.ride.driver?.name ? ` · ${item.ride.driver.name}` : ""}
                  </div>
                </div>
              ) : (
                <div key={item.id} style={{ background: "#1d2c46", borderRadius: 8, padding: "6px 8px", marginBottom: 6, fontSize: 12 }}>
                  <div className="row">
                    <strong>{heure(item.entry.startsAt)}</strong>
                    <button
                      onClick={() => remove(item.entry.id)}
                      title="Supprimer ce créneau"
                      aria-label="Supprimer ce créneau"
                      style={{ background: "rgba(232,93,76,0.12)", border: "1px solid #e85d4c", borderRadius: 6, color: "#e85d4c", cursor: "pointer", width: 20, height: 20, lineHeight: 1, fontSize: 12 }}
                    >
                      ✕
                    </button>
                  </div>
                  <div>{item.entry.driver.name}</div>
                  <div style={{ color: "#8b99b5" }}>{item.entry.label}</div>
                </div>
              )))}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Nouveau créneau</h3><button onClick={() => setShowAdd(false)}>✕</button></div>
            <label>Chauffeur</label>
            <select className="input" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
              <option value="">Choisir…</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <label htmlFor="creneau-heure" style={{ display: "block", marginTop: 8 }}>Date et heure (heure de Montréal)</label>
            <input id="creneau-heure" type="datetime-local" className="input" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Description</label>
            <input className="input" placeholder="ex. Aéroport → Centre-ville" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={create}>Ajouter à la cédule</button>
          </div>
        </div>
      )}
      {openRideId && <RideEditModal rideId={openRideId} onClose={() => setOpenRideId(null)} onSaved={load} />}
    </div>
  );
}
