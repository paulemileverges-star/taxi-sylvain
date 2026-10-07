import React, { useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Audit du 7 octobre 2026 (SEC-07) : changer le mot de passe ferme toutes les autres sessions. Le
  // serveur renvoie un jeton neuf pour cette console ; elle redémarre pour s'en servir partout.
  const submit = async () => {
    if (busy) return;
    setError("");
    if (newPassword !== confirm) {
      setError("Les deux nouveaux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.changePassword(currentPassword, newPassword);
      if (r?.token) api.setToken(r.token);
      playSound("action");
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const fermer = () => (done ? window.location.reload() : onClose());

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="row"><h3>Changer le mot de passe</h3><button onClick={fermer} aria-label="Fermer">✕</button></div>
        {done ? (
          <>
            <div style={{ color: "#3fa796", marginTop: 8 }}>Mot de passe mis à jour. Les sessions ouvertes sur d'autres appareils ont été fermées.</div>
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={fermer}>Fermer</button>
          </>
        ) : (
          <>
            <label>Mot de passe actuel</label>
            <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <label style={{ display: "block", marginTop: 8 }}>Nouveau mot de passe</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <label style={{ display: "block", marginTop: 8 }}>Confirmer le nouveau mot de passe</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={submit} disabled={busy}>{busy ? "Mise à jour…" : "Mettre à jour"}</button>
          </>
        )}
      </div>
    </div>
  );
}
