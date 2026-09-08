import React, { useEffect, useState } from "react";
import { SafeAreaView, StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ActiveRideScreen from "./src/screens/ActiveRideScreen";
import EarningsScreen from "./src/screens/EarningsScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import RideChatScreen from "./src/screens/RideChatScreen";
import GroupsScreen from "./src/screens/GroupsScreen";
import { getSocket, resetSocket } from "./src/lib/socket";
import { logout as clearSession } from "./src/lib/api";
import { playSound } from "./src/lib/sound";

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("home");
  const [activeRideId, setActiveRideId] = useState(null);
  const [newReport, setNewReport] = useState(false);

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
    return () => {
      sock?.off("ride:broadcast");
      sock?.off("ride:assigned");
      sock?.off("report:ready");
      sock?.off("message:group");
    };
  }, [user]);

  const logout = async () => {
    resetSocket();
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
          onOpenMessages={() => setScreen("messages")}
          onOpenReports={() => { setNewReport(false); setScreen("reports"); }}
          onOpenGroups={() => setScreen("groups")}
          onLogout={logout}
          hasNewReport={newReport}
        />
      )}
      {screen === "active" && activeRideId && (
        <ActiveRideScreen
          rideId={activeRideId}
          onDone={() => { setActiveRideId(null); setScreen("home"); }}
          onOpenChat={() => setScreen("rideChat")}
          onOpenMessages={() => setScreen("messages")}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "rideChat" && activeRideId && (
        <RideChatScreen rideId={activeRideId} onBack={() => setScreen("active")} />
      )}
      {screen === "earnings" && <EarningsScreen onBack={() => setScreen("home")} />}
      {screen === "messages" && <MessagesScreen user={user} onBack={() => setScreen("home")} />}
      {screen === "reports" && <ReportsScreen onBack={() => setScreen("home")} />}
      {screen === "groups" && <GroupsScreen user={user} onBack={() => setScreen("home")} />}
    </SafeAreaView>
  );
}
