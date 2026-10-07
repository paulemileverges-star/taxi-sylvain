import React, { useEffect, useRef, useState } from "react";
import { heure, jour } from "../lib/dates";
import { View, Text, TouchableOpacity, Linking, StyleSheet, ScrollView } from "react-native";
import { api } from "../lib/api";
import { DriverAvatar, CarPhoto } from "../components/DriverPhotos";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";
import { getSocket, watchRide } from "../lib/socket";
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
const FINAL_STATUSES = ["COMPLETED", "CANCELLED", "REFUSED"];
// Statuts où l'appel masqué vers le chauffeur est possible : même liste que le serveur
// (backend/src/lib/twilioProxy.js, CALL_STATUSES). Avant, la course n'a pas de chauffeur sûr ;
// après, le numéro relais ne doit plus relier les deux parties.
const CALL_STATUSES = ["ACCEPTED", "EN_ROUTE", "STARTED"];
// Au-delà, la position affichée est signalée comme ancienne (même règle que la carte du Dispatch).
const POSITION_ANCIENNE_MS = 3 * 60 * 1000;

// Heure toujours sur 24 heures, à l'heure de Montréal (lib/dates.js, 6 octobre 2026).
const fmtDate = jour;
const fmtTime = heure;

function Field({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label} :</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

// Audit du 7 octobre 2026 :
//   - F09 : une position ancienne restait affichée comme actuelle (même d'une autre course après un
//     changement de course) ; elle est remise à zéro au changement de course, effacée quand le
//     serveur n'en a plus ou quand la course est finie, et signalée si elle date ;
//   - F10 : l'écran défile, les boutons restent accessibles sur un petit téléphone ;
//   - F20 : seule cette course est relue, et plus du tout une fois terminée ou annulée ;
//   - F08 : une course introuvable ou une panne s'affichent au lieu de « Chargement… » sans fin ;
//   - B17 : pas de note fictive pour un chauffeur encore sans avis.
export default function TrackingScreen({ rideId, onOpenChat, onBack, unreadRide = 0 }) {
  const [ride, setRide] = useState(null);
  const [erreur, setErreur] = useState("");
  const [driverPos, setDriverPos] = useState(null); // { lat, lng, at }
  const [maintenant, setMaintenant] = useState(Date.now());
  const finie = FINAL_STATUSES.includes(ride?.status);
  // Statut du moment, lu par la minuterie (une variable de l'effet garderait le premier statut).
  const statutRef = useRef(null);
  statutRef.current = ride?.status;

  useEffect(() => {
    let actif = true;
    setRide(null);
    setDriverPos(null);
    setErreur("");
    const load = () => api.ride(rideId)
      .then((r) => { if (actif) { setRide(r); setErreur(""); } })
      .catch((e) => {
        if (!actif) return;
        setErreur(e.status === 403 || e.status === 404 ? "Cette course n'est plus disponible." : `Suivi indisponible pour le moment : ${e.message}`);
      });
    load();
    // Filet de sécurité si la connexion temps réel décroche ; les changements arrivent en direct.
    const interval = setInterval(() => { if (!FINAL_STATUSES.includes(statutRef.current)) load(); }, 10000);
    let sock;
    const surChangement = (r) => { if ((r?.id || r?.rideId) === rideId) load(); };
    getSocket().then((s) => {
      if (!actif) return;
      sock = s;
      s.on("ride:status", surChangement);
      s.on("ride:client-update", surChangement);
    });
    return () => {
      actif = false;
      clearInterval(interval);
      sock?.off("ride:status", surChangement);
      sock?.off("ride:client-update", surChangement);
    };
  }, [rideId]);

  // Position GPS du chauffeur en direct pendant qu'il est en route ou en course
  // (le room ride:{id} est déjà rejoint côté App.js via ride:watch).
  useEffect(() => {
    if (finie) { setDriverPos(null); return undefined; }
    let actif = true;
    // Dernière position connue tout de suite, puis mises à jour en direct ; un rappel toutes les
    // 5 s sert de filet de sécurité si la connexion temps réel décroche. Une réponse vide efface la
    // position : le serveur n'en a plus pour cette course.
    const fetchPos = () => api.driverLocation(rideId)
      .then((p) => { if (actif) setDriverPos(p ? { lat: p.lat, lng: p.lng, at: p.at || Date.now() } : null); })
      .catch(() => null);
    fetchPos();
    const interval = setInterval(fetchPos, 5000);
    const horloge = setInterval(() => setMaintenant(Date.now()), 30000);
    let sock;
    const surPosition = (p) => {
      if (p.rideId === rideId) setDriverPos({ lat: p.lat, lng: p.lng, at: p.at || Date.now() });
    };
    getSocket().then((s) => {
      if (!actif) return;
      sock = s;
      watchRide(rideId);
      s.on("driver:location", surPosition);
    });
    return () => {
      actif = false;
      clearInterval(interval);
      clearInterval(horloge);
      sock?.off("driver:location", surPosition);
    };
  }, [rideId, finie]);

  // Appel masqué vers le chauffeur (besoin #2) : le serveur ouvre une session Twilio Proxy pour la
  // course et renvoie un numéro relais ; ni le client ni le chauffeur ne voient le vrai numéro de
  // l'autre. Le téléphone compose ce numéro relais.
  const callDriverMasked = async () => {
    try {
      const { proxyNumber } = await api.callMasked(rideId);
      playSound("action");
      Linking.openURL(`tel:${proxyNumber}`);
    } catch (e) {
      showAlert("Appel indisponible", e.message);
    }
  };

  const callTaxiSylvain = () => {
    playSound("action");
    Linking.openURL(`tel:${TAXI_SYLVAIN_PHONE}`);
  };

  const ancienneteMin = driverPos?.at ? Math.floor((maintenant - driverPos.at) / 60000) : 0;
  const positionAncienne = driverPos?.at && maintenant - driverPos.at > POSITION_ANCIENNE_MS;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={styles.headerRow}>
        {onBack && <TouchableOpacity onPress={onBack} accessibilityRole="button"><Text style={styles.link}>← Retour</Text></TouchableOpacity>}
        <Text style={styles.title} accessibilityRole="header">{ride ? STATUS_LABEL[ride.status] : erreur ? "Suivi de la course" : "Chargement…"}</Text>
      </View>
      {erreur ? <Text style={styles.erreur} accessibilityLiveRegion="polite">{erreur}</Text> : null}
      {ride && !finie && (LIVE_STATUSES.includes(ride.status) || driverPos) && (
        <View style={styles.mapPlaceholder}>
          {driverPos ? (
            <DriverMap lat={driverPos.lat} lng={driverPos.lng} />
          ) : (
            <Text style={{ color: "#8b99b5" }}>En attente de la position du chauffeur…</Text>
          )}
        </View>
      )}
      {driverPos && positionAncienne && !finie ? (
        <Text style={styles.ancienne}>Position reçue il y a {ancienneteMin} min : le téléphone du chauffeur ne l'envoie plus pour le moment.</Text>
      ) : null}
      {ride && (
        <View style={styles.card}>
          <Field label="Date de la course" value={fmtDate(ride.scheduledFor || ride.createdAt)} />
          <Field label="Heure de la course" value={fmtTime(ride.scheduledFor || ride.createdAt)} />
          <Field label="Adresse de départ" value={ride.pickupAddress} />
          {(Array.isArray(ride.stops) ? ride.stops : []).map((a, i) => <Field key={i} label={`Arrêt ${i + 1}`} value={a.address} />)}
          <Field label="Destination" value={ride.destAddress} />
          <Field label="Distance" value={ride.distanceKm != null ? `${ride.distanceKm.toFixed(1)} km` : null} />
          <Field label="Numéro de vol" value={ride.flightNumber} />
          <Field label="Montant prévu de la course" value={ride.fare > 0 ? `${ride.fare} $` : "À confirmer par Taxi Sylvain"} />
        </View>
      )}
      {ride?.driver && (
        <View style={styles.card}>
          <View style={styles.driverRow}>
            <DriverAvatar driver={ride.driver} />
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{ride.driver.name}</Text>
              <Text style={styles.driverInfo}>{[ride.driver.carModel, ride.driver.carColor, ride.driver.plate].filter(Boolean).join(" · ")}</Text>
              <Text style={styles.driverInfo}>{ride.driver.ratingAvg != null ? `★ ${ride.driver.ratingAvg.toFixed(1)}` : "Nouveau chauffeur"}</Text>
            </View>
          </View>
          <CarPhoto driver={ride.driver} style={{ marginTop: 12 }} />
          {/* Boutons l'un sous l'autre : sur un petit écran, deux longs libellés côte à côte débordaient. */}
          <TouchableOpacity style={[styles.callBtn, { marginTop: 12 }, unreadRide ? { borderColor: "#f5a623" } : null]} onPress={() => onOpenChat(rideId)} accessibilityRole="button">
            <Text style={[styles.callBtnText, unreadRide ? { color: "#f5a623", fontWeight: "700" } : null]}>
              Message au chauffeur{unreadRide ? ` (${unreadRide} nouveau${unreadRide > 1 ? "x" : ""})` : ""}
            </Text>
          </TouchableOpacity>
          {CALL_STATUSES.includes(ride.status) && (
            <TouchableOpacity style={[styles.callBtn, { marginTop: 8 }]} onPress={callDriverMasked} accessibilityRole="button">
              <Text style={styles.callBtnText}>Appeler le chauffeur (votre numéro sera masqué)</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <TouchableOpacity style={[styles.callBtn, { marginTop: 4 }]} onPress={callTaxiSylvain} accessibilityRole="button">
        <Text style={styles.callBtnText}>Appeler Taxi Sylvain — (438) 499-1120</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  link: { color: "#f5a623" },
  title: { color: "#edeff3", fontSize: 20, fontWeight: "700", flexShrink: 1 },
  erreur: { color: "#e85d4c", marginBottom: 12 },
  ancienne: { color: "#f5a623", fontSize: 12, marginTop: -8, marginBottom: 12 },
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
  callBtn: { borderWidth: 1, borderColor: "#28395a", borderRadius: 10, padding: 12, alignItems: "center" },
  callBtnText: { color: "#edeff3", textAlign: "center" },
});
