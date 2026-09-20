import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";
import { STATUS_LABEL, statusClass, localInputToIso, isoToLocalInput } from "../lib/status.js";
import { filterClients } from "../lib/clientSearch.js";
import AddressInput from "./AddressInput.jsx";

// Fenêtre de modification complète d'une course (demande du propriétaire du 20 septembre 2026 :
// « toutes les modifications possibles doivent pouvoir se faire » depuis Courses et depuis la
// Cédule) : client, chauffeur, statut, adresses, destination du catalogue, heure, vol, montant,
// distance, suppression. Seuls les champs modifiés sont envoyés au serveur (PATCH /rides/:id), qui
// déclenche pour chacun les mêmes effets que l'action équivalente (agenda, notifications, direct).
const STATUTS = ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED", "COMPLETED", "CANCELLED"];

export default function RideEditModal({ rideId, onClose, onSaved, onDeleted }) {
  const [ride, setRide] = useState(null);
  const [form, setForm] = useState(null);
  const [clients, setClients] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [rechercheClient, setRechercheClient] = useState("");
  const [quoteInfo, setQuoteInfo] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getRide(rideId), api.listClients().catch(() => []), api.listDrivers().catch(() => []), api.listDestinations().catch(() => [])])
      .then(([r, c, d, dest]) => {
        setRide(r); setClients(c); setDrivers(d); setDestinations(dest);
        const preset = dest.find((x) => x.address === r.destAddress);
        setForm({
          clientId: r.clientId || "", driverId: r.driverId || "", status: r.status,
          pickupAddress: r.pickupAddress || "", pickupLat: null, pickupLng: null, pickupConfidence: null,
          destinationCode: preset ? preset.code : "",
          destAddress: r.destAddress || "", destLat: null, destLng: null, destConfidence: null,
          fare: r.fare ?? "", flightNumber: r.flightNumber || "", scheduledFor: isoToLocalInput(r.scheduledFor),
          distanceKm: r.distanceKm ?? "",
        });
      })
      .catch((e) => setError(e.message));
  }, [rideId]);

  // Tarif du catalogue affiché quand une destination rapide est choisie (montant modifiable).
  useEffect(() => {
    if (!form || !form.destinationCode || form.pickupAddress.trim().length < 3) { setQuoteInfo(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = await api.priceQuote(form.pickupAddress, form.destinationCode, form.clientId || null);
        if (!cancelled) setQuoteInfo(q);
      } catch {
        if (!cancelled) setQuoteInfo(null);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form?.destinationCode, form?.pickupAddress, form?.clientId]);

  const clientsFiltres = useMemo(() => filterClients(clients, rechercheClient), [clients, rechercheClient]);
  const clientChoisi = clients.find((c) => c.id === form?.clientId);

  const selectDestination = (code) => {
    const preset = destinations.find((d) => d.code === code);
    setForm((f) => ({ ...f, destinationCode: code, destAddress: preset ? preset.address : f.destAddress, destLat: null, destLng: null, destConfidence: null }));
    setQuoteInfo(null);
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const patch = {};
      if ((form.clientId || null) !== (ride.clientId || null)) patch.clientId = form.clientId || null;
      if ((form.driverId || null) !== (ride.driverId || null)) patch.driverId = form.driverId || null;
      if (form.status !== ride.status) patch.status = form.status;
      if (form.pickupAddress !== ride.pickupAddress || typeof form.pickupLat === "number") {
        patch.pickupAddress = form.pickupAddress;
        // Coordonnées envoyées seulement si l'adresse vient d'être choisie dans la liste ;
        // sinon le serveur géocode lui-même la nouvelle adresse.
        if (typeof form.pickupLat === "number") Object.assign(patch, { pickupLat: form.pickupLat, pickupLng: form.pickupLng, pickupConfidence: form.pickupConfidence });
      }
      if (form.destinationCode) {
        const preset = destinations.find((d) => d.code === form.destinationCode);
        if (!preset || preset.address !== ride.destAddress) patch.destinationCode = form.destinationCode;
      } else if (form.destAddress !== ride.destAddress || typeof form.destLat === "number") {
        patch.destAddress = form.destAddress;
        if (typeof form.destLat === "number") Object.assign(patch, { destLat: form.destLat, destLng: form.destLng, destConfidence: form.destConfidence });
      }
      if (String(form.fare) !== String(ride.fare ?? "")) patch.fare = form.fare === "" ? 0 : Number(form.fare);
      if ((form.flightNumber || "") !== (ride.flightNumber || "")) patch.flightNumber = form.flightNumber || null;
      if (form.scheduledFor !== isoToLocalInput(ride.scheduledFor)) patch.scheduledFor = localInputToIso(form.scheduledFor);
      if (String(form.distanceKm) !== String(ride.distanceKm ?? "")) patch.distanceKm = form.distanceKm === "" ? null : Number(form.distanceKm);
      if (Object.keys(patch).length === 0) { onClose(); return; }
      await api.updateRide(rideId, patch);
      playSound("action");
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Supprimer cette course ? Cette action est définitive.")) return;
    try {
      await api.deleteRide(rideId);
      playSound("action");
      onDeleted?.();
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  const label = (texte) => <label style={{ display: "block", marginTop: 8 }}>{texte}</label>;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 520 }}>
        <div className="row"><h3>Modifier la course</h3><button onClick={onClose}>✕</button></div>
        {!form ? (
          <div style={{ color: "#8b99b5" }}>{error || "Chargement…"}</div>
        ) : (
          <>
            <div className="field-row">
              <span className="field-label">Statut actuel :</span>
              <span className={`chip status-chip ${statusClass(ride?.status)}`}>{STATUS_LABEL[ride?.status] || ride?.status}</span>
            </div>
            {ride?.ratings?.length > 0 && (
              <div style={{ marginTop: 4, marginBottom: 6 }}>
                {ride.ratings.map((r) => (
                  <div key={r.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "#f5a623" }}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
                    {" "}<span style={{ color: "var(--muted)" }}>{r.fromUserId === ride.clientId ? "du client sur le chauffeur" : "du chauffeur sur le client"}</span>
                    {r.comment && <div>« {r.comment} »</div>}
                  </div>
                ))}
              </div>
            )}

            {label("Client")}
            <input className="input" placeholder="Rechercher : nom, téléphone, courriel, adresse…" value={rechercheClient} onChange={(e) => setRechercheClient(e.target.value)} autoComplete="off" />
            <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} size={rechercheClient.trim() ? Math.min(6, clientsFiltres.length + 1) : undefined}>
              <option value="">Aucun client (réservation par téléphone)</option>
              {clientsFiltres.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              {clientChoisi && !clientsFiltres.some((c) => c.id === clientChoisi.id) && <option value={clientChoisi.id}>{clientChoisi.name}</option>}
            </select>

            {label("Chauffeur")}
            <select className="input" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
              <option value="">Non assigné</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.carModel ? ` · ${d.carModel}` : ""}</option>)}
            </select>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Changer de chauffeur retire la course de l'agenda de l'ancien et prévient le nouveau, comme une affectation.</div>

            {label("Statut")}
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUTS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
              {!STATUTS.includes(form.status) && <option value={form.status}>{STATUS_LABEL[form.status] || form.status}</option>}
            </select>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              « Diffusée » propose la course à tous les chauffeurs ; « Annulée » prévient client et chauffeur ; « Effectuée » compte dans le récap de la semaine.
            </div>

            <AddressInput
              label="Adresse de prise en charge"
              value={form.pickupAddress}
              onChange={({ address, lat, lng, confidence }) => setForm({ ...form, pickupAddress: address, pickupLat: lat, pickupLng: lng, pickupConfidence: confidence || null })}
            />
            {label("Destination")}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {[...destinations.map((d) => ({ code: d.code, label: d.code })), { code: "", label: "Autre adresse" }].map((opt) => (
                <button key={opt.code || "other"} type="button" className={`btn ${form.destinationCode === opt.code ? "" : "outline"}`} onClick={() => selectDestination(opt.code)}>
                  {opt.label}
                </button>
              ))}
            </div>
            {form.destinationCode ? (
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
                {destinations.find((d) => d.code === form.destinationCode)?.label} — {form.destAddress}
                {quoteInfo?.price != null && <div style={{ color: "#3fa796", fontSize: 12 }}>Tarif {quoteInfo.source === "client" ? "négocié" : "catalogue"} : {quoteInfo.price.toFixed(2)} $ (appliqué si le montant n'est pas saisi)</div>}
              </div>
            ) : (
              <AddressInput
                label="Adresse de destination"
                value={form.destAddress}
                onChange={({ address, lat, lng, confidence }) => setForm({ ...form, destAddress: address, destLat: lat, destLng: lng, destConfidence: confidence || null })}
              />
            )}

            {label("Heure de prise en charge du client")}
            <input className="input" type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} />
            {label("Numéro de vol")}
            <input className="input" value={form.flightNumber} onChange={(e) => setForm({ ...form, flightNumber: e.target.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                {label("Montant prévu ($)")}
                <input className="input" value={form.fare} onChange={(e) => setForm({ ...form, fare: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                {label("Distance (km)")}
                <input className="input" value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: e.target.value })} placeholder="recalculée si vide" />
              </div>
            </div>

            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} disabled={saving} onClick={save}>
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
            <button className="btn red" style={{ marginTop: 8, width: "100%" }} disabled={saving} onClick={remove}>
              Supprimer la course
            </button>
          </>
        )}
      </div>
    </div>
  );
}
