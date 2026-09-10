import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";
import AddressInput from "../components/AddressInput.jsx";

const STATUS_LABEL = {
  REQUESTED: "Demandée",
  BROADCAST: "Diffusée",
  ACCEPTED: "Acceptée",
  EN_ROUTE: "En route vers le client",
  STARTED: "En route vers la destination",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  REFUSED: "Refusée",
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString("fr-CA");
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Field({ label, value }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

export default function Courses() {
  const [rides, setRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const EMPTY_FORM = {
    pickupAddress: "", pickupLat: null, pickupLng: null,
    destAddress: "", destLat: null, destLng: null,
    fare: "", driverId: "", clientId: "", flightNumber: "", clientName: "", clientPhone: "", clientEmail: "",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  const load = async () => {
    const [r, d, c] = await Promise.all([api.listRides(), api.listDrivers(), api.listClients()]);
    setRides(r);
    setDrivers(d);
    setClients(c);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setError("");
    try {
      await api.createRide({
        pickupAddress: form.pickupAddress,
        pickupLat: form.pickupLat ?? undefined,
        pickupLng: form.pickupLng ?? undefined,
        destAddress: form.destAddress,
        destLat: form.destLat ?? undefined,
        destLng: form.destLng ?? undefined,
        fare: Number(form.fare),
        driverId: form.driverId || undefined,
        clientId: form.clientId && form.clientId !== "__new__" ? form.clientId : undefined,
        clientName: form.clientId === "__new__" ? form.clientName : undefined,
        clientPhone: form.clientId === "__new__" ? form.clientPhone : undefined,
        clientEmail: form.clientId === "__new__" ? form.clientEmail || undefined : undefined,
        flightNumber: form.flightNumber || undefined,
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      playSound("action");
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const assign = async (rideId, driverId) => {
    await api.assignDriver(rideId, driverId || null);
    playSound("action");
    load();
  };

  const broadcastToAll = async (rideId) => {
    await api.broadcastRide(rideId);
    playSound("action");
    load();
  };

  const remove = async (ride) => {
    if (!window.confirm("Supprimer cette course ? Cette action est définitive.")) return;
    await api.deleteRide(ride.id);
    playSound("action");
    load();
  };

  return (
    <div>
      <div className="row">
        <h1>Courses</h1>
        <button className="btn" onClick={() => setShowCreate(true)}>Nouvelle course</button>
      </div>

      {rides.map((ride) => {
        const when = ride.scheduledFor || ride.createdAt;
        return (
          <div key={ride.id} className="card">
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="chip">{STATUS_LABEL[ride.status] || ride.status}</span>
              <span style={{ color: "#f5a623", fontWeight: 700 }}>{ride.fare.toFixed(2)} $</span>
            </div>
            <Field label="Date de la course :" value={fmtDate(when)} />
            <Field label="Heure de la course :" value={fmtTime(when)} />
            <Field label="Nom du client :" value={ride.client?.name} />
            <Field label="Adresse de départ :" value={ride.pickupAddress} />
            <Field label="Destination :" value={ride.destAddress} />
            <Field label="Numéro de vol :" value={ride.flightNumber} />
            <Field label="Montant prévu de la course :" value={`${ride.fare.toFixed(2)} $`} />
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <select className="input" style={{ width: 180, marginTop: 0 }} value={ride.driverId || ""} onChange={(e) => assign(ride.id, e.target.value)}>
                <option value="">Non assigné</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                {ride.status === "REQUESTED" && (
                  <button className="btn outline" onClick={() => broadcastToAll(ride.id)}>Diffuser à tous</button>
                )}
                <button className="btn red" onClick={() => remove(ride)}>Supprimer</button>
              </div>
            </div>
          </div>
        );
      })}
      {rides.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course pour l'instant.</div>}

      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Nouvelle course</h3><button onClick={() => setShowCreate(false)}>✕</button></div>
            <AddressInput
              label="Adresse de prise en charge"
              value={form.pickupAddress}
              onChange={({ address, lat, lng }) => setForm({ ...form, pickupAddress: address, pickupLat: lat, pickupLng: lng })}
            />
            <AddressInput
              label="Adresse de destination"
              value={form.destAddress}
              onChange={({ address, lat, lng }) => setForm({ ...form, destAddress: address, destLat: lat, destLng: lng })}
            />
            <label style={{ display: "block", marginTop: 8 }}>Numéro de vol (optionnel)</label>
            <input className="input" value={form.flightNumber} onChange={(e) => setForm({ ...form, flightNumber: e.target.value })} placeholder="ex. AC1234" />
            <label style={{ display: "block", marginTop: 8 }}>Montant prévu ($)</label>
            <input className="input" value={form.fare} onChange={(e) => setForm({ ...form, fare: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Client (optionnel)</label>
            <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Non spécifié</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ Nouveau client…</option>
            </select>
            {form.clientId === "__new__" && (
              <>
                <label style={{ display: "block", marginTop: 8 }}>Nom du nouveau client</label>
                <input className="input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
                <label style={{ display: "block", marginTop: 8 }}>Téléphone du nouveau client</label>
                <input className="input" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} placeholder="+15145551234" />
                <label style={{ display: "block", marginTop: 8 }}>Courriel du nouveau client (optionnel)</label>
                <input className="input" type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Un compte client sera créé automatiquement (ou réutilisé si ce numéro existe déjà).
                </div>
              </>
            )}
            <label style={{ display: "block", marginTop: 8 }}>Affecter à un chauffeur</label>
            <select className="input" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
              <option value="">Non assigné</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={create}>Créer la course</button>
          </div>
        </div>
      )}
    </div>
  );
}
