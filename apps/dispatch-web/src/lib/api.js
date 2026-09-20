const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  return localStorage.getItem("ts_token");
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur réseau");
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
  if (!res.ok) throw new Error("Échec du téléchargement.");
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
  changePassword: (currentPassword, newPassword) => request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  listRides: () => request("/rides"),
  geocodeSearch: (q) => request(`/geocode/search?q=${encodeURIComponent(q)}`),
  createRide: (payload) => request("/rides", { method: "POST", body: payload }),
  getRide: (id) => request(`/rides/${id}`),
  updateRide: (id, payload) => request(`/rides/${id}`, { method: "PATCH", body: payload }),
  assignDriver: (rideId, driverId) => request(`/rides/${rideId}/assign`, { method: "POST", body: { driverId } }),
  broadcastRide: (rideId) => request(`/rides/${rideId}/broadcast`, { method: "POST" }),
  listDrivers: () => request("/drivers"),
  driverLocations: () => request("/drivers/locations"),
  search: (q) => request(`/drivers/search?q=${encodeURIComponent(q)}`),
  createDriver: (payload) => request("/drivers", { method: "POST", body: payload }),
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
  emailStatus: () => request("/admins/email-status"),
  sendTestEmail: (to) => request("/admins/email-test", { method: "POST", body: to ? { to } : {} }),
  setToken: (t) => localStorage.setItem("ts_token", t),
  logout: () => {
    localStorage.removeItem("ts_token");
    localStorage.removeItem("ts_user");
  },
};
