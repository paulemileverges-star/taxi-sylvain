import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api";

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

// URL de téléchargement du récap (token en query — ouvert dans le navigateur via Linking.openURL,
// qui ne peut pas envoyer d'en-tête Authorization).
export async function reportDownloadUrl(format, weekStart, weekEnd) {
  const token = await AsyncStorage.getItem("ts_token");
  const params = new URLSearchParams({ format, token, from: weekStart, to: weekEnd });
  return `${BASE_URL}/reports/export?${params}`;
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  changePassword: (currentPassword, newPassword) => request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  registerPushToken: (token) => request("/auth/push-token", { method: "POST", body: { token } }),
  clearPushToken: () => request("/auth/push-token", { method: "DELETE" }),
  updateNotificationPrefs: (offsets) => request("/auth/notification-prefs", { method: "PATCH", body: { offsets } }),
  myRides: () => request("/rides"),
  myRidesPaged: (when, page) => request(`/rides?when=${when}&page=${page}&pageSize=10`),
  mySchedule: () => request("/schedule"),
  acceptRide: (id) => request(`/rides/${id}/accept`, { method: "POST" }),
  refuseRide: (id) => request(`/rides/${id}/refuse`, { method: "POST" }),
  setRideStatus: (id, status) => request(`/rides/${id}/status`, { method: "POST", body: { status } }),
  cancelRide: (id) => request(`/rides/${id}/status`, { method: "POST", body: { status: "CANCELLED" } }),
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
  await AsyncStorage.multiRemove(["ts_token", "ts_user"]);
}
