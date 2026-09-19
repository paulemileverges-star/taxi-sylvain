import React, { useEffect, useState } from "react";
import { SafeAreaView, StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginScreen from "./src/screens/LoginScreen";
import BookScreen from "./src/screens/BookScreen";
import TrackingScreen from "./src/screens/TrackingScreen";
import RateScreen from "./src/screens/RateScreen";
import ChatScreen from "./src/screens/ChatScreen";
import GroupsScreen from "./src/screens/GroupsScreen";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import DeleteAccountScreen from "./src/screens/DeleteAccountScreen";
import NotificationSettingsScreen from "./src/screens/NotificationSettingsScreen";
import RidesScreen from "./src/screens/RidesScreen";
import { getSocket, resetSocket } from "./src/lib/socket";
import { api, logout as clearSession } from "./src/lib/api";
import { playSound } from "./src/lib/sound";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications, clearPushToken } from "./src/lib/pushNotifications";
import { requestWebNotificationPermission, notifyWeb } from "./src/lib/webNotify";

const EMPTY_UNREAD = { direct: { total: 0, byDriver: {} }, groups: { total: 0, byConversation: {} }, rides: { total: 0, byRide: {} }, total: 0 };

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("book");
  const [activeRideId, setActiveRideId] = useState(null);
  const [unread, setUnread] = useState(EMPTY_UNREAD);
  const refreshUnread = () => api.unreadMessages().then(setUnread).catch(() => null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem("ts_user");
      if (!raw) return;
      setUser(JSON.parse(raw));
      // Profil rafraîchi (adresse de domicile modifiée par le Dispatch, etc.)
      try {
        const fresh = await api.me();
        await AsyncStorage.setItem("ts_user", JSON.stringify(fresh));
        setUser(fresh);
      } catch (e) {
        // Compte supprimé (par exemple depuis la page web) ou session refusée : on ferme la session
        // locale. Hors ligne (status 0), on garde la copie locale.
        if (e.status === 401 || e.status === 404) {
          await clearSession();
          setUser(null);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeRideId) return;
    let sock;
    getSocket().then((s) => {
      sock = s;
      s.emit("ride:watch", activeRideId);
      s.on("ride:status", (ride) => {
        playSound("notify");
        if (ride.status === "COMPLETED") setScreen("rate");
      });
    });
    return () => sock?.off("ride:status");
  }, [activeRideId]);

  useEffect(() => {
    if (!user) return;
    let sock;
    getSocket().then((s) => {
      sock = s;
      // Son + badge + notification navigateur pour tout message reçu, quel que soit l'écran ouvert
      s.on("message:group", ({ message }) => {
        if (message.sender.id === user.id) return;
        playSound("notify"); notifyWeb(`${message.sender.name} (groupe)`, message.text); refreshUnread();
      });
      s.on("message:ride", (m) => {
        if (m.sender.id === user.id) return;
        playSound("notify"); notifyWeb(`Message de ${m.sender.name}`, m.text); refreshUnread();
      });
    });
    registerForPushNotifications();
    requestWebNotificationPermission();
    refreshUnread();
    return () => { sock?.off("message:group"); sock?.off("message:ride"); };
  }, [user]);

  // Permet de rouvrir directement le bon écran quand on tape sur une notification reçue
  // app fermée ou en arrière-plan.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === "ride:status" && data.rideId) {
        setActiveRideId(data.rideId);
        setScreen(data.status === "COMPLETED" ? "rate" : "tracking");
      } else if (data?.type === "ride:reminder" && data.rideId) {
        setActiveRideId(data.rideId);
        setScreen("tracking");
      } else if (data?.type === "message:group") {
        setScreen("groups");
      }
    });
    return () => sub.remove();
  }, []);

  // server: false après une suppression de compte : le compte n'existe plus, il n'y a rien à
  // retirer côté serveur (l'ancien appel faisait même planter le serveur).
  const logout = async ({ server = true } = {}) => {
    resetSocket();
    if (server) await clearPushToken();
    await clearSession();
    setUser(null);
    setScreen("book");
    setActiveRideId(null);
  };

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1b2d" }}>
        <StatusBar barStyle="light-content" />
        <LoginScreen onLogin={setUser} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1b2d" }}>
      <StatusBar barStyle="light-content" />
      {screen === "book" && (
        <BookScreen
          user={user}
          onBooked={(rideId) => { setActiveRideId(rideId); setScreen("tracking"); }}
          onOpenGroups={() => setScreen("groups")}
          onOpenChangePassword={() => setScreen("changePassword")}
          onOpenDeleteAccount={() => setScreen("deleteAccount")}
          onOpenNotifications={() => setScreen("notifications")}
          onOpenRides={() => setScreen("rides")}
          onLogout={logout}
          unread={unread}
        />
      )}
      {screen === "rides" && (
        <RidesScreen
          onOpenRide={(id) => { setActiveRideId(id); setScreen("tracking"); }}
          onBack={() => setScreen("book")}
        />
      )}
      {screen === "tracking" && activeRideId && (
        <TrackingScreen rideId={activeRideId} onOpenChat={() => setScreen("chat")} onBack={() => setScreen("book")} unreadRide={unread.rides.byRide[activeRideId] || 0} />
      )}
      {screen === "chat" && activeRideId && (
        <ChatScreen rideId={activeRideId} onBack={() => setScreen("tracking")} onRead={refreshUnread} />
      )}
      {screen === "rate" && activeRideId && (
        <RateScreen rideId={activeRideId} onDone={() => { setActiveRideId(null); setScreen("book"); }} />
      )}
      {screen === "groups" && <GroupsScreen user={user} onBack={() => setScreen("book")} unread={unread.groups.byConversation} onRead={refreshUnread} />}
      {screen === "changePassword" && <ChangePasswordScreen onBack={() => setScreen("book")} />}
      {/* Après la suppression, le compte n'existe plus : déconnexion locale, sans appel au serveur. */}
      {screen === "deleteAccount" && (
        <DeleteAccountScreen onBack={() => setScreen("book")} onDeleted={() => logout({ server: false })} />
      )}
      {screen === "notifications" && (
        <NotificationSettingsScreen
          user={user}
          onSaved={(u) => setUser(u)}
          onBack={() => setScreen("book")}
        />
      )}
    </SafeAreaView>
  );
}
