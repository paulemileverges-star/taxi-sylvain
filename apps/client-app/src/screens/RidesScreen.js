import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { api } from "../lib/api";
import { showAlert } from "../lib/alert";
import { DriverAvatar, CarPhoto } from "../components/DriverPhotos";

const STATUS_LABEL = {
  REQUESTED: "En attente de validation", BROADCAST: "Recherche d'un chauffeur", ACCEPTED: "Confirmée",
  EN_ROUTE: "Chauffeur en route", STARTED: "En cours",
  COMPLETED: "Terminée", CANCELLED: "Annulée", REFUSED: "Refusée",
};

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("fr-CA") : "—";
}
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
          data={data.rides}
          keyExtractor={(r) => r.id}
          ListEmptyComponent={<Text style={{ color: "#8b99b5", marginTop: 12 }}>Aucune course ici.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onOpenRide(item.id)}>
              <View style={styles.rowBetween}>
                <Text style={styles.date}>{fmtDate(item.scheduledFor || item.createdAt)} · {fmtTime(item.scheduledFor || item.createdAt)}</Text>
                <Text style={styles.status}>{STATUS_LABEL[item.status] || item.status}</Text>
              </View>
              <Text style={styles.addr}>{item.pickupAddress} → {item.destAddress}</Text>
              {item.driver?.name && (
                <View style={styles.driverRow}>
                  <DriverAvatar driver={item.driver} size={32} />
                  <CarPhoto driver={item.driver} height={32} style={{ width: 48 }} />
                  <Text style={styles.driver}>{item.driver.name}{item.driver.carModel ? ` · ${item.driver.carModel}` : ""}{item.driver.plate ? ` · ${item.driver.plate}` : ""}</Text>
                </View>
              )}
              <Text style={styles.fare}>
                {item.fare > 0 ? `${item.fare} $` : "Montant à confirmer"}{item.distanceKm != null ? `  ·  ${item.distanceKm.toFixed(1)} km` : ""}
              </Text>
            </TouchableOpacity>
          )}
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
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { color: "#8b99b5", fontSize: 12 },
  status: { color: "#f5a623", fontSize: 12, fontWeight: "600" },
  addr: { color: "#edeff3", marginTop: 6 },
  driver: { color: "#8b99b5", fontSize: 12, flexShrink: 1 },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1d2c46", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { color: "#edeff3", fontWeight: "700" },
  carThumb: { width: 44, height: 32, borderRadius: 6 },
  fare: { color: "#f5a623", fontWeight: "700", marginTop: 4 },
  pager: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  pagerLink: { color: "#f5a623", fontWeight: "600" },
  pagerLinkDisabled: { color: "#28395a" },
  pagerLabel: { color: "#8b99b5", fontSize: 12 },
});
