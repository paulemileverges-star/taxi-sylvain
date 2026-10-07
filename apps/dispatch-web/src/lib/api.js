const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  try {
    return localStorage.getItem("ts_token");
  } catch {
    return null;
  }
}

// Session expirée ou révoquée (mot de passe changé ailleurs, compte supprimé) : l'application revient
// à l'écran de connexion au lieu d'afficher des pages vides (audit du 7 octobre 2026, F08).
let surSessionExpiree = null;
export function quandSessionExpiree(fn) {
  surSessionExpiree = fn;
}

// Délai maximal d'une requête : un serveur muet ne doit pas laisser un écran « Chargement… » sans fin.
const DELAI_MS = 20000;

// Clé tirée au hasard pour une saisie (création de course) : le serveur ne crée qu'une course par clé.
export function nouvelleCle() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* repli ci-dessous */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function request(path, { method = "GET", body, entetes = {} } = {}) {
  const avaitJeton = Boolean(getToken());
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...entetes,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout ? AbortSignal.timeout(DELAI_MS) : undefined,
    });
  } catch (e) {
    const err = new Error(e?.name === "TimeoutError" ? "Le serveur ne répond pas. Vérifiez la connexion et réessayez." : "Connexion au serveur impossible. Vérifiez la connexion et réessayez.");
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && avaitJeton && !path.startsWith("/auth/login") && surSessionExpiree) surSessionExpiree();
  if (!res.ok) {
    const err = new Error(data.error || "Erreur réseau");
    err.status = res.status;
    // La réponse complète accompagne l’erreur : la connexion répond 403 avec verificationRequired
    // quand un collaborateur doit d’abord saisir le code reçu par courriel.
    err.data = data;
    throw err;
  }
  return data;
}

// Construit l'URL absolue d'un fichier servi statiquement (ex. /uploads/xyz.jpg)
export function assetUrl(relativePath) {
  if (!relativePath) return null;
  return `${BASE_URL.replace(/\/api\/?$/, "")}${relativePath}`;
}

async function downloadFile(path, filename) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Échec du téléchargement.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function uploadFile(path, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur réseau");
  return data;
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  verifyEmail: (email, password, code) => request("/auth/verify-email", { method: "POST", body: { email, password, code } }),
  resendCode: (email, password) => request("/auth/resend-code", { method: "POST", body: { email, password } }),
  // Porte de secours : le Dispatch confirme le courriel d’un compte qui n’a pas reçu son code.
  confirmEmail: (userId) => request(`/auth/confirm-email/${userId}`, { method: "POST" }),
  // Notifications Web Push du navigateur (voir lib/webNotify.js).
  webPushKey: () => request("/push/web/key"),
  webPushSubscribe: (subscription) => request("/push/web/subscribe", { method: "POST", body: { subscription } }),
  webPushUnsubscribe: (endpoint) => request("/push/web/subscribe", { method: "DELETE", body: { endpoint } }),
  changePassword: (currentPassword, newPassword) => request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  listRides: () => request("/rides"),
  // Fournisseur d'adresses du serveur (google ou openstreetmap) : règle le rythme de la recherche.
  geocodeProvider: () => request("/geocode/fournisseur"),
  geocodeSearch: (q, session) => request(`/geocode/search?q=${encodeURIComponent(q)}${session ? `&session=${encodeURIComponent(session)}` : ""}`),
  // Détail d'une suggestion Google choisie : adresse complète et point exact (6 octobre 2026).
  geocodePlace: (placeId, session, { q = "", nom = "" } = {}) =>
    request(`/geocode/place/${encodeURIComponent(placeId)}?${new URLSearchParams({ ...(session ? { session } : {}), q, nom })}`),
  // La clé rend la création idempotente (double clic, réseau lent) : voir backend/src/lib/idempotence.js.
  createRide: (payload, cle) => request("/rides", { method: "POST", body: payload, entetes: cle ? { "Idempotency-Key": cle } : {} }),
  getRide: (id) => request(`/rides/${id}`),
  updateRide: (id, payload) => request(`/rides/${id}`, { method: "PATCH", body: payload }),
  assignDriver: (rideId, driverId) => request(`/rides/${rideId}/assign`, { method: "POST", body: { driverId } }),
  broadcastRide: (rideId) => request(`/rides/${rideId}/broadcast`, { method: "POST" }),
  listDrivers: () => request("/drivers"),
  // Liste minimale (nom, véhicule, en ligne) pour les sélecteurs de Courses, Cédule et Messagerie :
  // accessible sans la permission Chauffeurs (audit du 7 octobre 2026, F04).
  listDriverChoices: () => request("/drivers/choix"),
  resetDriverPassword: (id) => request(`/drivers/${id}/reset-password`, { method: "POST" }),
  resetClientPassword: (id) => request(`/clients/${id}/reset-password`, { method: "POST" }),
  me: () => request("/auth/me"),
  driverLocations: () => request("/drivers/locations"),
  search: (q) => request(`/drivers/search?q=${encodeURIComponent(q)}`),
  createDriver: (payload) => request("/drivers", { method: "POST", body: payload }),
  // Fiche chauffeur modifiable : nom, courriel, téléphone, véhicule, couleur, plaque (6 octobre 2026).
  updateDriver: (id, payload) => request(`/drivers/${id}`, { method: "PATCH", body: payload }),
  deleteDriver: (id) => request(`/drivers/${id}`, { method: "DELETE" }),
  listClients: () => request("/clients"),
  createClient: (payload) => request("/clients", { method: "POST", body: payload }),
  deleteClient: (id) => request(`/clients/${id}`, { method: "DELETE" }),
  updateClient: (id, payload) => request(`/clients/${id}`, { method: "PATCH", body: payload }),
  updateClientNotes: (id, notes) => request(`/clients/${id}/notes`, { method: "PATCH", body: { notes } }),
  listDestinations: () => request("/destinations"),
  updateDestination: (code, payload) => request(`/destinations/${code}`, { method: "PUT", body: payload }),
  priceQuote: (pickupAddress, destinationCode, clientId) => request("/pricing/quote", { method: "POST", body: { pickupAddress, destinationCode, clientId } }),
  listPriceZones: () => request("/pricing/zones"),
  createPriceZone: (payload) => request("/pricing/zones", { method: "POST", body: payload }),
  updatePriceZone: (id, payload) => request(`/pricing/zones/${id}`, { method: "PUT", body: payload }),
  deletePriceZone: (id) => request(`/pricing/zones/${id}`, { method: "DELETE" }),
  updateClientAddress: (id, address) => request(`/clients/${id}/address`, { method: "PATCH", body: { address } }),
  exportClients: (format) => downloadFile(`/clients/export?format=${format}`, `clients-taxi-sylvain.${format}`),
  exportDrivers: (format) => downloadFile(`/drivers/export?format=${format}`, `chauffeurs-taxi-sylvain.${format}`),
  importClients: (file) => uploadFile("/clients/import", file),
  importDrivers: (file) => uploadFile("/drivers/import", file),
  deleteRide: (id) => request(`/rides/${id}`, { method: "DELETE" }),
  weeklyReport: (range) => request(`/reports/weekly${range?.from ? `?${new URLSearchParams(range)}` : ""}`),
  // Rapport d'une période classé par chauffeur, effectuées et à effectuer (6 octobre 2026).
  reportPeriod: (range) => request(`/reports/periode${range?.from ? `?${new URLSearchParams(range)}` : ""}`),
  generateWeeklyReport: (range) => request("/reports/generate", { method: "POST", body: range || {} }),
  downloadReport: async (format, range) => {
    const params = new URLSearchParams({ format, ...(range || {}) });
    const res = await fetch(`${BASE_URL}/reports/export?${params}`, {
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    });
    if (!res.ok) throw new Error("Échec du téléchargement.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recap.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  listSchedule: () => request("/schedule"),
  createScheduleEntry: (payload) => request("/schedule", { method: "POST", body: payload }),
  deleteScheduleEntry: (id) => request(`/schedule/${id}`, { method: "DELETE" }),
  unreadMessages: () => request("/messages/unread"),
  markThreadRead: (threadKey) => request("/messages/read", { method: "POST", body: { threadKey } }),
  listDirectMessages: (driverId) => request(`/messages/direct/${driverId}`),
  sendDirectMessage: (driverId, text) => request(`/messages/direct/${driverId}`, { method: "POST", body: { text } }),
  listConversations: () => request("/conversations"),
  createConversation: (payload) => request("/conversations", { method: "POST", body: payload }),
  deleteConversation: (id) => request(`/conversations/${id}`, { method: "DELETE" }),
  suggest: (field, q) => request(`/suggestions?field=${field}&q=${encodeURIComponent(q)}`),
  listConversationMessages: (id) => request(`/conversations/${id}/messages`),
  sendConversationMessage: (id, text) => request(`/conversations/${id}/messages`, { method: "POST", body: { text } }),
  uploadDriverPhotos: async (driverId, { photo, carPhoto }) => {
    const form = new FormData();
    if (photo) form.append("photo", photo);
    if (carPhoto) form.append("carPhoto", carPhoto);
    const res = await fetch(`${BASE_URL}/drivers/${driverId}/photos`, {
      method: "POST",
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur réseau");
    return data;
  },
  listAdmins: () => request("/admins"),
  createAdmin: (payload) => request("/admins", { method: "POST", body: payload }),
  updateAdminPermissions: (id, permissions) => request(`/admins/${id}/permissions`, { method: "PATCH", body: { permissions } }),
  deleteAdmin: (id) => request(`/admins/${id}`, { method: "DELETE" }),
  // Demandes de suppression de compte, validées ou refusées par le Dispatch.
  listDeletionRequests: () => request("/admins/deletion-requests"),
  approveDeletion: (userId) => request(`/admins/deletion-requests/${userId}/approve`, { method: "POST" }),
  refuseDeletion: (userId, raison) => request(`/admins/deletion-requests/${userId}/refuse`, { method: "POST", body: { raison } }),
  emailStatus: () => request("/admins/email-status"),
  sendTestEmail: (to) => request("/admins/email-test", { method: "POST", body: to ? { to } : {} }),
  setToken: (t) => { try { localStorage.setItem("ts_token", t); } catch { /* stockage indisponible */ } },
  logout: () => {
    try {
      localStorage.removeItem("ts_token");
      localStorage.removeItem("ts_user");
    } catch { /* stockage indisponible */ }
  },
};
