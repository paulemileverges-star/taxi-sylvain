import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

// Construit l'URL absolue d'un fichier servi statiquement (ex. /uploads/xyz.jpg)
export function assetUrl(relativePath) {
  if (!relativePath) return null;
  return `${BASE_URL.replace(/\/api\/?$/, "")}${relativePath}`;
}

async function request(path, { method = "GET", body } = {}) {
  const token = await AsyncStorage.getItem("ts_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur réseau");
  return data;
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  myRides: () => request("/rides"),
  acceptRide: (id) => request(`/rides/${id}/accept`, { method: "POST" }),
  refuseRide: (id) => request(`/rides/${id}/refuse`, { method: "POST" }),
  setRideStatus: (id, status) => request(`/rides/${id}/status`, { method: "POST", body: { status } }),
  rideMessages: (rideId) => request(`/messages/${rideId}`),
  sendMessage: (rideId, text) => request(`/messages/${rideId}`, { method: "POST", body: { text } }),
  callMasked: (rideId) => request(`/rides/${rideId}/call`, { method: "POST" }),
  rate: (rideId, toUserId, stars, comment) => request(`/ratings/${rideId}`, { method: "POST", body: { toUserId, stars, comment } }),
};

// Endpoints spécifiques à l'app Client
api.bookRide = (payload) => request("/rides", { method: "POST", body: payload });
