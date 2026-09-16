import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, Linking, StyleSheet } from "react-native";
import { api, assetUrl } from "../lib/api";
import { playSound } from "../lib/sound";
import { getSocket } from "../lib/socket";
import DriverMap from "../components/DriverMap";

const STATUS_LABEL = {
  REQUESTED: "En attente de validation par Taxi Sylvain",
  BROADCAST: "Recherche d'un chauffeur…",
  ACCEPTED: "Course confirmée — chauffeur attribué",
  EN_ROUTE: "Votre chauffeur est en route",
  STARTED: "Course en cours vers votre destination",
  COMPLETED: "Course terminée",
  CANCELLED: "Course annulée",
  REFUSED: "Course refusée",
};
const TAXI_SYLVAIN_PHONE = "+14384991120";
const LIVE_STATUSES = ["EN_ROUTE", "STARTED"];

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

export default function TrackingScreen({ rideId, onOpenChat, onBack }) {
  const [ride, setRide] = useState(null);
  const [driverPos, setDriverPos] = useState(null);

  useEffect(() => {
    const load = async () => {
      const rides = await api.myRides();
      setRide(rides.find((r) => r.id === rideId));
    };
    load();
    const interval = setInterval(load, 4000); // repli simple si le socket n'est pas branché
    return () => clearInterval(interval);
  }, [rideId]);

  // Position GPS du chauffeur en direct pendant qu'il est en route ou en course
  // (le room ride:{id} est déjà rejoint côté App.js via ride:watch).
  useEffect(() => {
    // Dernière position connue tout de suite, puis mises à jour en direct ; un rappel toutes les
    // 5 s sert de filet de sécurité si la connexion temps réel décroche.
    const fetchPos = () => api.driverLocation(rideId).then((p) => { if (p) setDriverPos({ lat: p.lat, lng: p.lng }); }).catch(() => null);
    fetchPos();
    const interval = setInterval(fetchPos, 5000);
    let sock;
    getSocket().then((s) => {
      sock = s;
      s.emit("ride:watch", rideId);
      s.on("driver:location", (p) => {
        if (p.rideId === rideId) setDriverPos({ lat: p.lat, lng: p.lng });
      });
    });
    return () => { clearInterval(interval); sock?.off("driver:location"); };
  }, [rideId]);

  const callTaxiSylvain = () => {
    playSound("action");
    Linking.openURL(`tel:${TAXI_SYLVAIN_PHONE}`);
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.headerRow}>
        {onBack && <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Retour</Text></TouchableOpacity>}
        <Text style={styles.title}>{ride ? STATUS_LABEL[ride.status] : "Chargement…"}</Text>
      </View>
      {(!ride || LIVE_STATUSES.includes(ride.status) || driverPos) && (
        <View style={styles.mapPlaceholder}>
          {driverPos ? (
            <DriverMap lat={driverPos.lat} lng={driverPos.lng} />
          ) : (
            <Text style={{ color: "#8b99b5" }}>En attente de la position du chauffeur…</Text>
          )}
        </View>
      )}
      {ride && (
        <View style={styles.card}>
          <Field label="Date de la course" value={fmtDate(ride.scheduledFor || ride.createdAt)} />
          <Field label="Heure de la course" value={fmtTime(ride.scheduledFor || ride.createdAt)} />
          <Field label="Adresse de départ" value={ride.pickupAddress} />
          <Field label="Destination" value={ride.destAddress} />
          <Field label="Distance" value={ride.distanceKm != null ? `${ride.distanceKm.toFixed(1)} km` : null} />
          <Field label="Numéro de vol" value={ride.flightNumber} />
          <Field label="Montant prévu de la course" value={ride.fare > 0 ? `${ride.fare} $` : "À confirmer par Taxi Sylvain"} />
        </View>
      )}
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
              <Text style={styles.callBtnText}>Message au chauffeur</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <TouchableOpacity style={[styles.callBtn, { marginTop: 4 }]} onPress={callTaxiSylvain}>
        <Text style={styles.callBtnText}>Appeler Taxi Sylvain — (438) 499-1120</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  link: { color: "#f5a623" },
  title: { color: "#edeff3", fontSize: 20, fontWeight: "700" },
  mapPlaceholder: { height: 180, backgroundColor: "#1d2c46", borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 14, overflow: "hidden" },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  fieldLabel: { color: "#8b99b5", fontSize: 12 },
  fieldValue: { color: "#edeff3", fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  card: { backgroundColor: "#16233a", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#28395a", marginBottom: 14 },
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
