import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { playSound } from "../lib/sound.js";
import AddressInput from "../components/AddressInput.jsx";
import { STATUS_LABEL, statusClass, localInputToIso } from "../lib/status.js";

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
    fare: "", driverId: "", clientId: "", flightNumber: "", scheduledFor: "",
    clientName: "", clientPhone: "", clientEmail: "", clientAddress: "", clientNotes: "",
    newDriverName: "", newDriverEmail: "", newDriverPhone: "", newDriverCarModel: "", newDriverPlate: "",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null); // { clientTempPassword?, driverTempPassword? }

  const load = async () => {
    const [r, d, c] = await Promise.all([api.listRides(), api.listDrivers(), api.listClients()]);
    setRides(r);
    setDrivers(d);
    setClients(c);
  };

  useEffect(() => { load(); }, []);

  // Les statuts changent en direct (chauffeur en route, course prise, terminée...) sans
  // rafraîchir la page.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("ride:created", refresh);
    socket.on("ride:updated", refresh);
    socket.on("ride:refused", refresh);
    return () => {
      socket.off("ride:created", refresh);
      socket.off("ride:updated", refresh);
      socket.off("ride:refused", refresh);
    };
  }, []);

  const create = async () => {
    setError("");
    try {
      const ride = await api.createRide({
        pickupAddress: form.pickupAddress,
        pickupLat: form.pickupLat ?? undefined,
        pickupLng: form.pickupLng ?? undefined,
        destAddress: form.destAddress,
        destLat: form.destLat ?? undefined,
        destLng: form.destLng ?? undefined,
        fare: Number(form.fare),
        scheduledFor: localInputToIso(form.scheduledFor) || undefined,
        driverId: form.driverId && !["__new__", "__broadcast__"].includes(form.driverId) ? form.driverId : undefined,
        broadcastAll: form.driverId === "__broadcast__" || undefined,
        newDriver: form.driverId === "__new__" ? {
          name: form.newDriverName, email: form.newDriverEmail, phone: form.newDriverPhone,
          carModel: form.newDriverCarModel || undefined, plate: form.newDriverPlate || undefined,
        } : undefined,
        clientId: form.clientId && form.clientId !== "__new__" ? form.clientId : undefined,
        clientName: form.clientId === "__new__" ? form.clientName : undefined,
        clientPhone: form.clientId === "__new__" ? form.clientPhone : undefined,
        clientEmail: form.clientId === "__new__" ? form.clientEmail || undefined : undefined,
        clientAddress: form.clientId === "__new__" ? form.clientAddress || undefined : undefined,
        clientNotes: form.clientId === "__new__" ? form.clientNotes || undefined : undefined,
        flightNumber: form.flightNumber || undefined,
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      playSound("action");
      load();
      if (ride.clientTempPassword || ride.driverTempPassword) {
        setCredentials({ client: ride.clientTempPassword, driver: ride.driverTempPassword });
      }
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
          <div key={ride.id} className={`card ride-card ${statusClass(ride.status)}`}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={`chip status-chip ${statusClass(ride.status)}`}>{STATUS_LABEL[ride.status] || ride.status}</span>
              <span style={{ color: "#f5a623", fontWeight: 700 }}>{ride.fare > 0 ? `${ride.fare.toFixed(2)} $` : "Montant à confirmer"}</span>
            </div>
            <Field label="Date de la course :" value={fmtDate(when)} />
            <Field label="Heure de la course :" value={fmtTime(when)} />
            <Field label="Nom du client :" value={ride.client?.name} />
            <Field label="Adresse de départ :" value={ride.pickupAddress} />
            <Field label="Destination :" value={ride.destAddress} />
            <Field label="Distance :" value={ride.distanceKm != null ? `${ride.distanceKm.toFixed(1)} km` : null} />
            <Field label="Numéro de vol :" value={ride.flightNumber} />
            <Field label="Montant prévu de la course :" value={ride.fare > 0 ? `${ride.fare.toFixed(2)} $` : "À confirmer"} />
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
            <label style={{ display: "block", marginTop: 8 }}>Heure de prise en charge du client (optionnel)</label>
            <input className="input" type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} />
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
                <label style={{ display: "block", marginTop: 8 }}>Adresse du nouveau client (optionnel)</label>
                <input className="input" value={form.clientAddress} onChange={(e) => setForm({ ...form, clientAddress: e.target.value })} />
                <label style={{ display: "block", marginTop: 8 }}>Préférences ou mémo (optionnel)</label>
                <textarea className="input" style={{ minHeight: 60, fontFamily: "inherit" }} value={form.clientNotes} onChange={(e) => setForm({ ...form, clientNotes: e.target.value })} />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Un compte client sera créé automatiquement (ou réutilisé si ce numéro existe déjà) avec des accès générés automatiquement.
                </div>
              </>
            )}
            <label style={{ display: "block", marginTop: 8 }}>Affecter à un chauffeur</label>
            <select className="input" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
              <option value="">Non assigné</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value="__new__">+ Nouveau chauffeur…</option>
              <option value="__broadcast__">📢 Diffuser à tous les chauffeurs</option>
            </select>
            {form.driverId === "__new__" && (
              <>
                <label style={{ display: "block", marginTop: 8 }}>Nom du nouveau chauffeur</label>
                <input className="input" value={form.newDriverName} onChange={(e) => setForm({ ...form, newDriverName: e.target.value })} />
                <label style={{ display: "block", marginTop: 8 }}>Courriel du nouveau chauffeur</label>
                <input className="input" type="email" value={form.newDriverEmail} onChange={(e) => setForm({ ...form, newDriverEmail: e.target.value })} />
                <label style={{ display: "block", marginTop: 8 }}>Téléphone du nouveau chauffeur</label>
                <input className="input" value={form.newDriverPhone} onChange={(e) => setForm({ ...form, newDriverPhone: e.target.value })} placeholder="+15145551234" />
                <label style={{ display: "block", marginTop: 8 }}>Véhicule (optionnel)</label>
                <input className="input" value={form.newDriverCarModel} onChange={(e) => setForm({ ...form, newDriverCarModel: e.target.value })} placeholder="ex. Toyota Camry 2021" />
                <label style={{ display: "block", marginTop: 8 }}>Plaque (optionnel)</label>
                <input className="input" value={form.newDriverPlate} onChange={(e) => setForm({ ...form, newDriverPlate: e.target.value })} />
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  Un compte chauffeur sera créé automatiquement avec des accès générés automatiquement, et affecté à cette course.
                </div>
              </>
            )}
            {form.driverId === "__broadcast__" && (
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                Dès la création, la course sera notifiée en temps réel à tous les chauffeurs. Le premier à l'accepter l'obtient.
              </div>
            )}
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={create}>Créer la course</button>
          </div>
        </div>
      )}

      {credentials && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Accès générés automatiquement</h3><button onClick={() => setCredentials(null)}>✕</button></div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
              Copiez ces mots de passe temporaires et transmettez-les aux concernés — ils pourront les changer eux-mêmes une fois connectés.
            </div>
            {credentials.client && (
              <div className="field-row"><span className="field-label">Client — mot de passe :</span><span>{credentials.client}</span></div>
            )}
            {credentials.driver && (
              <div className="field-row"><span className="field-label">Chauffeur — mot de passe :</span><span>{credentials.driver}</span></div>
            )}
            <button
              className="btn outline"
              style={{ marginTop: 12, width: "100%" }}
              onClick={() => {
                navigator.clipboard?.writeText(
                  [credentials.client && `Client : ${credentials.client}`, credentials.driver && `Chauffeur : ${credentials.driver}`]
                    .filter(Boolean).join("\n")
                );
              }}
            >
              Copier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
