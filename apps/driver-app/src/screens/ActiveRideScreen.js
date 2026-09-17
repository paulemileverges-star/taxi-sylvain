import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";
import { openWaze as openWazeTo, openGoogleMaps as openGoogleMapsTo } from "../lib/navigation";
import SwipeButton from "../components/SwipeButton";

const NEXT_STATUS = { ACCEPTED: "EN_ROUTE", EN_ROUTE: "STARTED", STARTED: "COMPLETED" };
const LABEL = { ACCEPTED: "En route pour la course", EN_ROUTE: "Démarrer la course", STARTED: "Terminer la course" };

// Écrire au client n'est ouvert qu'à partir d'une heure avant la course (règle appliquée par le
// serveur) — ici, c'est uniquement pour l'afficher au chauffeur.
function canMessageClient(ride) {
  if (!ride) return false;
  if (["EN_ROUTE", "STARTED", "COMPLETED"].includes(ride.status)) return true;
  if (!ride.scheduledFor) return true;
  return Date.now() >= new Date(ride.scheduledFor).getTime() - 60 * 60 * 1000;
}

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

export default function ActiveRideScreen({ rideId, onCompleted, onCancelled, onOpenChat, onOpenMessages, onBack, unreadRide = 0, onRideState }) {
  const [ride, setRide] = useState(null);

  const load = async () => {
    const rides = await api.myRides();
    setRide(rides.find((r) => r.id === rideId));
  };

  useEffect(() => { load(); }, [rideId]);

  // Le suivi GPS est piloté au niveau de l'application (App.js) et non ici : il doit continuer
  // quand le chauffeur revient à l'accueil, ouvre la messagerie ou bascule dans Waze.
  useEffect(() => {
    if (ride) onRideState?.({ id: ride.id, status: ride.status });
  }, [ride?.id, ride?.status]);

  const advance = async () => {
    if (!ride) return;
    const next = NEXT_STATUS[ride.status];
    if (!next) return;
    try {
      const updated = await api.setRideStatus(ride.id, next);
      setRide((prev) => ({ ...prev, ...updated }));
      playSound("action");
      if (next === "COMPLETED") onCompleted();
    } catch (e) {
      // Écran désynchronisé (étape déjà franchie, course réaffectée...) : on recharge la course
      // pour afficher le bon bouton au lieu de laisser un glissement sans effet.
      showAlert("Action impossible", e.message);
      load();
    }
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
        <Field label="Distance" value={ride.distanceKm != null ? `${ride.distanceKm.toFixed(1)} km` : null} />
        <Field label="Numéro de vol" value={ride.flightNumber} />
        <Field label="Montant prévu de la course" value={ride.fare > 0 ? `${ride.fare} $` : "À confirmer par Taxi Sylvain"} />
      </View>
      <Text style={styles.navHint}>
        Navigation vers {ride.status === "STARTED" ? "la destination" : "le client"}
      </Text>
      <View style={styles.rowBetween}>
        <TouchableOpacity style={styles.outlineBtn} onPress={openWaze}><Text style={styles.outlineBtnText}>Waze</Text></TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={openGoogleMaps}><Text style={styles.outlineBtnText}>Google Maps</Text></TouchableOpacity>
      </View>
      <View style={styles.rowBetween}>
        <TouchableOpacity style={[styles.outlineBtn, unreadRide ? { borderColor: "#f5a623" } : null]} onPress={() => onOpenChat(ride.id)}>
          <Text style={[styles.outlineBtnText, unreadRide ? { color: "#f5a623", fontWeight: "700" } : null]}>
            {canMessageClient(ride) ? "Message au client" : "Message (ouvert 1 h avant)"}
            {unreadRide ? ` (${unreadRide} nouveau${unreadRide > 1 ? "x" : ""})` : ""}
          </Text>
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
      <SwipeButton label={LABEL[ride.status] || "Course terminée"} onConfirm={advance} disabled={!LABEL[ride.status]} />
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
  cancelBtn: { padding: 12, alignItems: "center", marginTop: 8 },
  cancelBtnText: { color: "#e85d4c", fontWeight: "600" },
});
