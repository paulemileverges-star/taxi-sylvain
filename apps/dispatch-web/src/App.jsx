import React, { useEffect, useState } from "react";
import "./App.css";
import { api } from "./lib/api.js";
import { getSocket, resetSocket } from "./lib/socket.js";
import { playSound } from "./lib/sound.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Courses from "./pages/Courses.jsx";
import Schedule from "./pages/Schedule.jsx";
import Drivers from "./pages/Drivers.jsx";
import Clients from "./pages/Clients.jsx";
import Reports from "./pages/Reports.jsx";
import Messages from "./pages/Messages.jsx";
import Groups from "./pages/Groups.jsx";
import LiveMap from "./pages/LiveMap.jsx";
import Search from "./pages/Search.jsx";
import Admins from "./pages/Admins.jsx";
import Pricing from "./pages/Pricing.jsx";
import ChangePasswordModal from "./components/ChangePasswordModal.jsx";
import logo from "./assets/logo.png";
import { statusClass } from "./lib/status.js";

const NAV = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "search", label: "Recherche" },
  { key: "map", label: "Carte" },
  { key: "courses", label: "Courses", permission: "courses" },
  { key: "pricing", label: "Tarifs", permission: "courses" },
  { key: "schedule", label: "Cédule", permission: "schedule" },
  { key: "drivers", label: "Chauffeurs", permission: "drivers" },
  { key: "clients", label: "Clients", permission: "clients" },
  { key: "reports", label: "Rapports", permission: "reports" },
  { key: "messages", label: "Messagerie" },
  { key: "groups", label: "Groupes", permission: "groups" },
  { key: "admins", label: "Administrateurs", dispatchOnly: true },
];

export default function App() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("ts_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [screen, setScreen] = useState("dashboard");
  const [notifs, setNotifs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    // Notification système du navigateur (visible même si la fenêtre est réduite ou sur un autre
    // onglet, tant que la console reste ouverte) — demandée une fois à la connexion.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => null);
    }
    const desktopNotify = (text) => {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
          new Notification("Taxi Sylvain — Dispatch", { body: text, tag: `ts-${Date.now()}` });
        }
      } catch { /* non supporté */ }
    };
    const push = (n) => {
      const entry = { id: `${Date.now()}-${Math.random()}`, text: n.text, status: n.status || null, at: new Date() };
      setNotifs((prev) => [entry, ...prev].slice(0, 100));
      setToasts((prev) => [entry, ...prev].slice(0, 4));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== entry.id)), 9000);
      desktopNotify(n.text);
    };
    socket.on("ride:notification", (n) => { push(n); playSound(n.status === "COMPLETED" ? "action" : "notify"); });
    socket.on("ride:created", (ride) => { push({ text: `Nouvelle course créée : ${ride?.pickupAddress || ""} → ${ride?.destAddress || ""}`, status: ride?.status || "REQUESTED" }); playSound("notify"); });
    socket.on("ride:refused", () => playSound("notify"));
    socket.on("report:generated", () => playSound("notify"));
    socket.on("message:direct", (m) => { if (m.sender.role !== "DISPATCH") playSound("notify"); });
    socket.on("message:group", ({ message }) => { if (message.sender.id !== user.id) playSound("notify"); });
    return () => {
      socket.off("ride:notification");
      socket.off("ride:created");
      socket.off("ride:refused");
      socket.off("report:generated");
      socket.off("message:direct");
      socket.off("message:group");
    };
  }, [user]);

  const logout = () => {
    resetSocket();
    api.logout();
    setUser(null);
  };

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
        <div className="brand"><img src={logo} alt="" />TAXI SYLVAIN</div>
        <div className="nav-list" style={{ flex: 1 }}>
          {NAV.filter((n) => {
            if (user.role === "DISPATCH") return true;
            if (n.dispatchOnly) return false;
            if (!n.permission) return true;
            return user.permissions?.includes(n.permission);
          }).map((n) => (
            <button
              key={n.key}
              className={`nav-item ${screen === n.key ? "active" : ""}`}
              onClick={() => setScreen(n.key)}
            >
              {n.label}
            </button>
          ))}
        </div>
        <div className="sidebar-footer" style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>{user.name}</div>
          <button className="btn outline" style={{ width: "100%", marginBottom: 8 }} onClick={() => setShowChangePassword(true)}>Changer le mot de passe</button>
          <button className="btn outline" style={{ width: "100%" }} onClick={logout}>Se déconnecter</button>
        </div>
      </div>
      <div className="content">
        {screen === "dashboard" && <Dashboard notifs={notifs} />}
        {screen === "search" && <Search />}
        {screen === "map" && <LiveMap />}
        {screen === "courses" && <Courses />}
        {screen === "pricing" && <Pricing />}
        {screen === "schedule" && <Schedule />}
        {screen === "drivers" && <Drivers />}
        {screen === "clients" && <Clients />}
        {screen === "reports" && <Reports />}
        {screen === "messages" && <Messages />}
        {screen === "groups" && <Groups />}
        {screen === "admins" && user.role === "DISPATCH" && <Admins />}
      </div>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${statusClass(t.status)}`} onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
            <span className="toast-dot" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
