import React, { useEffect, useState } from "react";
import { SafeAreaView, StatusBar, View, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginScreen from "./src/screens/LoginScreen";
import VerifyCodeScreen from "./src/screens/VerifyCodeScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ActiveRideScreen from "./src/screens/ActiveRideScreen";
import RatingScreen from "./src/screens/RatingScreen";
import EarningsScreen from "./src/screens/EarningsScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import RideChatScreen from "./src/screens/RideChatScreen";
import GroupsScreen from "./src/screens/GroupsScreen";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import DeleteAccountScreen from "./src/screens/DeleteAccountScreen";
import NotificationSettingsScreen from "./src/screens/NotificationSettingsScreen";
import RidesScreen from "./src/screens/RidesScreen";
import { getSocket, resetSocket } from "./src/lib/socket";
import { logout as clearSession } from "./src/lib/api";
import { playSound } from "./src/lib/sound";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications, clearPushToken } from "./src/lib/pushNotifications";
import { requestWebNotificationPermission, notifyWeb, registerWebPush, unregisterWebPush } from "./src/lib/webNotify";
import { startTrackingLocation, stopTrackingLocation } from "./src/lib/locationTracker";
import { showAlert } from "./src/lib/alert";
import { api } from "./src/lib/api";

const TRACKED_STATUSES = ["EN_ROUTE", "STARTED"];

const EMPTY_UNREAD = { direct: { total: 0, byDriver: {} }, groups: { total: 0, byConversation: {} }, rides: { total: 0, byRide: {} }, total: 0 };

export default function App() {
  const [user, setUser] = useState(null);
  // Code de confirmation attendu par le serveur à la première connexion : { email, password,
  // message }. Aucune session n'est ouverte tant qu'il n'est pas saisi (voir VerifyCodeScreen).
  const [verification, setVerification] = useState(null);
  const [screen, setScreen] = useState("home");
  const [activeRideId, setActiveRideId] = useState(null);
  const [newReport, setNewReport] = useState(false);
  const [messageRideContext, setMessageRideContext] = useState(null);
  const [unread, setUnread] = useState(EMPTY_UNREAD);
  const [trackedRide, setTrackedRide] = useState(null); // { id, status } — course dont on diffuse la position

  // Compteurs de messages non lus (badges des menus) — rafraîchis à la connexion, à chaque message
  // reçu et après lecture d'un fil.
  const refreshUnread = () => api.unreadMessages().then(setUnread).catch(() => null);

  // Profil relu depuis le serveur (demande de suppression envoyée ou annulée...). Compte disparu
  // (suppression validée par Taxi Sylvain) : la session locale est fermée.
  const rafraichirProfil = async () => {
    try {
      const fresh = await api.me();
      await AsyncStorage.setItem("ts_user", JSON.stringify(fresh));
      setUser(fresh);
    } catch (e) {
      if (e.status === 401 || e.status === 404) {
        await clearSession();
        setUser(null);
      }
    }
  };

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem("ts_user");
      if (!raw) return;
      setUser(JSON.parse(raw));
      // Le compte existe-t-il encore ? S'il a été supprimé par Taxi Sylvain, on ferme la session
      // au lieu de laisser l'application échouer sur chaque écran.
      try {
        const fresh = await api.me();
        await AsyncStorage.setItem("ts_user", JSON.stringify(fresh));
        setUser(fresh);
      } catch (e) {
        if (e.status === 401 || e.status === 404) {
          await clearSession();
          setUser(null);
        }
      }
    })();
  }, []);

  // Course terminée sans passer par l'écran de notation (application fermée, coupure) : la
  // notation du client est proposée à l'ouverture suivante.
  const proposerNotation = async () => {
    try {
      const [aNoter] = await api.pendingRatings();
      if (!aNoter) return;
      showAlert(
        "Notez votre client",
        `${aNoter.pickupAddress} → ${aNoter.destAddress}${aNoter.autre?.name ? `, ${aNoter.autre.name}` : ""}. Voulez-vous noter cette course ?`,
        [
          { text: "Plus tard", style: "cancel" },
          { text: "Noter", onPress: () => { setActiveRideId(aNoter.rideId); setScreen("rating"); } },
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
      // Reçoit les diffusions de courses de dernière minute et les affectations directes
      s.on("ride:broadcast", () => playSound("alert"));
      s.on("ride:assigned", (ride) => { playSound("alert"); setActiveRideId(ride.id); setScreen("active"); });
      s.on("report:ready", () => { setNewReport(true); playSound("notify"); });
      // Rappel de course envoyé par le serveur : son immédiat, et alerte visible quand c'est
      // le rappel d'urgence d'une heure avant. Le son « alert » est volontairement le plus fort.
      s.on("ride:reminder", ({ texte, urgent }) => {
        playSound(urgent ? "alert" : "notify");
        if (urgent) {
          showAlert("Rappel urgent", texte);
          notifyWeb("Rappel urgent — Taxi Sylvain", texte);
        } else {
          notifyWeb("Course à venir", texte);
        }
      });
      // Son + badge + notification navigateur pour tout message reçu, quel que soit l'écran ouvert
      s.on("message:group", ({ message }) => {
        if (message.sender.id === user.id) return;
        playSound("notify"); notifyWeb(`${message.sender.name} (groupe)`, message.text); refreshUnread();
      });
      s.on("message:direct", (m) => {
        if (m.driverId !== user.id || m.sender.id === user.id) return;
        playSound("notify"); notifyWeb("Message de Taxi Sylvain", m.text); refreshUnread();
      });
      s.on("message:ride", (m) => {
        if (m.sender.id === user.id) return;
        playSound("notify"); notifyWeb(`Message de ${m.sender.name}`, m.text); refreshUnread();
      });
      // Décision de Taxi Sylvain sur une demande de suppression de compte (validée : le compte
      // n'existe plus, on ferme la session ; refusée : le compte reste actif, avec la raison).
      s.on("account:deletion-decided", ({ approved, raison }) => {
        if (approved) {
          showAlert("Compte supprimé", "Taxi Sylvain a validé la suppression de votre compte.", [{ text: "OK", onPress: () => logout({ server: false }) }]);
        } else {
          showAlert("Demande de suppression refusée", raison ? `Taxi Sylvain n'a pas accepté votre demande : ${raison}` : "Taxi Sylvain n'a pas accepté votre demande. Votre compte reste actif.");
          rafraichirProfil();
        }
      });
    });
    registerForPushNotifications();
    // Version web : abonnement aux notifications du serveur, si la permission a été accordée.
    requestWebNotificationPermission().then(registerWebPush).catch(() => null);
    refreshUnread();
    proposerNotation();
    return () => {
      sock?.off("ride:broadcast");
      sock?.off("ride:assigned");
      sock?.off("report:ready");
      sock?.off("ride:reminder");
      sock?.off("message:group");
      sock?.off("message:direct");
      sock?.off("message:ride");
      sock?.off("account:deletion-decided");
    };
  }, [user]);

  // Suivi GPS piloté ici (et non dans l'écran de course) pour qu'il continue quand le chauffeur
  // revient à l'accueil, ouvre la messagerie ou bascule dans Waze.
  useEffect(() => {
    if (trackedRide && TRACKED_STATUSES.includes(trackedRide.status)) {
      startTrackingLocation(trackedRide.id, trackedRide.status).then((granted) => {
        if (!granted) {
          showAlert(
            "Position désactivée",
            "Le Dispatch et le client ne peuvent pas vous suivre sans l'accès à votre position. Autorisez la localisation pour Taxi Sylvain."
          );
        }
      });
    } else {
      stopTrackingLocation();
    }
  }, [trackedRide?.id, trackedRide?.status]);

  // Après un rechargement de page ou une reconnexion, on reprend le suivi de la course en cours.
  useEffect(() => {
    if (!user) return;
    api.myRides()
      .then((rides) => {
        const active = rides.find((r) => r.driverId === user.id && TRACKED_STATUSES.includes(r.status));
        if (active) setTrackedRide({ id: active.id, status: active.status });
      })
      .catch(() => null);
  }, [user?.id]);

  // Permet de rouvrir directement la bonne course quand on tape sur une notification
  // reçue app fermée ou en arrière-plan.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if ((data?.type === "ride:assigned" || data?.type === "ride:broadcast" || data?.type === "ride:reminder" || data?.type === "ride:reminder:urgent") && data.rideId) {
        setActiveRideId(data.rideId);
        setScreen("active");
      } else if (data?.type === "message:direct") {
        setScreen("messages");
      } else if (data?.type === "message:group") {
        setScreen("groups");
      } else if (data?.type === "report:ready") {
        setNewReport(false);
        setScreen("reports");
      }
    });
    return () => sub.remove();
  }, []);

  // server: false après une suppression de compte : le compte n'existe plus, il n'y a rien à
  // retirer côté serveur (l'ancien appel faisait même planter le serveur).
  const logout = async ({ server = true } = {}) => {
    setTrackedRide(null);
    await stopTrackingLocation();
    resetSocket();
    if (server) {
      await clearPushToken();
      await unregisterWebPush();
    }
    await clearSession();
    setUser(null);
    setScreen("home");
    setActiveRideId(null);
  };

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1b2d" }}>
        <StatusBar barStyle="light-content" />
        {verification ? (
          <VerifyCodeScreen
            {...verification}
            onVerified={(u) => { setVerification(null); setUser(u); }}
            onBack={() => setVerification(null)}
          />
        ) : (
          <LoginScreen onLogin={setUser} onVerification={setVerification} />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1b2d" }}>
      <StatusBar barStyle="light-content" />
      {/* Demande de suppression en attente : rappel discret, avec accès à l'écran pour l'annuler. */}
      {user.deletionRequestedAt ? (
        <View style={{ backgroundColor: "#2a1f12", borderBottomWidth: 1, borderBottomColor: "#f5a623", paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: "#f5a623", fontSize: 12, lineHeight: 17 }}>
            Suppression de votre compte demandée le {new Date(user.deletionRequestedAt).toLocaleDateString("fr-CA")}. Taxi Sylvain la traitera sous 30 jours ; votre compte reste utilisable d'ici là.{" "}
            <Text style={{ textDecorationLine: "underline", fontWeight: "700" }} onPress={() => setScreen("deleteAccount")}>Voir ou annuler</Text>
          </Text>
        </View>
      ) : null}
      {screen === "home" && (
        <HomeScreen
          user={user}
          onOpenRide={(id) => { setActiveRideId(id); setScreen("active"); }}
          onOpenEarnings={() => setScreen("earnings")}
          onOpenMessages={() => { setMessageRideContext(null); setScreen("messages"); }}
          onOpenReports={() => { setNewReport(false); setScreen("reports"); }}
          onOpenGroups={() => setScreen("groups")}
          onOpenChangePassword={() => setScreen("changePassword")}
          onOpenDeleteAccount={() => setScreen("deleteAccount")}
          onOpenNotifications={() => setScreen("notifications")}
          onOpenRides={() => setScreen("rides")}
          onLogout={logout}
          hasNewReport={newReport}
          unread={unread}
        />
      )}
      {screen === "rides" && (
        <RidesScreen
          onOpenRide={(id) => { setActiveRideId(id); setScreen("active"); }}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "active" && activeRideId && (
        <ActiveRideScreen
          rideId={activeRideId}
          onCompleted={() => { setTrackedRide(null); setScreen("rating"); }}
          onCancelled={() => { setTrackedRide(null); setActiveRideId(null); setScreen("home"); }}
          onOpenChat={() => setScreen("rideChat")}
          onOpenMessages={(ride) => { setMessageRideContext(ride || null); setScreen("messages"); }}
          onBack={() => setScreen("home")}
          unreadRide={unread.rides.byRide[activeRideId] || 0}
          onRideState={setTrackedRide}
        />
      )}
      {screen === "rating" && activeRideId && (
        <RatingScreen rideId={activeRideId} onDone={() => { setActiveRideId(null); setScreen("home"); }} />
      )}
      {screen === "rideChat" && activeRideId && (
        <RideChatScreen rideId={activeRideId} onBack={() => setScreen("active")} onRead={refreshUnread} />
      )}
      {screen === "earnings" && <EarningsScreen onBack={() => setScreen("home")} />}
      {screen === "messages" && (
        <MessagesScreen
          user={user}
          onBack={() => setScreen(messageRideContext ? "active" : "home")}
          rideContext={messageRideContext}
          onRead={refreshUnread}
        />
      )}
      {screen === "reports" && <ReportsScreen onBack={() => setScreen("home")} />}
      {screen === "groups" && <GroupsScreen user={user} onBack={() => setScreen("home")} unread={unread.groups.byConversation} onRead={refreshUnread} />}
      {screen === "changePassword" && <ChangePasswordScreen onBack={() => setScreen("home")} />}
      {/* Depuis le 20 septembre 2026 : une demande, validée par Taxi Sylvain. Le profil est relu pour
          afficher (ou retirer) le rappel de demande en attente. */}
      {screen === "deleteAccount" && (
        <DeleteAccountScreen
          user={user}
          onBack={() => setScreen("home")}
          onRequested={async () => { await rafraichirProfil(); setScreen("home"); }}
          onCancelled={async () => { await rafraichirProfil(); setScreen("home"); }}
        />
      )}
      {screen === "notifications" && (
        <NotificationSettingsScreen
          user={user}
          onSaved={(u) => setUser(u)}
          onBack={() => setScreen("home")}
        />
      )}
    </SafeAreaView>
  );
}
