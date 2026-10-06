import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";
import { getSocket } from "../lib/socket";
import { openWaze as openWazeTo, openGoogleMaps as openGoogleMapsTo } from "../lib/navigation";
import { chooseTarget, navigationHint, etapesDeNavigation } from "../lib/navigationLinks";
import { heure, jour } from "../lib/dates";
import SwipeButton from "../components/SwipeButton";

const NEXT_STATUS = { ACCEPTED: "EN_ROUTE", EN_ROUTE: "STARTED", STARTED: "COMPLETED" };
const LABEL = { ACCEPTED: "En route pour la course", EN_ROUTE: "Démarrer la course", STARTED: "Terminer la course" };

// Délais avant une course planifiée (demandes du propriétaire du 6 octobre 2026), appliqués par le
// serveur (backend/src/lib/fenetres.js) ; ici, seulement pour les afficher au chauffeur :
// - écrire au client ou l'appeler : à partir de 2 heures avant ;
// - se mettre en route ou démarrer : à partir de 3 heures avant.
const DELAI_CONTACT_MS = 2 * 60 * 60 * 1000;
const DELAI_DEPART_MS = 3 * 60 * 60 * 1000;
function ouverture(ride, delai) {
  if (!ride?.scheduledFor) return null;
  return new Date(new Date(ride.scheduledFor).getTime() - delai);
}
function contactOuvert(ride, maintenant) {
  if (["EN_ROUTE", "STARTED", "COMPLETED"].includes(ride?.status)) return true;
  const debut = ouverture(ride, DELAI_CONTACT_MS);
  return !debut || maintenant >= debut.getTime();
}
function departOuvert(ride, maintenant) {
  const debut = ouverture(ride, DELAI_DEPART_MS);
  return !debut || maintenant >= debut.getTime();
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
  const [maintenant, setMaintenant] = useState(Date.now());

  const load = async () => {
    const rides = await api.myRides();
    setRide(rides.find((r) => r.id === rideId));
  };

  useEffect(() => { load(); }, [rideId]);
  // Les délais s'ouvrent tout seuls, sans recharger l'écran.
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Une correction du Dispatch (adresse, arrêts, heure, montant) se voit sans fermer l’écran.
  useEffect(() => {
    let sock;
    const surMiseAJour = (r) => { if (r?.id === rideId) load(); };
    getSocket().then((s) => { sock = s; s.on("ride:updated", surMiseAJour); });
    return () => sock?.off("ride:updated", surMiseAJour);
  }, [rideId]);

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
      // Écran désynchronisé (étape déjà franchie, course réaffectée, trop tôt...) : on recharge la
      // course pour afficher le bon bouton au lieu de laisser un glissement sans effet.
      showAlert("Action impossible", e.message);
      load();
    }
  };

  const ouvrirWaze = async (point) => {
    const ok = await openWazeTo(point);
    if (!ok) showAlert("Waze indisponible", "Impossible d'ouvrir Waze. Vérifiez qu'il est installé, ou utilisez Google Maps.");
  };
  const ouvrirGoogleMaps = async (point, etapes = []) => {
    const ok = await openGoogleMapsTo(point, etapes);
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
    if (!contactOuvert(ride, Date.now())) {
      showAlert("Appel pas encore ouvert", `Vous pourrez appeler le client à partir de ${heure(ouverture(ride, DELAI_CONTACT_MS))} (2 heures avant la course). D'ici là, passez par Taxi Sylvain.`);
      return;
    }
    try {
      const { proxyNumber } = await api.callMasked(ride.id);
      playSound("action");
      Linking.openURL(`tel:${proxyNumber}`);
    } catch (e) {
      showAlert("Appel indisponible", e.message);
    }
  };

  if (!ride) return <View style={{ flex: 1, padding: 16 }}><Text style={{ color: "#8b99b5" }}>Chargement…</Text></View>;

  const arrets = Array.isArray(ride.stops) ? ride.stops.filter((a) => a && a.address) : [];
  const etapes = etapesDeNavigation(ride);
  const contact = contactOuvert(ride, maintenant);
  const depart = departOuvert(ride, maintenant);
  const prochaineEtape = NEXT_STATUS[ride.status];
  // Le passage à « en route » ou « démarrée » reste verrouillé jusqu'à 3 heures avant la course.
  const verrouille = (prochaineEtape === "EN_ROUTE" || prochaineEtape === "STARTED") && !depart;
  const libelleGlisser = verrouille
    ? `Disponible à ${heure(ouverture(ride, DELAI_DEPART_MS))} (3 h avant)`
    : LABEL[ride.status] || "Course terminée";
  const lieuDeDestination = etapes[etapes.length - 1];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerRow}>
        {onBack && <TouchableOpacity onPress={onBack}><Text style={styles.link}>← Retour</Text></TouchableOpacity>}
        <Text style={styles.title}>Course en cours</Text>
      </View>
      <View style={styles.card}>
        <Field label="Date de la course" value={jour(ride.scheduledFor || ride.createdAt)} />
        <Field label="Heure de la course" value={heure(ride.scheduledFor || ride.createdAt)} />
        <Field label="Nom du client" value={ride.client?.name} />
        <Field label="Adresse de départ" value={ride.pickupAddress} />
        {arrets.map((a, i) => <Field key={i} label={`Arrêt ${i + 1}`} value={a.address} />)}
        <Field label="Destination" value={ride.destAddress} />
        <Field label="Distance" value={ride.distanceKm != null ? `${ride.distanceKm.toFixed(1)} km` : null} />
        <Field label="Numéro de vol" value={ride.flightNumber} />
        <Field label="Montant prévu de la course" value={ride.fare > 0 ? `${ride.fare} $` : "À confirmer par Taxi Sylvain"} />
      </View>

      {/* Une ligne par étape, dans l'ordre : le chauffeur voit exactement l'adresse qu'il va ouvrir. */}
      {etapes.map((etape, i) => (
        <View key={i} style={styles.etape}>
          <Text style={styles.etapeTitre}>{etape.titre}</Text>
          <Text style={styles.etapeAdresse}>{etape.point.address}</Text>
          <Text style={styles.navHint}>{navigationHint(chooseTarget(etape.point, "waze"))}</Text>
          <View style={styles.rowBetween}>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => ouvrirWaze(etape.point)}><Text style={styles.outlineBtnText}>Waze</Text></TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => ouvrirGoogleMaps(etape.point)}><Text style={styles.outlineBtnText}>Google Maps</Text></TouchableOpacity>
          </View>
        </View>
      ))}
      {ride.status === "STARTED" && arrets.length > 0 && (
        <TouchableOpacity style={[styles.outlineBtn, { marginBottom: 14, borderColor: "#f5a623" }]} onPress={() => ouvrirGoogleMaps(lieuDeDestination.point, arrets)}>
          <Text style={[styles.outlineBtnText, { color: "#f5a623" }]}>Itinéraire complet dans Google Maps ({arrets.length} arrêt{arrets.length > 1 ? "s" : ""} puis destination)</Text>
        </TouchableOpacity>
      )}

      <View style={styles.rowBetween}>
        <TouchableOpacity style={[styles.outlineBtn, unreadRide ? { borderColor: "#f5a623" } : null]} onPress={() => onOpenChat(ride.id)}>
          <Text style={[styles.outlineBtnText, unreadRide ? { color: "#f5a623", fontWeight: "700" } : null]}>
            {contact ? "Message au client" : `Message (ouvert à ${heure(ouverture(ride, DELAI_CONTACT_MS))})`}
            {unreadRide ? ` (${unreadRide} nouveau${unreadRide > 1 ? "x" : ""})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.outlineBtn, contact ? null : styles.inactif]} onPress={callMasked}>
          <Text style={styles.outlineBtnText}>{contact ? "Appeler (votre numéro sera masqué)" : `Appel (ouvert à ${heure(ouverture(ride, DELAI_CONTACT_MS))})`}</Text>
        </TouchableOpacity>
      </View>
      {onOpenMessages && (
        <View style={styles.rowBetween}>
          <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => onOpenMessages(ride)}>
            <Text style={styles.outlineBtnText}>Écrire à Taxi Sylvain à propos de cette course</Text>
          </TouchableOpacity>
        </View>
      )}
      <SwipeButton label={libelleGlisser} onConfirm={advance} disabled={!LABEL[ride.status] || verrouille} />
      {ride.status !== "STARTED" && (
        <TouchableOpacity style={styles.cancelBtn} onPress={cancelRide}>
          <Text style={styles.cancelBtnText}>Annuler la course</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
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
  etape: { borderLeftWidth: 3, borderLeftColor: "#f5a623", paddingLeft: 10, marginBottom: 10 },
  etapeTitre: { color: "#f5a623", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  etapeAdresse: { color: "#edeff3", fontSize: 14, marginVertical: 2 },
  navHint: { color: "#8b99b5", fontSize: 12, marginBottom: 6 },
  rowBetween: { flexDirection: "row", gap: 8, marginBottom: 14 },
  outlineBtn: { flex: 1, borderWidth: 1, borderColor: "#28395a", borderRadius: 10, padding: 10, alignItems: "center" },
  outlineBtnText: { color: "#edeff3", textAlign: "center" },
  inactif: { opacity: 0.5 },
  cancelBtn: { padding: 12, alignItems: "center", marginTop: 8 },
  cancelBtnText: { color: "#e85d4c", fontWeight: "600" },
});
