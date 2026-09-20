import React, { useEffect, useRef, useState } from "react";
import { api, assetUrl } from "../lib/api.js";
import { playSound } from "../lib/sound.js";
import { getSocket } from "../lib/socket.js";
import { prepareImageForUpload } from "../lib/image.js";

// Photo dont le fichier n'existe plus sur le serveur (ex. envoyée avant la mise en place du
// disque persistant) : on l'indique clairement au lieu d'une image cassée.
function Photo({ src, alt, round }) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      title={broken ? "Fichier introuvable — re-téléversez la photo" : alt}
      style={{ width: 44, height: 44, borderRadius: round ? "50%" : 8, overflow: "hidden", background: broken ? "rgba(232,93,76,0.18)" : "#1d2c46", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#e85d4c", fontSize: 11 }}
    >
      {src && !broken ? <img src={src} alt={alt} onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : broken ? "!" : null}
    </div>
  );
}

const EMPTY_FORM = { name: "", email: "", phone: "", password: "", carModel: "", plate: "" };

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const photoInputs = useRef({});
  const carPhotoInputs = useRef({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const fileInputRef = useRef(null);

  const load = () => api.listDrivers().then(setDrivers);
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const socket = getSocket();
    const setOnline = (driverId, online) =>
      setDrivers((prev) => prev.map((d) => (d.id === driverId ? { ...d, online } : d)));
    const onOnline = ({ driverId }) => setOnline(driverId, true);
    const onOffline = ({ driverId }) => setOnline(driverId, false);
    socket.on("driver:online", onOnline);
    socket.on("driver:offline", onOffline);
    return () => {
      socket.off("driver:online", onOnline);
      socket.off("driver:offline", onOffline);
    };
  }, []);

  const uploadPhoto = async (driverId, file) => {
    if (!file) return;
    try {
      await api.uploadDriverPhotos(driverId, { photo: await prepareImageForUpload(file) });
      playSound("action");
      load();
    } catch (e) {
      alert(`Photo non enregistrée : ${e.message}`);
    }
  };

  const uploadCarPhoto = async (driverId, file) => {
    if (!file) return;
    try {
      await api.uploadDriverPhotos(driverId, { carPhoto: await prepareImageForUpload(file) });
      playSound("action");
      load();
    } catch (e) {
      alert(`Photo du véhicule non enregistrée : ${e.message}`);
    }
  };

  const remove = async (driver) => {
    if (!window.confirm(`Supprimer le compte de ${driver.name} ? Cette action est définitive.`)) return;
    await api.deleteDriver(driver.id);
    playSound("action");
    load();
  };

  // Porte de secours : le chauffeur n’a pas reçu son code de confirmation (courriel mal saisi,
  // indésirables...). Le Dispatch confirme à sa place, après l’avoir eu au téléphone.
  const confirmerCourriel = async (driver) => {
    if (!window.confirm(`Confirmer le courriel de ${driver.name} à sa place ? Il pourra se connecter sans code.`)) return;
    try {
      await api.confirmEmail(driver.id);
      playSound("action");
      load();
    } catch (e) {
      alert(`Confirmation impossible : ${e.message}`);
    }
  };

  const createDriver = async () => {
    setError("");
    try {
      const driver = await api.createDriver(form);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      playSound("action");
      load();
      if (driver.tempPassword) setCredentials(driver.tempPassword);
    } catch (e) {
      setError(e.message);
    }
  };

  const exportAs = async (format) => {
    setExporting(true);
    try {
      await api.exportDrivers(format);
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting(false);
    }
  };

  const importFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await api.importDrivers(file);
      playSound("action");
      setImportResult(result);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="row">
        <h1>Chauffeurs</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn outline" disabled={exporting} onClick={() => exportAs("pdf")}>Exporter PDF</button>
          <button className="btn outline" disabled={exporting} onClick={() => exportAs("xlsx")}>Exporter Excel</button>
          <button className="btn outline" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? "Import en cours…" : "Importer (.xlsx / .csv)"}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => importFile(e.target.files[0])} />
          <button className="btn" onClick={() => setShowAdd(true)}>Nouveau chauffeur</button>
        </div>
      </div>
      {drivers.map((d) => (
        <div key={d.id} className="card row">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Photo src={d.photoUrl ? assetUrl(d.photoUrl) : null} alt={d.name} round />
            <Photo src={d.carPhotoUrl ? assetUrl(d.carPhotoUrl) : null} alt="véhicule" />
            <span
              title={d.online ? "En ligne" : "Hors ligne"}
              style={{
                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                background: d.online ? "#3fa796" : "#e85d4c",
              }}
            />
            <span>{d.name} — {d.carModel} · {d.plate}</span>
            {d.emailVerifiedAt === null && (
              <button className="btn outline" title={"Ce compte n’a pas encore saisi le code reçu par courriel. Confirmer à sa place le laisse se connecter sans code."} onClick={() => confirmerCourriel(d)}>Courriel non confirmé · Confirmer</button>
            )}
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
            <button className="btn red" onClick={() => remove(d)}>Supprimer</button>
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
            <label style={{ display: "block", marginTop: 8 }}>Mot de passe temporaire (optionnel — généré automatiquement si vide)</label>
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

      {importResult && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Résultat de l'import</h3><button onClick={() => setImportResult(null)}>✕</button></div>
            <div className="field-row"><span className="field-label">Chauffeurs créés :</span><span>{importResult.createdCount}</span></div>
            <div className="field-row"><span className="field-label">Lignes ignorées :</span><span>{importResult.skippedCount}</span></div>
            {importResult.skipped?.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 200, overflowY: "auto", fontSize: 12, color: "var(--muted)" }}>
                {importResult.skipped.map((s, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>{s.row?.nom || s.row?.name || "(ligne sans nom)"} — {s.reason}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {credentials && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Accès générés</h3><button onClick={() => setCredentials(null)}>✕</button></div>
            <div className="field-row"><span className="field-label">Mot de passe temporaire :</span><span>{credentials}</span></div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              Transmettez-le au chauffeur — il pourra le changer une fois connecté.
            </div>
            <button className="btn outline" style={{ marginTop: 12, width: "100%" }} onClick={() => navigator.clipboard?.writeText(credentials)}>
              Copier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
