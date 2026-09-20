import React, { useEffect, useState } from "react";
import { SafeAreaView, StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import VerifyCodeScreen from "./src/screens/VerifyCodeScreen";
import BookScreen from "./src/screens/BookScreen";
import TrackingScreen from "./src/screens/TrackingScreen";
import RateScreen from "./src/screens/RateScreen";
import ChatScreen from "./src/screens/ChatScreen";
import GroupsScreen from "./src/screens/GroupsScreen";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import DeleteAccountScreen from "./src/screens/DeleteAccountScreen";
import NotificationSettingsScreen from "./src/screens/NotificationSettingsScreen";
import RidesScreen from "./src/screens/RidesScreen";
import { getSocket, resetSocket, watchRide, unwatchRide } from "./src/lib/socket";
import { api, logout as clearSession } from "./src/lib/api";
import { playSound } from "./src/lib/sound";
import { showAlert } from "./src/lib/alert";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications, clearPushToken } from "./src/lib/pushNotifications";
import { requestWebNotificationPermission, notifyWeb, registerWebPush, unregisterWebPush } from "./src/lib/webNotify";

const EMPTY_UNREAD = { direct: { total: 0, byDriver: {} }, groups: { total: 0, byConversation: {} }, rides: { total: 0, byRide: {} }, total: 0 };

export default function App() {
  const [user, setUser] = useState(null);
  // Écran d'ouverture de compte, atteint depuis la connexion (le site public y envoie des clients).
  const [inscription, setInscription] = useState(false);
  // Code de confirmation attendu par le serveur : { email, password, message }. Aucune session
  // n'est ouverte tant qu'il n'est pas saisi (voir VerifyCodeScreen).
  const [verification, setVerification] = useState(null);
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

  // Suivi de la course active : position du chauffeur, messages, étapes. L'abonnement survit aux
  // coupures réseau (voir lib/socket.js). Le son et la notification viennent de l'évènement
  // personnel « ride:client-update » ci-dessous, reçu quel que soit l'écran ouvert.
  useEffect(() => {
    if (!activeRideId) return undefined;
    let sock;
    watchRide(activeRideId);
    getSocket().then((s) => {
      sock = s;
      s.on("ride:status", (ride) => {
        if (ride?.id === activeRideId && ride.status === "COMPLETED") setScreen("rate");
      });
    });
    return () => { sock?.off("ride:status"); unwatchRide(activeRideId); };
  }, [activeRideId]);

  // Course terminée pendant que l'application était fermée : la notation est proposée à l'ouverture.
  const proposerNotation = async () => {
    try {
      const [aNoter] = await api.pendingRatings();
      if (!aNoter) return;
      showAlert(
        "Notez votre course",
        `${aNoter.pickupAddress} → ${aNoter.destAddress}${aNoter.autre?.name ? `, avec ${aNoter.autre.name}` : ""}. Voulez-vous noter votre chauffeur ?`,
        [
          { text: "Plus tard", style: "cancel" },
          { text: "Noter", onPress: () => { setActiveRideId(aNoter.rideId); setScreen("rate"); } },
        ]
      );
    } catch {
      // Hors ligne : on réessaiera à la prochaine ouverture.
    }
  };

  useEffect(() => {
    if (!user) return undefined;
    let sock;
    getSocket().then((s) => {
      sock = s;
      // Son + badge + notification navigateur pour tout message reçu, quel que soit l'écran ouvert
      s.on("message:group", ({ message }) => {
        if (message.sender.id === user.id) return;
        playSound("notify"); notifyWeb(`${message.sender.name} (groupe)`, message.text); refreshUnread();
      });
      // Rappel de course envoyé par le serveur : son et notification du navigateur.
      s.on("ride:reminder", ({ texte }) => {
        playSound("notify");
        notifyWeb("Course à venir — Taxi Sylvain", texte);
      });
      s.on("message:ride", (m) => {
        if (m.sender.id === user.id) return;
        playSound("notify"); notifyWeb(`Message de ${m.sender.name}`, m.text); refreshUnread();
      });
      // Toute nouvelle sur une de mes courses (chauffeur confirmé, en route, terminée, montant
      // fixé) : son et notification même depuis l'accueil ; la fin de course ouvre la notation.
      s.on("ride:client-update", ({ rideId, status, title, body }) => {
        playSound(status === "COMPLETED" ? "action" : "notify");
        notifyWeb(title || "Taxi Sylvain", body || "");
        if (status === "COMPLETED" && rideId) { setActiveRideId(rideId); setScreen("rate"); }
      });
    });
    registerForPushNotifications();
    // Version web : abonnement aux notifications du serveur, si la permission a été accordée.
    requestWebNotificationPermission().then(registerWebPush).catch(() => null);
    refreshUnread();
    proposerNotation();
    return () => {
      sock?.off("message:group");
      sock?.off("ride:reminder");
      sock?.off("message:ride");
      sock?.off("ride:client-update");
    };
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
    if (server) {
      await clearPushToken();
      await unregisterWebPush();
    }
    await clearSession();
    setUser(null);
    setScreen("book");
    setActiveRideId(null);
  };

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1b2d" }}>
        <StatusBar barStyle="light-content" />
        {verification ? (
          <VerifyCodeScreen
            {...verification}
            onVerified={(u) => { setVerification(null); setInscription(false); setUser(u); }}
            onBack={() => setVerification(null)}
          />
        ) : inscription ? (
          <RegisterScreen onRegistered={setUser} onVerification={setVerification} onBack={() => setInscription(false)} />
        ) : (
          <LoginScreen onLogin={setUser} onVerification={setVerification} onCreerCompte={() => setInscription(true)} />
        )}
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
