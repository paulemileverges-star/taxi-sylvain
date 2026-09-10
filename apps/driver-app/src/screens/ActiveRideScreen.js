import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";
import { startTrackingLocation, stopTrackingLocation } from "../lib/locationTracker";
import { showAlert } from "../lib/alert";
import { openWaze as openWazeTo, openGoogleMaps as openGoogleMapsTo } from "../lib/navigation";

const NEXT_STATUS = { ACCEPTED: "EN_ROUTE", EN_ROUTE: "STARTED", STARTED: "COMPLETED" };
const LABEL = { ACCEPTED: "En route pour la course", EN_ROUTE: "Démarrer la course", STARTED: "Terminer la course" };
const TRACKED_STATUSES = ["EN_ROUTE", "STARTED"];

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

export default function ActiveRideScreen({ rideId, onCompleted, onCancelled, onOpenChat, onOpenMessages, onBack }) {
  const [ride, setRide] = useState(null);

  const load = async () => {
    const rides = await api.myRides();
    setRide(rides.find((r) => r.id === rideId));
  };

  useEffect(() => { load(); }, [rideId]);

  // Diffuse la position GPS tant que la course est en route vers le client ou vers la
  // destination ; s'arrête automatiquement en dehors de ces statuts ou en quittant l'écran.
  useEffect(() => {
    if (ride && TRACKED_STATUSES.includes(ride.status)) {
      startTrackingLocation(rideId, ride.status).then((granted) => {
        if (!granted) {
          showAlert(
            "Position désactivée",
            "Le Dispatch et le client ne peuvent pas suivre votre déplacement sans l'accès à votre position. Activez la localisation pour Taxi Sylvain dans les réglages de votre téléphone."
          );
        }
      });
    } else {
      stopTrackingLocation();
    }
    return () => stopTrackingLocation();
  }, [ride?.status, rideId]);

  const advance = async () => {
    if (!ride) return;
    const next = NEXT_STATUS[ride.status];
    if (!next) return;
    const updated = await api.setRideStatus(ride.id, next);
    setRide(updated);
    playSound("action");
    if (next === "COMPLETED") onCompleted();
  };

  // Avant la prise en charge (ACCEPTED/EN_ROUTE) on navigue vers le client ; une fois la
  // course démarrée (STARTED), on navigue vers la destination finale.
  const navTarget = () =>
    ride.status === "STARTED"
      ? { address: ride.destAddress, lat: ride.destLat, lng: ride.destLng }
      : { address: ride.pickupAddress, lat: ride.pickupLat, lng: ride.pickupLng };

  const openWaze = async () => {
    if (!ride) return;
    const ok = await openWazeTo(navTarget());
    if (!ok) showAlert("Waze indisponible", "Impossible d'ouvrir Waze. Vérifiez qu'il est installé, ou utilisez Google Maps.");
  };
  const openGoogleMaps = async () => {
    if (!ride) return;
    const ok = await openGoogleMapsTo(navTarget());
    if (!ok) showAlert("Google Maps indisponible", "Impossible d'ouvrir Google Maps. Vérifiez qu'il est installé, ou utilisez Waze.");
  };

  const cancelRide = async () => {
    if (!ride) return;
    showAlert(
      "Annuler la course",
      "Confirmez-vous l'annulation ? La course redeviendra disponible pour être réaffectée par Taxi Sylvain.",
      [
        { text: "Non", style: "cancel" },
        {
          text: "Oui, annuler",
          style: "destructive",
          onPress: async () => {
            await api.cancelRide(ride.id);
            playSound("action");
            onCancelled();
          },
        },
      ]
    );
  };

  const callMasked = async () => {
    try {
      const { proxyNumber } = await api.callMasked(ride.id);
      playSound("action");
      Linking.openURL(`tel:${proxyNumber}`);
    } catch (e) {
      showAlert("Appel indisponible", e.message);
    }
  };

  if (!ride) return <View style={{ flex: 1, padding: 16 }}><Text style={{ color: "#8b99b5" }}>Chargement…</Text></View>;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={styles.headerRow}>
        {onBack && <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Retour</Text></TouchableOpacity>}
        <Text style={styles.title}>Course en cours</Text>
      </View>
      <View style={styles.card}>
        <Field label="Date de la course" value={fmtDate(ride.scheduledFor || ride.createdAt)} />
        <Field label="Heure de la course" value={fmtTime(ride.scheduledFor || ride.createdAt)} />
        <Field label="Nom du client" value={ride.client?.name} />
        <Field label="Adresse de départ" value={ride.pickupAddress} />
        <Field label="Destination" value={ride.destAddress} />
        <Field label="Numéro de vol" value={ride.flightNumber} />
        <Field label="Montant prévu de la course" value={ride.fare != null ? `${ride.fare} $` : null} />
      </View>
      <Text style={styles.navHint}>
        Navigation vers {ride.status === "STARTED" ? "la destination" : "le client"}
      </Text>
      <View style={styles.rowBetween}>
        <TouchableOpacity style={styles.outlineBtn} onPress={openWaze}><Text style={styles.outlineBtnText}>Waze</Text></TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={openGoogleMaps}><Text style={styles.outlineBtnText}>Google Maps</Text></TouchableOpacity>
      </View>
      <View style={styles.rowBetween}>
        <TouchableOpacity style={styles.outlineBtn} onPress={() => onOpenChat(ride.id)}>
          <Text style={styles.outlineBtnText}>Message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={callMasked}>
          <Text style={styles.outlineBtnText}>Appeler (masqué)</Text>
        </TouchableOpacity>
      </View>
      {onOpenMessages && (
        <View style={styles.rowBetween}>
          <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => onOpenMessages(ride)}>
            <Text style={styles.outlineBtnText}>Écrire à Taxi Sylvain à propos de cette course</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity style={styles.primaryBtn} onPress={advance}>
        <Text style={styles.primaryBtnText}>{LABEL[ride.status] || "Course terminée"}</Text>
      </TouchableOpacity>
      {ride.status !== "STARTED" && (
        <TouchableOpacity style={styles.cancelBtn} onPress={cancelRide}>
          <Text style={styles.cancelBtnText}>Annuler la course</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  link: { color: "#f5a623" },
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700" },
  card: { backgroundColor: "#16233a", borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#28395a" },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  fieldLabel: { color: "#8b99b5", fontSize: 12 },
  fieldValue: { color: "#edeff3", fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  navHint: { color: "#8b99b5", fontSize: 12, marginBottom: 6 },
  addr: { color: "#edeff3", marginBottom: 6 },
  fare: { color: "#f5a623", fontWeight: "700", marginTop: 6 },
  rowBetween: { flexDirection: "row", gap: 8, marginBottom: 14 },
  outlineBtn: { flex: 1, borderWidth: 1, borderColor: "#28395a", borderRadius: 10, padding: 10, alignItems: "center" },
  outlineBtnText: { color: "#edeff3" },
  primaryBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center" },
  primaryBtnText: { color: "#1a1200", fontWeight: "700" },
  cancelBtn: { padding: 12, alignItems: "center", marginTop: 8 },
  cancelBtnText: { color: "#e85d4c", fontWeight: "600" },
});
