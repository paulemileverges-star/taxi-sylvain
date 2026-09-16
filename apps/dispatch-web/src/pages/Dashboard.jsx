import React from "react";
import { STATUS_LABEL, statusClass } from "../lib/status.js";

const LEGEND = ["REQUESTED", "EN_ROUTE", "STARTED", "COMPLETED", "CANCELLED"];

export default function Dashboard({ notifs }) {
  return (
    <div>
      <h1>Tableau de bord</h1>
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", marginRight: 4 }}>Code couleur</span>
        {LEGEND.map((s) => (
          <span key={s} className={`chip status-chip ${statusClass(s)}`}>{STATUS_LABEL[s]}</span>
        ))}
      </div>
      <div className="card">
        <div style={{ fontSize: 12, color: "#8b99b5", textTransform: "uppercase", marginBottom: 8 }}>
          Notifications en direct
        </div>
        {notifs.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune activité pour l'instant.</div>}
        {notifs.map((n, i) => (
          <div key={n.id || i} className={`notif ${statusClass(n.status)}`} style={{ borderTop: i > 0 ? "1px solid #28395a" : "none" }}>
            <span className="toast-dot" />
            <span style={{ flex: 1 }}>{n.text}</span>
            <span style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
              {n.at ? new Date(n.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
