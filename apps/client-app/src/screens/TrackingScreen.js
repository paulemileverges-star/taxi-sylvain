import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, Linking, Alert, StyleSheet } from "react-native";
import { api, assetUrl } from "../lib/api";
import { playSound } from "../lib/sound";

const STATUS_LABEL = {
  REQUESTED: "Recherche d'un chauffeur…",
  BROADCAST: "Recherche d'un chauffeur…",
  ACCEPTED: "Un chauffeur a accepté votre course",
  EN_ROUTE: "Votre chauffeur est en route",
  STARTED: "Course en cours vers votre destination",
  COMPLETED: "Course terminée",
};

export default function TrackingScreen({ rideId, onOpenChat }) {
  const [ride, setRide] = useState(null);

  useEffect(() => {
    const load = async () => {
      const rides = await api.myRides();
      setRide(rides.find((r) => r.id === rideId));
    };
    load();
    const interval = setInterval(load, 4000); // repli simple si le socket n'est pas branché
    return () => clearInterval(interval);
  }, [rideId]);

  const callMasked = async () => {
    try {
      const { proxyNumber } = await api.callMasked(rideId);
      playSound("action");
      Linking.openURL(`tel:${proxyNumber}`);
    } catch (e) {
      Alert.alert("Appel indisponible", e.message);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={styles.title}>{ride ? STATUS_LABEL[ride.status] : "Chargement…"}</Text>
      <View style={styles.mapPlaceholder}><Text style={{ color: "#8b99b5" }}>Suivi en temps réel</Text></View>
      {ride?.driver && (
        <View style={styles.card}>
          <View style={styles.driverRow}>
            <View style={styles.avatar}>
              {ride.driver.photoUrl ? (
                <Image source={{ uri: assetUrl(ride.driver.photoUrl) }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitial}>{ride.driver.name?.[0]}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{ride.driver.name}</Text>
              <Text style={styles.driverInfo}>{ride.driver.carModel} · {ride.driver.plate}</Text>
              <Text style={styles.driverInfo}>★ {ride.driver.ratingAvg?.toFixed(1) ?? "5.0"}</Text>
            </View>
          </View>
          {ride.driver.carPhotoUrl && (
            <Image source={{ uri: assetUrl(ride.driver.carPhotoUrl) }} style={styles.carPhoto} />
          )}
          <View style={styles.rowBetween}>
            <TouchableOpacity style={styles.callBtn} onPress={() => onOpenChat(rideId)}>
              <Text style={styles.callBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={callMasked}>
              <Text style={styles.callBtnText}>Appeler (masqué)</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#edeff3", fontSize: 20, fontWeight: "700", marginBottom: 12 },
  mapPlaceholder: { height: 180, backgroundColor: "#1d2c46", borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  card: { backgroundColor: "#16233a", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#28395a" },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#1d2c46", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { color: "#edeff3", fontSize: 20, fontWeight: "700" },
  driverName: { color: "#edeff3", fontSize: 16, fontWeight: "700" },
  driverInfo: { color: "#8b99b5", marginTop: 4 },
  carPhoto: { width: "100%", height: 140, borderRadius: 10, marginTop: 12 },
  rowBetween: { flexDirection: "row", gap: 8, marginTop: 12 },
  callBtn: { flex: 1, borderWidth: 1, borderColor: "#28395a", borderRadius: 10, padding: 10, alignItems: "center" },
  callBtnText: { color: "#edeff3" },
});
