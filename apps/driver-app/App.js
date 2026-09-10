import React, { useEffect, useState } from "react";
import { SafeAreaView, StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ActiveRideScreen from "./src/screens/ActiveRideScreen";
import RatingScreen from "./src/screens/RatingScreen";
import EarningsScreen from "./src/screens/EarningsScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import RideChatScreen from "./src/screens/RideChatScreen";
import GroupsScreen from "./src/screens/GroupsScreen";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import { getSocket, resetSocket } from "./src/lib/socket";
import { logout as clearSession } from "./src/lib/api";
import { playSound } from "./src/lib/sound";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications, clearPushToken } from "./src/lib/pushNotifications";

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("home");
  const [activeRideId, setActiveRideId] = useState(null);
  const [newReport, setNewReport] = useState(false);
  const [messageRideContext, setMessageRideContext] = useState(null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem("ts_user");
      if (raw) setUser(JSON.parse(raw));
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    let sock;
    getSocket().then((s) => {
      sock = s;
      // Reçoit les diffusions de courses de dernière minute et les affectations directes
      s.on("ride:broadcast", () => playSound("alert"));
      s.on("ride:assigned", (ride) => { playSound("alert"); setActiveRideId(ride.id); setScreen("active"); });
      s.on("report:ready", () => { setNewReport(true); playSound("notify"); });
      s.on("message:group", ({ message }) => { if (message.sender.id !== user.id) playSound("notify"); });
    });
    registerForPushNotifications();
    return () => {
      sock?.off("ride:broadcast");
      sock?.off("ride:assigned");
      sock?.off("report:ready");
      sock?.off("message:group");
    };
  }, [user]);

  // Permet de rouvrir directement la bonne course quand on tape sur une notification
  // reçue app fermée ou en arrière-plan.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if ((data?.type === "ride:assigned" || data?.type === "ride:broadcast") && data.rideId) {
        setActiveRideId(data.rideId);
        setScreen("active");
      } else if (data?.type === "message:direct") {
        setScreen("messages");
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
    setScreen("home");
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
      {screen === "home" && (
        <HomeScreen
          user={user}
          onOpenRide={(id) => { setActiveRideId(id); setScreen("active"); }}
          onOpenEarnings={() => setScreen("earnings")}
          onOpenMessages={() => { setMessageRideContext(null); setScreen("messages"); }}
          onOpenReports={() => { setNewReport(false); setScreen("reports"); }}
          onOpenGroups={() => setScreen("groups")}
          onOpenChangePassword={() => setScreen("changePassword")}
          onLogout={logout}
          hasNewReport={newReport}
        />
      )}
      {screen === "active" && activeRideId && (
        <ActiveRideScreen
          rideId={activeRideId}
          onCompleted={() => setScreen("rating")}
          onCancelled={() => { setActiveRideId(null); setScreen("home"); }}
          onOpenChat={() => setScreen("rideChat")}
          onOpenMessages={(ride) => { setMessageRideContext(ride || null); setScreen("messages"); }}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "rating" && activeRideId && (
        <RatingScreen rideId={activeRideId} onDone={() => { setActiveRideId(null); setScreen("home"); }} />
      )}
      {screen === "rideChat" && activeRideId && (
        <RideChatScreen rideId={activeRideId} onBack={() => setScreen("active")} />
      )}
      {screen === "earnings" && <EarningsScreen onBack={() => setScreen("home")} />}
      {screen === "messages" && (
        <MessagesScreen
          user={user}
          onBack={() => setScreen(messageRideContext ? "active" : "home")}
          rideContext={messageRideContext}
        />
      )}
      {screen === "reports" && <ReportsScreen onBack={() => setScreen("home")} />}
      {screen === "groups" && <GroupsScreen user={user} onBack={() => setScreen("home")} />}
      {screen === "changePassword" && <ChangePasswordScreen onBack={() => setScreen("home")} />}
    </SafeAreaView>
  );
}
