import React, { useEffect, useState } from "react";
import "./App.css";
import { api } from "./lib/api.js";
import { getSocket } from "./lib/socket.js";
import { playSound } from "./lib/sound.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Courses from "./pages/Courses.jsx";
import Schedule from "./pages/Schedule.jsx";
import Drivers from "./pages/Drivers.jsx";
import Reports from "./pages/Reports.jsx";
import Messages from "./pages/Messages.jsx";

const NAV = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "courses", label: "Courses" },
  { key: "schedule", label: "Cédule" },
  { key: "drivers", label: "Chauffeurs" },
  { key: "reports", label: "Rapports" },
  { key: "messages", label: "Messagerie" },
];

export default function App() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("ts_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [screen, setScreen] = useState("dashboard");
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    socket.on("ride:notification", (n) => { setNotifs((prev) => [n.text, ...prev]); playSound("notify"); });
    socket.on("ride:created", () => { setNotifs((prev) => ["Nouvelle course créée.", ...prev]); playSound("notify"); });
    socket.on("ride:refused", () => playSound("notify"));
    socket.on("report:generated", () => playSound("notify"));
    socket.on("message:direct", (m) => { if (m.sender.role !== "DISPATCH") playSound("notify"); });
    return () => {
      socket.off("ride:notification");
      socket.off("ride:created");
      socket.off("ride:refused");
      socket.off("report:generated");
      socket.off("message:direct");
    };
  }, [user]);

  if (!user) {
    return (
      <Login
        onLogin={async (email, password) => {
          const data = await api.login(email, password);
          api.setToken(data.token);
          localStorage.setItem("ts_user", JSON.stringify(data.user));
          setUser(data.user);
        }}
      />
    );
  }

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="brand">TAXI SYLVAIN</div>
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`nav-item ${screen === n.key ? "active" : ""}`}
            onClick={() => setScreen(n.key)}
          >
            {n.label}
          </button>
        ))}
      </div>
      <div className="content">
        {screen === "dashboard" && <Dashboard notifs={notifs} />}
        {screen === "courses" && <Courses />}
        {screen === "schedule" && <Schedule />}
        {screen === "drivers" && <Drivers />}
        {screen === "reports" && <Reports />}
        {screen === "messages" && <Messages />}
      </div>
    </div>
  );
}
