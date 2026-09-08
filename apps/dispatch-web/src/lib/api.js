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

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  listRides: () => request("/rides"),
  createRide: (payload) => request("/rides", { method: "POST", body: payload }),
  assignDriver: (rideId, driverId) => request(`/rides/${rideId}/assign`, { method: "POST", body: { driverId } }),
  broadcastRide: (rideId) => request(`/rides/${rideId}/broadcast`, { method: "POST" }),
  listDrivers: () => request("/drivers"),
  weeklyReport: () => request("/reports/weekly"),
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
  listDirectMessages: (driverId) => request(`/messages/direct/${driverId}`),
  sendDirectMessage: (driverId, text) => request(`/messages/direct/${driverId}`, { method: "POST", body: { text } }),
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
  setToken: (t) => localStorage.setItem("ts_token", t),
};
