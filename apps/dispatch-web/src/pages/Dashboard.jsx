import React from "react";

export default function Dashboard({ notifs }) {
  return (
    <div>
      <h1>Tableau de bord</h1>
      <div className="card">
        <div style={{ fontSize: 12, color: "#8b99b5", textTransform: "uppercase", marginBottom: 8 }}>
          Notifications en direct
        </div>
        {notifs.length === 0 && <div style={{ color: "#8b99b5", fontSize: 14 }}>Aucune activité pour l'instant.</div>}
        {notifs.map((n, i) => (
          <div key={i} style={{ padding: "6px 0", borderTop: i > 0 ? "1px solid #28395a" : "none", fontSize: 14 }}>
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}
