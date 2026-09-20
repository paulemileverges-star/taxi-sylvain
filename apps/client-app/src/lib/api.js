import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

// Construit l'URL absolue d'un fichier servi statiquement (ex. /uploads/xyz.jpg)
export function assetUrl(relativePath) {
  if (!relativePath) return null;
  return `${BASE_URL.replace(/\/api\/?$/, "")}${relativePath}`;
}

async function request(path, { method = "GET", body } = {}) {
  const token = await AsyncStorage.getItem("ts_token");
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Pas de réponse du tout (téléphone hors ligne, serveur injoignable) : message en français
    // plutôt que l'erreur technique du navigateur.
    const err = new Error("Connexion impossible. Vérifiez votre accès Internet et réessayez.");
    err.status = 0;
    throw err;
  }
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

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  register: (name, email, phone, password) => request("/auth/register", { method: "POST", body: { name, email, phone, password } }),
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
  myRidesPaged: (when, page) => request(`/rides?when=${when}&page=${page}&pageSize=10`),
  geocodeSearch: (q) => request(`/geocode/search?q=${encodeURIComponent(q)}`),
  acceptRide: (id) => request(`/rides/${id}/accept`, { method: "POST" }),
  refuseRide: (id) => request(`/rides/${id}/refuse`, { method: "POST" }),
  setRideStatus: (id, status) => request(`/rides/${id}/status`, { method: "POST", body: { status } }),
  unreadMessages: () => request("/messages/unread"),
  markThreadRead: (threadKey) => request("/messages/read", { method: "POST", body: { threadKey } }),
  rideMessages: (rideId) => request(`/messages/${rideId}`),
  sendMessage: (rideId, text) => request(`/messages/${rideId}`, { method: "POST", body: { text } }),
  callMasked: (rideId) => request(`/rides/${rideId}/call`, { method: "POST" }),
  driverLocation: (rideId) => request(`/rides/${rideId}/driver-location`),
  destinations: () => request("/destinations"),
  priceQuote: (pickupAddress, destinationCode) => request("/pricing/quote", { method: "POST", body: { pickupAddress, destinationCode } }),
  rate: (rideId, toUserId, stars, comment) => request(`/ratings/${rideId}`, { method: "POST", body: { toUserId, stars, comment } }),
  listConversations: () => request("/conversations"),
  conversationMessages: (id) => request(`/conversations/${id}/messages`),
  sendConversationMessage: (id, text) => request(`/conversations/${id}/messages`, { method: "POST", body: { text } }),
};

// Endpoints spécifiques à l'app Client
api.bookRide = (payload) => request("/rides", { method: "POST", body: payload });

export async function logout() {
  await AsyncStorage.multiRemove(["ts_token", "ts_user"]);
}
