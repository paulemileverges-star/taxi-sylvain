import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";
import SwipeButton from "../components/SwipeButton";
import { withDayHeaders } from "../lib/rideDays";

const STATUS_LABEL = {
  REQUESTED: "Demandée", BROADCAST: "Diffusée", ACCEPTED: "Acceptée",
  EN_ROUTE: "En route vers le client", STARTED: "En route vers la destination",
  COMPLETED: "Terminée", CANCELLED: "Annulée", REFUSED: "Refusée",
};

// La date complète n'est plus répétée sur chaque carte : elle est devenue le titre de la journée.
function fmtTime(d) {
  return d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function RidesScreen({ onOpenRide, onBack }) {
  const [tab, setTab] = useState("upcoming");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rides: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.myRidesPaged(tab, page);
      setData(result);
    } catch (e) {
      showAlert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab, page]);

  const changeTab = (next) => { setTab(next); setPage(1); };

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

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: "#8b99b5", marginBottom: 12 }}>← Retour</Text></TouchableOpacity>
      <Text style={styles.title}>Courses</Text>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "upcoming" && styles.tabActive]} onPress={() => changeTab("upcoming")}>
          <Text style={[styles.tabText, tab === "upcoming" && styles.tabTextActive]}>Courses à venir</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "past" && styles.tabActive]} onPress={() => changeTab("past")}>
          <Text style={[styles.tabText, tab === "past" && styles.tabTextActive]}>Courses passées</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#f5a623" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={withDayHeaders(data.rides)}
          keyExtractor={(row) => row.id}
          ListEmptyComponent={<Text style={{ color: "#8b99b5", marginTop: 12 }}>Aucune course ici.</Text>}
          renderItem={({ item }) => {
            // Titre de journée, calculé par le serveur à l'heure du Québec.
            if (item.type === "day") return <Text style={styles.dayHeader}>{item.label}</Text>;
            const ride = item.ride;
            const isOffer = ride.status === "BROADCAST" || ride.status === "REQUESTED";
            return (
              <View style={[styles.card, isOffer && styles.offerCard]}>
                {isOffer && (
                  <TouchableOpacity style={styles.closeBtn} onPress={() => refuse(ride.id)} accessibilityLabel="Refuser cette course">
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.rowBetween}>
                  <Text style={styles.date}>{fmtTime(ride.scheduledFor || ride.createdAt)}</Text>
                  <Text style={styles.status}>{STATUS_LABEL[ride.status] || ride.status}</Text>
                </View>
                <Text style={styles.addr}>{ride.pickupAddress} → {ride.destAddress}</Text>
                <Text style={styles.fare}>
                  {ride.fare > 0 ? `${ride.fare} $` : "Montant à confirmer"}{ride.distanceKm != null ? `  ·  ${ride.distanceKm.toFixed(1)} km` : ""}
                </Text>
                {isOffer && (
                  <View style={{ marginTop: 8 }}>
                    <SwipeButton label="Accepter la course" onConfirm={() => accept(ride.id)} color="#3fa796" textColor="#06231d" />
                  </View>
                )}
                {["ACCEPTED", "EN_ROUTE", "STARTED"].includes(ride.status) && (
                  <TouchableOpacity style={styles.smallBtn} onPress={() => onOpenRide(ride.id)}>
                    <Text style={styles.smallBtnText}>Ouvrir la course</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListFooterComponent={
            data.total > data.pageSize ? (
              <View style={styles.pager}>
                <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
                  <Text style={[styles.pagerLink, page <= 1 && styles.pagerLinkDisabled]}>← Précédent</Text>
                </TouchableOpacity>
                <Text style={styles.pagerLabel}>Page {page} / {totalPages}</Text>
                <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
                  <Text style={[styles.pagerLink, page >= totalPages && styles.pagerLinkDisabled]}>Suivant →</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "#28395a" },
  tabActive: { backgroundColor: "#f5a623", borderColor: "#f5a623" },
  tabText: { color: "#8b99b5", fontWeight: "600" },
  tabTextActive: { color: "#1a1200" },
  card: { backgroundColor: "#16233a", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  offerCard: { borderColor: "#f5a623", position: "relative", paddingTop: 18 },
  closeBtn: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(232,93,76,0.15)", borderWidth: 1, borderColor: "#e85d4c", alignItems: "center", justifyContent: "center", zIndex: 1 },
  closeBtnText: { color: "#e85d4c", fontWeight: "700", fontSize: 13, lineHeight: 15 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  date: { color: "#8b99b5", fontSize: 12 },
  dayHeader: { color: "#f5a623", fontWeight: "700", fontSize: 13, marginTop: 10, marginBottom: 6 },
  status: { color: "#f5a623", fontSize: 12, fontWeight: "600" },
  addr: { color: "#edeff3", marginTop: 6 },
  fare: { color: "#f5a623", fontWeight: "700", marginTop: 4 },
  smallBtn: { backgroundColor: "#f5a623", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, flex: 1, marginRight: 6, alignItems: "center", marginTop: 8 },
  smallBtnText: { color: "#1a1200", fontWeight: "700" },
  pager: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  pagerLink: { color: "#f5a623", fontWeight: "600" },
  pagerLinkDisabled: { color: "#28395a" },
  pagerLabel: { color: "#8b99b5", fontSize: 12 },
});
