import AsyncStorage from "@react-native-async-storage/async-storage";
import { lireJeton, effacerJeton } from "./session";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

// Session expirée ou révoquée (mot de passe changé ailleurs, compte supprimé) : l'application revient
// à l'écran de connexion au lieu d'échouer sur chaque écran (audit du 7 octobre 2026, F08).
let surSessionExpiree = null;
export function quandSessionExpiree(fn) {
  surSessionExpiree = fn;
}

// Délai maximal d'une requête : un serveur muet ne doit pas laisser un écran « Chargement… » sans fin.
const DELAI_MS = 20000;

async function request(path, { method = "GET", body } = {}) {
  const token = await lireJeton();
  const controle = typeof AbortController === "function" ? new AbortController() : null;
  const minuterie = controle ? setTimeout(() => controle.abort(), DELAI_MS) : null;
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controle?.signal,
    });
  } catch {
    // Pas de réponse du tout (téléphone hors ligne, serveur injoignable ou trop lent) : message en
    // français plutôt que l'erreur technique du navigateur.
    const err = new Error("Connexion impossible. Vérifiez votre accès Internet et réessayez.");
    err.status = 0;
    throw err;
  } finally {
    if (minuterie) clearTimeout(minuterie);
  }
  if (res.status === 401 && token && !path.startsWith("/auth/") && surSessionExpiree) surSessionExpiree();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Le code HTTP accompagne le message : 401 ou 404 sur /auth/me veut dire que le compte n'existe
    // plus (supprimé), et l'application doit alors fermer la session.
    const err = new Error(data.error || "Erreur réseau");
    err.status = res.status;
    // La réponse complète accompagne l’erreur : la connexion répond 403 avec
    // verificationRequired quand un code de confirmation doit d’abord être saisi.
    err.data = data;
    throw err;
  }
  return data;
}

// URL de téléchargement du récap, ouverte dans le navigateur (Linking.openURL ne peut pas envoyer
// d'en-tête Authorization). Audit du 7 octobre 2026 (SEC-19) : l'adresse portait le jeton de session
// complet, valable 30 jours ; elle porte maintenant un jeton d'export valable 5 minutes, qui n'ouvre
// que cet export.
export async function reportDownloadUrl(format, weekStart, weekEnd) {
  const { jeton } = await request("/reports/export-link", { method: "POST" });
  const params = new URLSearchParams({ format, jeton, from: weekStart, to: weekEnd });
  return `${BASE_URL}/reports/export?${params}`;
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  // Confirmation du courriel par code à six chiffres (nouveaux comptes).
  verifyEmail: (email, password, code) => request("/auth/verify-email", { method: "POST", body: { email, password, code } }),
  resendCode: (email, password) => request("/auth/resend-code", { method: "POST", body: { email, password } }),
  me: () => request("/auth/me"),
  changePassword: (currentPassword, newPassword) => request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  // Depuis le 20 septembre 2026 : une DEMANDE de suppression, validée par Taxi Sylvain ; annulable.
  deleteAccount: (password) => request("/auth/delete-account", { method: "POST", body: { password } }),
  cancelDeletion: () => request("/auth/cancel-deletion", { method: "POST" }),
  registerPushToken: (token) => request("/auth/push-token", { method: "POST", body: { token } }),
  clearPushToken: () => request("/auth/push-token", { method: "DELETE" }),
  // Notifications Web Push (version web seulement, voir lib/webNotify.js).
  webPushKey: () => request("/push/web/key"),
  webPushSubscribe: (subscription) => request("/push/web/subscribe", { method: "POST", body: { subscription } }),
  webPushUnsubscribe: (endpoint) => request("/push/web/subscribe", { method: "DELETE", body: { endpoint } }),
  // Courses terminées qu’il reste à noter (proposées à l’ouverture de l’application).
  pendingRatings: () => request("/ratings/pending"),
  updateNotificationPrefs: (offsets) => request("/auth/notification-prefs", { method: "PATCH", body: { offsets } }),
  myRides: () => request("/rides"),
  // Une seule course (au lieu de toute la liste) : notation, suivi (audit du 7 octobre 2026, F20).
  ride: (id) => request(`/rides/${id}`),
  myRidesPaged: (when, page) => request(`/rides?when=${when}&page=${page}&pageSize=10`),
  mySchedule: () => request("/schedule"),
  acceptRide: (id) => request(`/rides/${id}/accept`, { method: "POST" }),
  refuseRide: (id) => request(`/rides/${id}/refuse`, { method: "POST" }),
  setRideStatus: (id, status) => request(`/rides/${id}/status`, { method: "POST", body: { status } }),
  cancelRide: (id) => request(`/rides/${id}/status`, { method: "POST", body: { status: "CANCELLED" } }),
  unreadMessages: () => request("/messages/unread"),
  markThreadRead: (threadKey) => request("/messages/read", { method: "POST", body: { threadKey } }),
  rideMessages: (rideId) => request(`/messages/${rideId}`),
  sendMessage: (rideId, text) => request(`/messages/${rideId}`, { method: "POST", body: { text } }),
  callMasked: (rideId) => request(`/rides/${rideId}/call`, { method: "POST" }),
  dispatchMessages: (driverId) => request(`/messages/direct/${driverId}`),
  sendDispatchMessage: (driverId, text, rideId) => request(`/messages/direct/${driverId}`, { method: "POST", body: { text, rideId } }),
  myReports: () => request("/reports/mine"),
  myEarnings: () => request("/reports/my-earnings"),
  rate: (rideId, toUserId, stars, comment) => request(`/ratings/${rideId}`, { method: "POST", body: { toUserId, stars, comment } }),
  listConversations: () => request("/conversations"),
  conversationMessages: (id) => request(`/conversations/${id}/messages`),
  sendConversationMessage: (id, text) => request(`/conversations/${id}/messages`, { method: "POST", body: { text } }),
};

export async function logout() {
  await effacerJeton();
  await AsyncStorage.removeItem("ts_user");
}
