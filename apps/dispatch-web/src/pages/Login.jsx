import React, { useState } from "react";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={submit} className="card" style={{ width: 320 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f5a623", marginBottom: 16 }}>Taxi Sylvain — Dispatch</div>
        <label>Courriel</label>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label style={{ display: "block", marginTop: 10 }}>Mot de passe</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div style={{ color: "#e85d4c", fontSize: 13, marginTop: 8 }}>{error}</div>}
        <button className="btn" style={{ marginTop: 16, width: "100%" }}>Se connecter</button>
      </form>
    </div>
  );
}
