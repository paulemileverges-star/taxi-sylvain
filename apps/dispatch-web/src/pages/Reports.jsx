import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { playSound } from "../lib/sound.js";

function mondayOf(d) {
  const date = new Date(d);
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}
function toInput(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function Reports() {
  const lastMonday = new Date(mondayOf(new Date()).getTime() - 7 * 86400000);
  const [from, setFrom] = useState(toInput(lastMonday));
  const [to, setTo] = useState(toInput(new Date()));
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Bornes en fuseau du navigateur : du début du jour "from" à la fin du jour "to".
  const range = () => ({
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59.999`).toISOString(),
  });

  const load = () => api.weeklyReport(range()).then(setReport);
  useEffect(() => { load(); }, [from, to]);

  const generate = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await api.generateWeeklyReport();
      setMessage(`Récap généré pour ${r.count} chauffeur(s) — disponible dans l'app Chauffeur.`);
      playSound("action");
      load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (format) => {
    setBusy(true);
    setMessage("");
    try {
      await api.downloadReport(format, range());
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row">
        <h1>Rapports</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn outline" disabled={busy} onClick={generate}>Générer le récap hebdo maintenant</button>
          <button className="btn outline" disabled={busy} onClick={() => download("pdf")}>Télécharger PDF</button>
          <button className="btn outline" disabled={busy} onClick={() => download("xlsx")}>Télécharger Excel</button>
        </div>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label>Du</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label>Au</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, paddingBottom: 8 }}>
          Courses terminées sur la période. Par défaut : depuis le lundi de la semaine dernière.
        </div>
      </div>
      {message && <div style={{ color: "#8b99b5", fontSize: 13, marginBottom: 10 }}>{message}</div>}

      <h3>Par chauffeur</h3>
      <div className="card">
        {!report && <div style={{ color: "#8b99b5" }}>Chargement…</div>}
        {report?.byDriver.map((row) => (
          <div key={row.driver.id} className="row" style={{ padding: "6px 0" }}>
            <span>{row.driver.name}</span>
            <span className="chip">{row.rideCount} course{row.rideCount > 1 ? "s" : ""}</span>
            <span>{row.totalFare.toFixed(2)} $</span>
            <span style={{ color: "#f5a623" }}>{row.royaltyDue.toFixed(2)} $ dû</span>
          </div>
        ))}
        {report?.byDriver.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course complétée sur cette période.</div>}
      </div>

      <h3>Par client</h3>
      <div className="card">
        {report?.byClient?.map((row, i) => (
          <div key={row.client.id || i} className="row" style={{ padding: "6px 0" }}>
            <span>{row.client.name}</span>
            <span className="chip">{row.rideCount} course{row.rideCount > 1 ? "s" : ""}</span>
            <span>{row.totalFare.toFixed(2)} $</span>
          </div>
        ))}
        {report?.byClient?.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course complétée sur cette période.</div>}
      </div>
    </div>
  );
}
