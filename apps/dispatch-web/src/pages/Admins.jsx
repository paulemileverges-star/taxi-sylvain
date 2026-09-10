import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";

const PERMISSIONS = [
  { key: "courses", label: "Courses" },
  { key: "schedule", label: "Cédule" },
  { key: "drivers", label: "Chauffeurs" },
  { key: "clients", label: "Clients" },
  { key: "reports", label: "Rapports" },
  { key: "groups", label: "Messagerie / Groupes" },
];

function PermissionEditor({ admin, onSaved }) {
  const [permissions, setPermissions] = useState(admin.permissions);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify([...permissions].sort()) !== JSON.stringify([...admin.permissions].sort());

  const toggle = (key) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAdminPermissions(admin.id, permissions);
      playSound("action");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      {PERMISSIONS.map((p) => (
        <label
          key={p.key}
          style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer",
            padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)",
            background: permissions.includes(p.key) ? "rgba(245,166,35,0.12)" : "transparent",
          }}
        >
          <input type="checkbox" checked={permissions.includes(p.key)} onChange={() => toggle(p.key)} />
          {p.label}
        </label>
      ))}
      {dirty && (
        <button className="btn outline" disabled={saving} onClick={save} style={{ marginLeft: 4 }}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      )}
    </div>
  );
}

const EMPTY_FORM = { name: "", email: "", phone: "", permissions: [] };

export default function Admins() {
  const [admins, setAdmins] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);

  const load = () => api.listAdmins().then(setAdmins);
  useEffect(() => { load(); }, []);

  const remove = async (admin) => {
    if (!window.confirm(`Supprimer le compte admin de ${admin.name} ?`)) return;
    await api.deleteAdmin(admin.id);
    playSound("action");
    load();
  };

  const toggleFormPermission = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }));
  };

  const createAdmin = async () => {
    setError("");
    try {
      const admin = await api.createAdmin(form);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      playSound("action");
      load();
      if (admin.tempPassword) setCredentials(admin.tempPassword);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="row">
        <h1>Administrateurs</h1>
        <button className="btn" onClick={() => setShowAdd(true)}>Nouvel administrateur</button>
      </div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
        Donnez à un collaborateur son propre accès à la console Taxi Sylvain, limité aux fonctionnalités que vous choisissez.
      </div>

      {admins.map((admin) => (
        <div key={admin.id} className="card">
          <div className="row">
            <div>
              <div>{admin.name}</div>
              <div style={{ color: "#8b99b5", fontSize: 13 }}>{admin.email} · {admin.phone}</div>
            </div>
            <button className="btn red" onClick={() => remove(admin)}>Supprimer</button>
          </div>
          <PermissionEditor admin={admin} onSaved={load} />
        </div>
      ))}
      {admins.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucun compte admin pour l'instant.</div>}

      {showAdd && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Nouvel administrateur</h3><button onClick={() => setShowAdd(false)}>✕</button></div>
            <label>Nom complet</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Courriel</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label style={{ display: "block", marginTop: 8 }}>Téléphone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+15145551234" />
            <label style={{ display: "block", marginTop: 10 }}>Fonctionnalités autorisées</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {PERMISSIONS.map((p) => (
                <label
                  key={p.key}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer",
                    padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)",
                    background: form.permissions.includes(p.key) ? "rgba(245,166,35,0.12)" : "transparent",
                  }}
                >
                  <input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => toggleFormPermission(p.key)} />
                  {p.label}
                </label>
              ))}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
              Un mot de passe temporaire sera généré automatiquement — vous pourrez le copier et le transmettre.
            </div>
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={createAdmin}>Créer le compte admin</button>
          </div>
        </div>
      )}

      {credentials && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="row"><h3>Accès générés</h3><button onClick={() => setCredentials(null)}>✕</button></div>
            <div className="field-row"><span className="field-label">Mot de passe temporaire :</span><span>{credentials}</span></div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              Transmettez-le à l'administrateur — il pourra le changer une fois connecté.
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
