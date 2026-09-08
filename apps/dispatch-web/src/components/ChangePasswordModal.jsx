import React, { useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (newPassword !== confirm) {
      setError("Les deux nouveaux mots de passe ne correspondent pas.");
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      playSound("action");
      setDone(true);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="row"><h3>Changer le mot de passe</h3><button onClick={onClose}>✕</button></div>
        {done ? (
          <>
            <div style={{ color: "#3fa796", marginTop: 8 }}>Mot de passe mis à jour.</div>
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={onClose}>Fermer</button>
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
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={submit}>Mettre à jour</button>
          </>
        )}
      </div>
    </div>
  );
}
