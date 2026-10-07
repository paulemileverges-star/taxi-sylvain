import React, { useEffect, useState } from "react";
import "./App.css";
import { api, quandSessionExpiree } from "./lib/api.js";
import { getSocket, resetSocket, quandConnexionRefusee } from "./lib/socket.js";
import { playSound } from "./lib/sound.js";
import { notifyWeb, registerWebPush, unregisterWebPush } from "./lib/webNotify.js";
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
import Suppressions from "./pages/Suppressions.jsx";
import Pricing from "./pages/Pricing.jsx";
import ChangePasswordModal from "./components/ChangePasswordModal.jsx";
import logo from "./assets/logo.png";
import { statusClass } from "./lib/status.js";
import { VERSION_WEB } from "./lib/version.js";

// Chaque page n'apparaît qu'avec l'une des permissions que le serveur exige pour elle (audit du
// 7 octobre 2026, F04) : avant, Recherche, Carte et Messagerie s'affichaient à tous les comptes et
// restaient vides faute de droit.
const NAV = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "search", label: "Recherche", permissions: ["drivers", "clients", "courses", "schedule"] },
  { key: "map", label: "Carte", permissions: ["courses", "drivers"] },
  { key: "courses", label: "Courses", permissions: ["courses"] },
  { key: "pricing", label: "Tarifs", permissions: ["courses"] },
  { key: "schedule", label: "Cédule", permissions: ["schedule"] },
  { key: "drivers", label: "Chauffeurs", permissions: ["drivers"] },
  { key: "clients", label: "Clients", permissions: ["clients"] },
  { key: "reports", label: "Rapports", permissions: ["reports"] },
  { key: "messages", label: "Messagerie", permissions: ["groups"] },
  { key: "groups", label: "Groupes", permissions: ["groups"] },
  { key: "admins", label: "Administrateurs", dispatchOnly: true },
  { key: "suppressions", label: "Suppressions", dispatchOnly: true },
];

/** Le compte a-t-il accès à cette entrée du menu ? Même règle que le serveur (lib/equipe.js). */
export function accesPage(user, entree) {
  if (!user) return false;
  if (user.role === "DISPATCH") return true;
  if (entree.dispatchOnly) return false;
  if (!entree.permissions) return true;
  return entree.permissions.some((p) => user.permissions?.includes(p));
}

// Session ouverte : jeton et profil gardés dans le navigateur.
function ouvrirSession(data, setUser) {
  api.setToken(data.token);
  try { localStorage.setItem("ts_user", JSON.stringify(data.user)); } catch { /* stockage indisponible */ }
  setUser(data.user);
}

// Profil gardé dans le navigateur, lu prudemment : un stockage abîmé ne doit pas donner une page
// blanche (audit du 7 octobre 2026, F14).
function profilEnregistre() {
  try {
    const raw = localStorage.getItem("ts_user");
    const user = raw ? JSON.parse(raw) : null;
    return user && typeof user === "object" && user.id ? user : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState(profilEnregistre);
  const [screen, setScreen] = useState("dashboard");
  const [notifs, setNotifs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [unread, setUnread] = useState({ direct: { total: 0, byDriver: {} }, groups: { total: 0, byConversation: {} }, total: 0 });
  const refreshUnread = () => api.unreadMessages().then(setUnread).catch(() => null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  // Demandes de suppression de compte en attente (pastille du menu, compte Dispatch seulement).
  const [deletionCount, setDeletionCount] = useState(0);
  const refreshDeletions = () => api.listDeletionRequests().then((l) => setDeletionCount(l.length)).catch(() => null);

  // Session expirée ou révoquée : retour à l'écran de connexion. À l'ouverture, le profil (rôle et
  // permissions) est relu au serveur : la copie du navigateur peut dater (F08, F14).
  useEffect(() => {
    const sortir = () => {
      resetSocket();
      api.logout();
      setUser(null);
    };
    quandSessionExpiree(sortir);
    quandConnexionRefusee(sortir);
  }, []);
  useEffect(() => {
    if (!user) return;
    api.me().then((profil) => {
      if (!profil?.id) return;
      setUser((u) => (u && (JSON.stringify(u.permissions) !== JSON.stringify(profil.permissions) || u.role !== profil.role || u.name !== profil.name) ? { ...u, ...profil } : u));
      try { localStorage.setItem("ts_user", JSON.stringify({ ...user, ...profil })); } catch { /* stockage indisponible */ }
    }).catch(() => null);
  }, [user?.id]);

  // Clic sur une notification du navigateur (service worker, F17) : ouvre la page concernée.
  useEffect(() => {
    if (!user) return undefined;
    const ouvrir = (donnees) => {
      const type = String(donnees?.type || "");
      const cible = type.startsWith("message:direct") ? "messages" : type.startsWith("message:group") ? "groups" : type.startsWith("ride") ? "courses" : type.startsWith("report") ? "reports" : null;
      const entree = NAV.find((n) => n.key === cible);
      if (entree && accesPage(user, entree)) setScreen(cible);
    };
    const surMessage = (e) => { if (e.data?.type === "notification-clic") ouvrir(e.data.data); };
    navigator.serviceWorker?.addEventListener("message", surMessage);
    try {
      const brut = new URLSearchParams(window.location.search).get("notification");
      if (brut) {
        ouvrir(JSON.parse(brut));
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch { /* adresse illisible : on reste sur l'accueil */ }
    return () => navigator.serviceWorker?.removeEventListener("message", surMessage);
  }, [user?.id]);

  useEffect(() => {
    if (!user || user.role !== "DISPATCH") return undefined;
    const socket = getSocket();
    refreshDeletions();
    socket.on("account:deletion-changed", refreshDeletions);
    return () => socket.off("account:deletion-changed", refreshDeletions);
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const socket = getSocket();
    // Notification système du navigateur, par le service worker : visible même si la fenêtre est
    // réduite ou sur un autre onglet, et par Web Push même console fermée (voir lib/webNotify.js).
    registerWebPush();
    const desktopNotify = (text) => notifyWeb("Taxi Sylvain — Dispatch", text);
    const push = (n) => {
      const entry = { id: `${Date.now()}-${Math.random()}`, text: n.text, status: n.status || null, at: new Date() };
      setNotifs((prev) => [entry, ...prev].slice(0, 100));
      setToasts((prev) => [entry, ...prev].slice(0, 4));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== entry.id)), 9000);
      desktopNotify(n.text);
    };
    // Écouteurs nommés, retirés un par un : « off(évènement) » sans fonction retirait aussi ceux des
    // pages ouvertes (audit du 7 octobre 2026, F02).
    const surNotification = (n) => { push(n); playSound(n.status === "COMPLETED" ? "action" : "notify"); };
    const surCreation = (ride) => { push({ text: `Nouvelle course créée : ${ride?.pickupAddress || ""} → ${ride?.destAddress || ""}`, status: ride?.status || "REQUESTED" }); playSound("notify"); };
    const surSon = () => playSound("notify");
    const surDirect = (m) => {
      if (m.sender.id === user.id) return;
      playSound("notify"); desktopNotify(`${m.sender.name} : ${m.text}`); refreshUnread();
    };
    const surGroupe = ({ message }) => {
      if (message.sender.id === user.id) return;
      playSound("notify"); desktopNotify(`${message.sender.name} (groupe) : ${message.text}`); refreshUnread();
    };
    socket.on("ride:notification", surNotification);
    socket.on("ride:created", surCreation);
    socket.on("ride:refused", surSon);
    socket.on("report:generated", surSon);
    socket.on("message:direct", surDirect);
    socket.on("message:group", surGroupe);
    refreshUnread();
    return () => {
      socket.off("ride:notification", surNotification);
      socket.off("ride:created", surCreation);
      socket.off("ride:refused", surSon);
      socket.off("report:generated", surSon);
      socket.off("message:direct", surDirect);
      socket.off("message:group", surGroupe);
    };
  }, [user]);

  const logout = async () => {
    resetSocket();
    // Ce navigateur ne doit plus recevoir les notifications de ce compte (avant d'effacer le jeton).
    await unregisterWebPush();
    api.logout();
    setUser(null);
  };

  if (!user) {
    return (
      <Login
        onLogin={async (email, password) => ouvrirSession(await api.login(email, password), setUser)}
        onVerify={async (email, password, code) => ouvrirSession(await api.verifyEmail(email, password, code), setUser)}
        onResend={(email, password) => api.resendCode(email, password)}
      />
    );
  }

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="brand"><img src={logo} alt="" />TAXI SYLVAIN</div>
        <div className="nav-list" style={{ flex: 1 }}>
          {NAV.filter((n) => accesPage(user, n)).map((n) => (
            <button
              key={n.key}
              className={`nav-item ${screen === n.key ? "active" : ""}`}
              onClick={() => setScreen(n.key)}
            >
              {n.label}
              {n.key === "messages" && unread.direct.total > 0 && <span className="nav-badge">{unread.direct.total}</span>}
              {n.key === "groups" && unread.groups.total > 0 && <span className="nav-badge">{unread.groups.total}</span>}
              {n.key === "suppressions" && deletionCount > 0 && <span className="nav-badge">{deletionCount}</span>}
            </button>
          ))}
        </div>
        <div className="sidebar-footer" style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>{user.name}</div>
          <button className="btn outline" style={{ width: "100%", marginBottom: 8 }} onClick={() => setShowChangePassword(true)}>Changer le mot de passe</button>
          <button className="btn outline" style={{ width: "100%" }} onClick={logout}>Se déconnecter</button>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>Version {VERSION_WEB}</div>
        </div>
      </div>
      <div className="content">
        {/* Une page n'est affichée que si le compte y a toujours accès (permissions relues à l'ouverture). */}
        {screen === "dashboard" && <Dashboard notifs={notifs} />}
        {screen === "search" && accesPage(user, NAV[1]) && <Search user={user} />}
        {screen === "map" && accesPage(user, NAV[2]) && <LiveMap />}
        {screen === "courses" && accesPage(user, NAV[3]) && <Courses user={user} />}
        {screen === "pricing" && accesPage(user, NAV[4]) && <Pricing />}
        {screen === "schedule" && accesPage(user, NAV[5]) && <Schedule user={user} />}
        {screen === "drivers" && accesPage(user, NAV[6]) && <Drivers />}
        {screen === "clients" && accesPage(user, NAV[7]) && <Clients />}
        {screen === "reports" && accesPage(user, NAV[8]) && <Reports />}
        {screen === "messages" && accesPage(user, NAV[9]) && <Messages unread={unread.direct.byDriver} onRead={refreshUnread} />}
        {screen === "groups" && accesPage(user, NAV[10]) && <Groups user={user} unread={unread.groups.byConversation} onRead={refreshUnread} />}
        {screen === "admins" && user.role === "DISPATCH" && <Admins />}
        {screen === "suppressions" && user.role === "DISPATCH" && <Suppressions onChanged={setDeletionCount} />}
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
