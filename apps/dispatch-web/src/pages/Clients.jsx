import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";

function ClientCard({ client, onDelete }) {
  const [notes, setNotes] = useState(client.notes || "");
  const [address, setAddress] = useState(client.address || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = notes !== (client.notes || "") || address !== (client.address || "");

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api.updateClientNotes(client.id, notes.trim() || null),
        api.updateClientAddress(client.id, address.trim() || null),
      ]);
      playSound("action");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="row">
        <div>
          <div>{client.name}</div>
          <div style={{ color: "#8b99b5", fontSize: 13 }}>{client.email || "(pas de courriel)"} · {client.phone}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="chip">★ {client.ratingAvg?.toFixed(1) ?? "5.0"}</span>
          <button className="btn red" onClick={() => onDelete(client)}>Supprimer</button>
        </div>
      </div>
      <label style={{ display: "block", marginTop: 12, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Adresse
      </label>
      <input
        className="input"
        style={{ marginTop: 6 }}
        placeholder="ex. 123 rue Principale, Montréal, QC"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <label style={{ display: "block", marginTop: 10, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Mémo et préférences (visible uniquement par le Dispatch)
      </label>
      <textarea
        className="input"
        style={{ marginTop: 6, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
        placeholder="ex. Préfère un véhicule spacieux, toujours 2 valises, allergique aux parfums, client fidèle du jeudi soir…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <span style={{ fontSize: 12, color: saved ? "#3fa796" : "var(--muted)" }}>
          {saved ? "Enregistré." : dirty ? "Modifications non enregistrées." : ""}
        </span>
        <button className="btn outline" disabled={!dirty || saving} onClick={save}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

const EMPTY_FORM = { name: "", email: "", phone: "", address: "", notes: "" };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const fileInputRef = React.useRef(null);

  const load = () => api.listClients().then(setClients);
  useEffect(() => { load(); }, []);

  const remove = async (client) => {
    if (!window.confirm(`Supprimer le compte de ${client.name} ? Cette action est définitive.`)) return;
    await api.deleteClient(client.id);
    playSound("action");
    load();
  };

  const createClient = async () => {
    setError("");
    try {
      const client = await api.createClient(form);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      playSound("action");
      load();
      if (client.tempPassword) setCredentials(client.tempPassword);
    } catch (e) {
      setError(e.message);
    }
  };

  const exportAs = async (format) => {
    setExporting(true);
    try {
      await api.exportClients(format);
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
      const result = await api.importClients(file);
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
        <h1>Clients</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn outline" disabled={exporting} onClick={() => exportAs("pdf")}>Exporter PDF</button>
          <button className="btn outline" disabled={exporting} onClick={() => exportAs("xlsx")}>Exporter Excel</button>
          <button className="btn outline" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? "Import en cours…" : "Importer (.xlsx / .csv)"}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => importFile(e.target.files[0])} />
          <button className="btn" onClick={() => setShowAdd(true)}>Nouveau client</button>
        </div>
      </div>

      {clients.map((c) => (
        <ClientCard key={c.id} client={c} onDelete={remove} />
      ))}
      {clients.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucun client pour l'instant.</div>}

      {showAdd && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Nouveau client</h3><button onClick={() => setShowAdd(false)}>✕</button></div>
            <label>Nom complet</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Courriel (optionnel)</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Téléphone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+15145551234" />
            <label style={{ display: "block", marginTop: 8 }}>Adresse (optionnel)</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="ex. 123 rue Principale, Montréal, QC" />
            <label style={{ display: "block", marginTop: 8 }}>Préférences ou mémo (optionnel)</label>
            <textarea className="input" style={{ minHeight: 60, fontFamily: "inherit" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={createClient}>Créer le client</button>
          </div>
        </div>
      )}

      {importResult && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Résultat de l'import</h3><button onClick={() => setImportResult(null)}>✕</button></div>
            <div className="field-row"><span className="field-label">Clients créés :</span><span>{importResult.createdCount}</span></div>
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
              Transmettez-le au client — il pourra le changer une fois connecté.
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
