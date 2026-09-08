import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function Reports() {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = () => api.weeklyReport().then(setReport);
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await api.generateWeeklyReport();
      setMessage(`Récap généré pour ${r.count} chauffeur(s) — disponible dans l'app Chauffeur.`);
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
      await api.downloadReport(format);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row">
        <h1>Rapports — récapitulatif hebdomadaire</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn outline" disabled={busy} onClick={generate}>Générer le récap maintenant</button>
          <button className="btn outline" disabled={busy} onClick={() => download("pdf")}>Télécharger PDF</button>
          <button className="btn outline" disabled={busy} onClick={() => download("xlsx")}>Télécharger Excel</button>
        </div>
      </div>
      {message && <div style={{ color: "#8b99b5", fontSize: 13, marginBottom: 10 }}>{message}</div>}
      <div className="card">
        {!report && <div style={{ color: "#8b99b5" }}>Chargement…</div>}
        {report?.byDriver.map((row) => (
          <div key={row.driver.id} className="row" style={{ padding: "6px 0" }}>
            <span>{row.driver.name}</span>
            <span className="chip">{row.rideCount} courses</span>
            <span>{row.totalFare.toFixed(2)} $</span>
            <span style={{ color: "#f5a623" }}>{row.royaltyDue.toFixed(2)} $ dû</span>
          </div>
        ))}
        {report?.byDriver.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune course complétée sur cette période.</div>}
      </div>
    </div>
  );
}
