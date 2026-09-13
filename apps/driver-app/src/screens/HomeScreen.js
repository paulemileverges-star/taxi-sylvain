import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";
import { getSocket } from "../lib/socket";
import SwipeButton from "../components/SwipeButton";

const STATUS_LABEL = {
  REQUESTED: "Course proposée", BROADCAST: "Course diffusée — premier arrivé, premier servi", ACCEPTED: "Acceptée",
  EN_ROUTE: "En route vers le client", STARTED: "En route vers la destination",
  COMPLETED: "Terminée", CANCELLED: "Annulée", REFUSED: "Refusée",
};

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("fr-CA") : "—";
}
function fmtTime(d) {
  return d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label} :</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function HomeScreen({ user, onOpenRide, onOpenEarnings, onOpenMessages, onOpenReports, onOpenGroups, onOpenChangePassword, onOpenNotifications, onOpenRides, onLogout, hasNewReport }) {
  const [rides, setRides] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [rideData, scheduleData] = await Promise.all([api.myRides(), api.mySchedule()]);
      setRides(rideData);
      setSchedule(scheduleData);
    } catch (e) {
      showAlert("Erreur", e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Rafraîchit la liste dès qu'une course est diffusée, prise par un autre chauffeur, affectée
  // ou change de statut — sans ça il fallait tirer pour rafraîchir après la sonnerie.
  useEffect(() => {
    let sock;
    const refresh = () => load();
    getSocket().then((s) => {
      sock = s;
      s.on("ride:broadcast", refresh);
      s.on("ride:taken", refresh);
      s.on("ride:assigned", refresh);
      s.on("ride:status", refresh);
    });
    return () => {
      sock?.off("ride:broadcast", refresh);
      sock?.off("ride:taken", refresh);
      sock?.off("ride:assigned", refresh);
      sock?.off("ride:status", refresh);
    };
  }, [load]);

  const accept = async (id) => {
    try {
      await api.acceptRide(id);
      playSound("action");
      onOpenRide(id);
    } catch (e) {
      showAlert("Course déjà prise", e.message);
      load();
    }
  };

  const refuse = async (id) => {
    await api.refuseRide(id);
    playSound("action");
    load();
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bonjour {user?.name || ""}</Text>
        <TouchableOpacity onPress={onLogout}><Text style={styles.logoutLink}>Se déconnecter</Text></TouchableOpacity>
      </View>
      <View style={[styles.headerRow, { marginBottom: 16 }]}>
        <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
          <TouchableOpacity onPress={onOpenRides}><Text style={styles.link}>Courses</Text></TouchableOpacity>
          <TouchableOpacity onPress={onOpenMessages}><Text style={styles.link}>Messagerie</Text></TouchableOpacity>
          <TouchableOpacity onPress={onOpenGroups}><Text style={styles.link}>Groupes</Text></TouchableOpacity>
          <TouchableOpacity onPress={onOpenChangePassword}><Text style={styles.link}>Mot de passe</Text></TouchableOpacity>
          <TouchableOpacity onPress={onOpenNotifications}><Text style={styles.link}>Notifications</Text></TouchableOpacity>
          <TouchableOpacity onPress={onOpenReports}>
            <Text style={styles.link}>Mes rapports{hasNewReport ? " 🔴" : ""}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenEarnings}><Text style={styles.link}>Mes revenus</Text></TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={rides}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#f5a623" />}
        ListHeaderComponent={schedule.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.sectionLabel}>Ma cédule — cette semaine</Text>
            {schedule.map((entry) => (
              <View key={entry.id} style={styles.scheduleCard}>
                <Text style={styles.scheduleTime}>
                  {new Date(entry.startsAt).toLocaleDateString("fr-CA", { weekday: "short" })}{" "}
                  {new Date(entry.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Text style={styles.addr}>{entry.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        renderItem={({ item }) => {
          const isOffer = item.status === "BROADCAST" || item.status === "REQUESTED";
          return (
            <View style={[styles.card, isOffer && styles.offerCard]}>
              {isOffer && (
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => refuse(item.id)}
                  accessibilityLabel="Refuser cette course"
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              )}
              <Field label="Date de la course" value={fmtDate(item.scheduledFor || item.createdAt)} />
              <Field label="Heure de la course" value={fmtTime(item.scheduledFor || item.createdAt)} />
              <Field label="Nom du client" value={item.client?.name} />
              <Field label="Adresse de départ" value={item.pickupAddress} />
              <Field label="Destination" value={item.destAddress} />
              <Field label="Distance" value={item.distanceKm != null ? `${item.distanceKm.toFixed(1)} km` : null} />
              <Field label="Numéro de vol" value={item.flightNumber} />
              <Field label="Montant prévu" value={item.fare > 0 ? `${item.fare} $` : "À confirmer"} />
              <View style={styles.rowBetween}>
                <Text style={styles.status}>{STATUS_LABEL[item.status] || item.status}</Text>
              </View>
              {isOffer && (
                <View style={{ marginTop: 8 }}>
                  <SwipeButton label="Accepter la course" onConfirm={() => accept(item.id)} color="#3fa796" textColor="#06231d" />
                </View>
              )}
              {["ACCEPTED", "EN_ROUTE", "STARTED"].includes(item.status) && (
                <TouchableOpacity style={styles.smallBtn} onPress={() => onOpenRide(item.id)}>
                  <Text style={styles.smallBtnText}>Ouvrir la course</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={{ color: "#8b99b5" }}>Aucune course pour le moment.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: "#edeff3", fontSize: 24, fontWeight: "700" },
  link: { color: "#f5a623" },
  logoutLink: { color: "#e85d4c", fontWeight: "600" },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  fieldLabel: { color: "#8b99b5", fontSize: 12 },
  fieldValue: { color: "#edeff3", fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  card: { backgroundColor: "#16233a", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  offerCard: { borderColor: "#f5a623", position: "relative", paddingTop: 18 },
  closeBtn: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(232,93,76,0.15)", borderWidth: 1, borderColor: "#e85d4c", alignItems: "center", justifyContent: "center", zIndex: 1 },
  closeBtnText: { color: "#e85d4c", fontWeight: "700", fontSize: 13, lineHeight: 15 },
  sectionLabel: { color: "#8b99b5", fontSize: 12, textTransform: "uppercase", marginBottom: 8 },
  scheduleCard: { backgroundColor: "#16233a", borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#28395a" },
  scheduleTime: { color: "#f5a623", fontSize: 12, fontWeight: "700", marginBottom: 4 },
  addr: { color: "#edeff3", marginBottom: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  fare: { color: "#f5a623", fontWeight: "700" },
  status: { color: "#8b99b5", fontSize: 12 },
  smallBtn: { backgroundColor: "#f5a623", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, flex: 1, marginRight: 6, alignItems: "center" },
  smallBtnText: { color: "#1a1200", fontWeight: "700" },
});
