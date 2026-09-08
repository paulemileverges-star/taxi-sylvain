import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function Courses() {
  const [rides, setRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ pickupAddress: "", destAddress: "", fare: "", driverId: "" });
  const [error, setError] = useState("");

  const load = async () => {
    const [r, d] = await Promise.all([api.listRides(), api.listDrivers()]);
    setRides(r);
    setDrivers(d);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setError("");
    try {
      await api.createRide({
        pickupAddress: form.pickupAddress,
        destAddress: form.destAddress,
        fare: Number(form.fare),
        driverId: form.driverId || undefined,
      });
      setForm({ pickupAddress: "", destAddress: "", fare: "", driverId: "" });
      setShowCreate(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const assign = async (rideId, driverId) => {
    await api.assignDriver(rideId, driverId || null);
    load();
  };

  const broadcastToAll = async (rideId) => {
    await api.broadcastRide(rideId);
    load();
  };

  return (
    <div>
      <div className="row">
        <h1>Courses</h1>
        <button className="btn" onClick={() => setShowCreate(true)}>Nouvelle course</button>
      </div>

      {rides.map((ride) => (
        <div key={ride.id} className="card">
          <div className="row">
            <span>{ride.pickupAddress} → {ride.destAddress}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#f5a623" }}>{ride.fare} $</span>
              <span className="chip">{ride.status}</span>
              <span className="chip">{ride.driver ? ride.driver.name : "Non assigné"}</span>
              <select className="input" style={{ width: 160, marginTop: 0 }} value={ride.driverId || ""} onChange={(e) => assign(ride.id, e.target.value)}>
                <option value="">Non assigné</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {ride.status === "REQUESTED" && (
                <button className="btn outline" onClick={() => broadcastToAll(ride.id)}>Diffuser à tous</button>
              )}
            </div>
          </div>
        </div>
      ))}

      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Nouvelle course</h3><button onClick={() => setShowCreate(false)}>✕</button></div>
            <label>Adresse de prise en charge</label>
            <input className="input" value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Adresse de destination</label>
            <input className="input" value={form.destAddress} onChange={(e) => setForm({ ...form, destAddress: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Montant prévu ($)</label>
            <input className="input" value={form.fare} onChange={(e) => setForm({ ...form, fare: e.target.value })} />
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
