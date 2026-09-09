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
import { getSocket, resetSocket } from "./src/lib/socket";
import { logout as clearSession } from "./src/lib/api";
import { playSound } from "./src/lib/sound";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications, clearPushToken } from "./src/lib/pushNotifications";

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("book");
  const [activeRideId, setActiveRideId] = useState(null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem("ts_user");
      if (raw) setUser(JSON.parse(raw));
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
      s.on("message:group", ({ message }) => { if (message.sender.id !== user.id) playSound("notify"); });
    });
    registerForPushNotifications();
    return () => sock?.off("message:group");
  }, [user]);

  // Permet de rouvrir directement le bon écran quand on tape sur une notification reçue
  // app fermée ou en arrière-plan.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === "ride:status" && data.rideId) {
        setActiveRideId(data.rideId);
        setScreen(data.status === "COMPLETED" ? "rate" : "tracking");
      } else if (data?.type === "message:group") {
        setScreen("groups");
      }
    });
    return () => sub.remove();
  }, []);

  const logout = async () => {
    resetSocket();
    await clearPushToken();
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
          onLogout={logout}
        />
      )}
      {screen === "tracking" && activeRideId && (
        <TrackingScreen rideId={activeRideId} onOpenChat={() => setScreen("chat")} onBack={() => setScreen("book")} />
      )}
      {screen === "chat" && activeRideId && (
        <ChatScreen rideId={activeRideId} onBack={() => setScreen("tracking")} />
      )}
      {screen === "rate" && activeRideId && (
        <RateScreen rideId={activeRideId} onDone={() => { setActiveRideId(null); setScreen("book"); }} />
      )}
      {screen === "groups" && <GroupsScreen user={user} onBack={() => setScreen("book")} />}
      {screen === "changePassword" && <ChangePasswordScreen onBack={() => setScreen("book")} />}
    </SafeAreaView>
  );
}
