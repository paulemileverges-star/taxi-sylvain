import React, { useEffect, useState } from "react";
import { SafeAreaView, StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginScreen from "./src/screens/LoginScreen";
import BookScreen from "./src/screens/BookScreen";
import TrackingScreen from "./src/screens/TrackingScreen";
import RateScreen from "./src/screens/RateScreen";
import ChatScreen from "./src/screens/ChatScreen";
import { getSocket } from "./src/lib/socket";
import { playSound } from "./src/lib/sound";

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
        <BookScreen onBooked={(rideId) => { setActiveRideId(rideId); setScreen("tracking"); }} />
      )}
      {screen === "tracking" && activeRideId && (
        <TrackingScreen rideId={activeRideId} onOpenChat={() => setScreen("chat")} />
      )}
      {screen === "chat" && activeRideId && (
        <ChatScreen rideId={activeRideId} onBack={() => setScreen("tracking")} />
      )}
      {screen === "rate" && activeRideId && (
        <RateScreen rideId={activeRideId} onDone={() => { setActiveRideId(null); setScreen("book"); }} />
      )}
    </SafeAreaView>
  );
}
