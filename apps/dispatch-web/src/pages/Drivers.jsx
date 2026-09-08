import React, { useEffect, useRef, useState } from "react";
import { api, assetUrl } from "../lib/api.js";

const EMPTY_FORM = { name: "", email: "", phone: "", password: "", carModel: "", plate: "" };

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const photoInputs = useRef({});
  const carPhotoInputs = useRef({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  const load = () => api.listDrivers().then(setDrivers);
  useEffect(() => { load(); }, []);

  const uploadPhoto = async (driverId, file) => {
    if (!file) return;
    await api.uploadDriverPhotos(driverId, { photo: file });
    load();
  };

  const uploadCarPhoto = async (driverId, file) => {
    if (!file) return;
    await api.uploadDriverPhotos(driverId, { carPhoto: file });
    load();
  };

  const createDriver = async () => {
    setError("");
    try {
      await api.createDriver(form);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="row">
        <h1>Chauffeurs</h1>
        <button className="btn" onClick={() => setShowAdd(true)}>Nouveau chauffeur</button>
      </div>
      {drivers.map((d) => (
        <div key={d.id} className="card row">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: "#1d2c46", flexShrink: 0 }}>
              {d.photoUrl && <img src={assetUrl(d.photoUrl)} alt={d.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", background: "#1d2c46", flexShrink: 0 }}>
              {d.carPhotoUrl && <img src={assetUrl(d.carPhotoUrl)} alt="véhicule" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <span>{d.name} — {d.carModel} · {d.plate}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="chip">★ {d.ratingAvg?.toFixed(1) ?? "5.0"}</span>
            <button className="btn outline" onClick={() => photoInputs.current[d.id]?.click()}>Photo chauffeur</button>
            <input
              type="file" accept="image/*" style={{ display: "none" }}
              ref={(el) => (photoInputs.current[d.id] = el)}
              onChange={(e) => uploadPhoto(d.id, e.target.files[0])}
            />
            <button className="btn outline" onClick={() => carPhotoInputs.current[d.id]?.click()}>Photo véhicule</button>
            <input
              type="file" accept="image/*" style={{ display: "none" }}
              ref={(el) => (carPhotoInputs.current[d.id] = el)}
              onChange={(e) => uploadCarPhoto(d.id, e.target.files[0])}
            />
          </div>
        </div>
      ))}
      {drivers.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucun chauffeur pour l'instant.</div>}

      {showAdd && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Nouveau chauffeur</h3><button onClick={() => setShowAdd(false)}>✕</button></div>
            <label>Nom complet</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Courriel</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Téléphone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+15145551234" />
            <label style={{ display: "block", marginTop: 8 }}>Mot de passe temporaire</label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Modèle du véhicule</label>
            <input className="input" value={form.carModel} onChange={(e) => setForm({ ...form, carModel: e.target.value })} placeholder="ex. Toyota Camry 2021" />
            <label style={{ display: "block", marginTop: 8 }}>Plaque d'immatriculation</label>
            <input className="input" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} />
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={createDriver}>Créer le compte chauffeur</button>
          </div>
        </div>
      )}
    </div>
  );
}
