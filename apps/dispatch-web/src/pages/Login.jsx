import React, { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import { requestWebNotificationPermission } from "../lib/webNotify.js";

const DELAI_RENVOI_S = 60;

// Connexion à la console. Un collaborateur (compte Admin) créé par Taxi Sylvain confirme son
// courriel par un code à six chiffres à sa première connexion, comme les chauffeurs et les clients
// (demande du propriétaire du 20 septembre 2026). Le compte Dispatch lui-même n'est jamais bloqué.
export default function Login({ onLogin, onVerify, onResend }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [code, setCode] = useState("");
  const [codeAttendu, setCodeAttendu] = useState(false);
  const [attente, setAttente] = useState(0);

  useEffect(() => {
    if (attente <= 0) return undefined;
    const t = setTimeout(() => setAttente((a) => a - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    // La permission de notification se demande dans le geste du bouton, sinon le navigateur l'ignore.
    requestWebNotificationPermission();
    try {
      await onLogin(email, password);
    } catch (err) {
      if (err.data?.verificationRequired) {
        setCodeAttendu(true);
        setInfo(err.message);
        setAttente(DELAI_RENVOI_S);
        return;
      }
      setError(err.message);
    }
  };

  const confirmer = async (e) => {
    e.preventDefault();
    setError("");
    const propre = code.replace(/\D/g, "");
    if (propre.length !== 6) return setError("Entrez les six chiffres du code reçu par courriel.");
    try {
      await onVerify(email, password, propre);
    } catch (err) {
      setError(err.message);
    }
  };

  const renvoyer = async () => {
    if (attente > 0) return;
    setError("");
    try {
      const r = await onResend(email, password);
      setInfo(r.message || "Un nouveau code vient d'être envoyé.");
      setAttente(DELAI_RENVOI_S);
      if (r.dejaConfirme) setCodeAttendu(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={codeAttendu ? confirmer : submit} className="card" style={{ width: 340 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <img src={logo} alt="" style={{ width: 44, height: 44, borderRadius: "50%" }} />
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f5a623" }}>Taxi Sylvain — Dispatch</div>
        </div>
        {codeAttendu ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Confirmez votre courriel</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>{info}</div>
            <label>Code à six chiffres</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              autoFocus
              style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
            />
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 16, width: "100%" }}>Confirmer</button>
            <button type="button" className="btn outline" style={{ marginTop: 8, width: "100%" }} disabled={attente > 0} onClick={renvoyer}>
              {attente > 0 ? `Renvoyer le code (${attente} s)` : "Renvoyer le code"}
            </button>
            <button type="button" className="btn outline" style={{ marginTop: 8, width: "100%" }} onClick={() => { setCodeAttendu(false); setCode(""); setError(""); }}>
              Retour
            </button>
          </>
        ) : (
          <>
            <label>Courriel</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <label style={{ display: "block", marginTop: 10 }}>Mot de passe</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button className="btn" style={{ marginTop: 16, width: "100%" }}>Se connecter</button>
          </>
        )}
      </form>
    </div>
  );
}
