import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking, Platform, ScrollView } from "react-native";
import { api } from "../lib/api";
import { playSound } from "../lib/sound";
import { showAlert } from "../lib/alert";
import AddressInput from "../components/AddressInput";

const TAXI_SYLVAIN_PHONE = "+14384991120";

// Sur le web, les champs date/heure natifs du navigateur sont bien plus pratiques que des
// zones de texte ; sur Android/iOS on garde une saisie texte simple (AAAA-MM-JJ / HH:MM).
function DateTimeFields({ date, time, onDate, onTime }) {
  if (Platform.OS === "web") {
    const style = { background: "#16233a", color: "#edeff3", border: "1px solid #28395a", borderRadius: 12, padding: 12, fontSize: 14, flex: 1, colorScheme: "dark" };
    return (
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} style={style} />
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} style={style} />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
      <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Date (AAAA-MM-JJ)" placeholderTextColor="#8b99b5" value={date} onChangeText={onDate} />
      <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Heure (HH:MM)" placeholderTextColor="#8b99b5" value={time} onChangeText={onTime} />
    </View>
  );
}

export default function BookScreen({ user, onBooked, onOpenGroups, onOpenChangePassword, onOpenNotifications, onOpenRides, onLogout }) {
  const homeAddress = (user?.address || "").trim();
  const [useHome, setUseHome] = useState(Boolean(homeAddress));
  const [pickup, setPickup] = useState({ address: homeAddress, lat: null, lng: null });
  const [destinations, setDestinations] = useState([]);
  const [destinationCode, setDestinationCode] = useState("");
  const [dest, setDest] = useState({ address: "", lat: null, lng: null });
  const [flightNumber, setFlightNumber] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [quote, setQuote] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.destinations().then(setDestinations).catch(() => setDestinations([])); }, []);

  // Tarif du catalogue affiché dès qu'une destination rapide et une adresse de départ sont connues.
  useEffect(() => {
    if (!destinationCode || pickup.address.trim().length < 3) { setQuote(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = await api.priceQuote(pickup.address, destinationCode);
        if (!cancelled) setQuote(q);
      } catch {
        if (!cancelled) setQuote(null);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [destinationCode, pickup.address]);

  const chooseHome = () => { setUseHome(true); setPickup({ address: homeAddress, lat: null, lng: null }); };
  const chooseOther = () => { setUseHome(false); setPickup({ address: "", lat: null, lng: null }); };

  const scheduledFor = () => {
    if (!date && !time) return undefined;
    const d = new Date(`${date}T${time || "00:00"}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const book = async () => {
    const destinationOk = destinationCode || dest.address.trim();
    if (!pickup.address.trim() || !destinationOk) {
      showAlert("Adresses requises", "Merci d'indiquer la prise en charge et la destination.");
      return;
    }
    const when = scheduledFor();
    if (when === null) {
      showAlert("Date invalide", "Indiquez la date au format AAAA-MM-JJ et l'heure au format HH:MM.");
      return;
    }
    setSubmitting(true);
    try {
      const ride = await api.bookRide({
        pickupAddress: pickup.address,
        pickupLat: pickup.lat ?? undefined,
        pickupLng: pickup.lng ?? undefined,
        destinationCode: destinationCode || undefined,
        destAddress: destinationCode ? undefined : dest.address,
        destLat: destinationCode ? undefined : dest.lat ?? undefined,
        destLng: destinationCode ? undefined : dest.lng ?? undefined,
        flightNumber: flightNumber || undefined,
        scheduledFor: when,
      });
      playSound("action");
      const message = ride.fare > 0
        ? `Votre course est validée au tarif de ${ride.fare.toFixed(2)} $. Taxi Sylvain vous confirmera votre chauffeur.`
        : "Votre demande est en attente de validation par Taxi Sylvain : vous recevrez le montant et la confirmation dès qu'ils seront fixés.";
      showAlert(ride.fare > 0 ? "Course validée" : "Demande envoyée", message, [{ text: "OK", onPress: () => onBooked(ride.id) }]);
    } catch (e) {
      showAlert("Erreur", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPreset = destinations.find((d) => d.code === destinationCode);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bonjour {user?.name || ""}</Text>
        <TouchableOpacity onPress={onLogout}><Text style={styles.logoutLink}>Se déconnecter</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <TouchableOpacity onPress={onOpenRides}><Text style={styles.link}>Courses</Text></TouchableOpacity>
        <TouchableOpacity onPress={onOpenGroups}><Text style={styles.link}>Groupes</Text></TouchableOpacity>
        <TouchableOpacity onPress={onOpenChangePassword}><Text style={styles.link}>Mot de passe</Text></TouchableOpacity>
        <TouchableOpacity onPress={onOpenNotifications}><Text style={styles.link}>Notifications</Text></TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Où allez-vous ?</Text>

      <Text style={styles.label}>Prise en charge</Text>
      {homeAddress ? (
        <View style={styles.chips}>
          <TouchableOpacity style={[styles.chip, useHome && styles.chipActive]} onPress={chooseHome}>
            <Text style={[styles.chipText, useHome && styles.chipTextActive]}>Mon domicile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, !useHome && styles.chipActive]} onPress={chooseOther}>
            <Text style={[styles.chipText, !useHome && styles.chipTextActive]}>Autre adresse</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {useHome && homeAddress ? (
        <View style={styles.readonly}><Text style={styles.readonlyText}>{homeAddress}</Text></View>
      ) : (
        <AddressInput placeholder="Adresse de prise en charge" value={pickup.address} onChange={setPickup} />
      )}

      <Text style={styles.label}>Destination</Text>
      <View style={styles.chips}>
        {destinations.map((d) => (
          <TouchableOpacity key={d.code} style={[styles.chip, destinationCode === d.code && styles.chipActive]} onPress={() => setDestinationCode(d.code)}>
            <Text style={[styles.chipText, destinationCode === d.code && styles.chipTextActive]}>{d.code}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.chip, !destinationCode && styles.chipActive]} onPress={() => setDestinationCode("")}>
          <Text style={[styles.chipText, !destinationCode && styles.chipTextActive]}>Autre adresse</Text>
        </TouchableOpacity>
      </View>
      {destinationCode ? (
        <View style={styles.readonly}>
          <Text style={styles.readonlyText}>{selectedPreset?.label}</Text>
          <Text style={styles.readonlySub}>{selectedPreset?.address}</Text>
          <Text style={[styles.readonlySub, { color: quote?.price != null ? "#3fa796" : "#8b99b5", marginTop: 6 }]}>
            {quote?.price != null
              ? `Tarif : ${quote.price.toFixed(2)} $ (${quote.zoneName || destinationCode})`
              : pickup.address.trim().length >= 3
                ? "Montant confirmé par Taxi Sylvain après la réservation"
                : "Le tarif s'affichera dès que l'adresse de prise en charge est indiquée"}
          </Text>
        </View>
      ) : (
        <AddressInput placeholder="Adresse de destination" value={dest.address} onChange={setDest} />
      )}

      <Text style={styles.label}>Date et heure de la course (vide = dès que possible)</Text>
      <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} />

      <TextInput style={styles.input} placeholder="Numéro de vol (optionnel)" placeholderTextColor="#8b99b5" value={flightNumber} onChangeText={setFlightNumber} />

      <TouchableOpacity style={[styles.primaryBtn, submitting && { opacity: 0.6 }]} onPress={book} disabled={submitting}>
        <Text style={styles.primaryBtnText}>{submitting ? "Envoi…" : "Réserver dans l'app"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.outlineBtn} onPress={() => Linking.openURL(`tel:${TAXI_SYLVAIN_PHONE}`)}>
        <Text style={{ color: "#edeff3" }}>Appeler Taxi Sylvain — (438) 499-1120</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: "#edeff3", fontSize: 22, fontWeight: "700" },
  logoutLink: { color: "#e85d4c", fontWeight: "600" },
  link: { color: "#f5a623" },
  subtitle: { color: "#edeff3", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  label: { color: "#8b99b5", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: "#28395a", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  chipActive: { backgroundColor: "#f5a623", borderColor: "#f5a623" },
  chipText: { color: "#8b99b5", fontWeight: "600" },
  chipTextActive: { color: "#1a1200" },
  readonly: { backgroundColor: "#16233a", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#28395a", marginBottom: 10 },
  readonlyText: { color: "#edeff3", fontWeight: "600" },
  readonlySub: { color: "#8b99b5", fontSize: 12, marginTop: 2 },
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#28395a" },
  primaryBtn: { backgroundColor: "#f5a623", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 10 },
  primaryBtnText: { color: "#1a1200", fontWeight: "700" },
  outlineBtn: { borderWidth: 1, borderColor: "#28395a", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 8 },
});
