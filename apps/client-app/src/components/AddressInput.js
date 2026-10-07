import React, { useEffect, useRef, useState } from "react";
import { View, TextInput, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../lib/api";

// Champ d'adresse avec autocomplétion, par le serveur de Taxi Sylvain : Google Maps depuis le
// 6 octobre 2026 quand la clé y est posée (sinon OpenStreetMap). Une suggestion Google n'a son point
// exact qu'une fois choisie : le détail est demandé à ce moment-là. Pour l'aéroport Montréal-Trudeau,
// seules les Arrivées et le stationnement P4 sont proposés. Saisie différée de 350 ms.
const nouvelleSession = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Fournisseur d'adresses du serveur, demandé une seule fois pour toute l'application.
let fournisseur = null;
const fournisseurAdresses = () => {
  fournisseur = fournisseur || api.geocodeProvider().then((r) => r?.fournisseur || "openstreetmap").catch(() => "openstreetmap");
  return fournisseur;
};

// Audit du 7 octobre 2026 :
//   - F15 : une réponse lente pour une ANCIENNE frappe remplaçait les suggestions récentes, et le
//     détail d'une adresse choisie pouvait écraser un texte retapé entre-temps. Chaque recherche porte
//     un numéro ; seule la dernière s'affiche ;
//   - OPS-02 : sans clé Google, le serveur public OpenStreetMap n'autorise pas une recherche à chaque
//     frappe : 1 seconde de pause et 5 caractères au moins.
export default function AddressInput({ placeholder, value, onChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rythme, setRythme] = useState({ delai: 350, minimum: 3 });
  const debounceRef = useRef(null);
  const derniere = useRef(0);
  const sessionRef = useRef(nouvelleSession());

  useEffect(() => {
    fournisseurAdresses().then((f) => { if (f !== "google") setRythme({ delai: 1000, minimum: 5 }); });
    return () => {
      clearTimeout(debounceRef.current);
      derniere.current += 1; // toute réponse encore attendue sera ignorée
    };
  }, []);

  const handleChange = (text) => {
    onChange({ address: text, lat: null, lng: null, confidence: null, placeId: null });
    clearTimeout(debounceRef.current);
    const numero = ++derniere.current;
    if (text.trim().length < rythme.minimum) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await api.geocodeSearch(text, sessionRef.current);
        if (numero !== derniere.current) return; // une frappe plus récente a pris le relais
        const catalogue = results.filter((r) => r.catalogue);
        setSuggestions(catalogue.length ? catalogue : results);
      } catch {
        if (numero === derniere.current) setSuggestions([]);
      } finally {
        if (numero === derniere.current) setLoading(false);
      }
    }, rythme.delai);
  };

  const select = async (s) => {
    setSuggestions([]);
    const numero = ++derniere.current;
    if (s.placeId && typeof s.lat !== "number") {
      onChange({ address: s.label, lat: null, lng: null, confidence: null, placeId: null });
      setLoading(true);
      try {
        const d = await api.geocodePlace(s.placeId, sessionRef.current, { q: value, nom: s.nomLieu || "" });
        // Texte retapé entre-temps : le détail de l'ancienne adresse ne l'écrase pas.
        if (numero !== derniere.current) return;
        onChange({ address: d.label, lat: d.lat, lng: d.lng, confidence: d.confidence || null, placeId: d.placeId || s.placeId });
      } catch {
        // Sans le détail, on garde le texte : le serveur le vérifie à la réservation.
      } finally {
        if (numero === derniere.current) setLoading(false);
        sessionRef.current = nouvelleSession();
      }
      return;
    }
    onChange({ address: s.label, lat: s.lat, lng: s.lng, confidence: s.confidence || null, placeId: s.placeId || null });
    sessionRef.current = nouvelleSession();
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#8b99b5"
        value={value}
        onChangeText={handleChange}
      />
      {loading && <ActivityIndicator style={{ marginTop: 4 }} color="#f5a623" />}
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s, i) => (
            <TouchableOpacity key={i} style={styles.suggestionRow} onPress={() => select(s)}>
              {s.catalogue ? (
                <>
                  <Text style={[styles.suggestionText, { fontWeight: "700" }]} numberOfLines={2}>{s.nomLieu}</Text>
                  <Text style={styles.suggestionDetail} numberOfLines={2}>{s.label}</Text>
                </>
              ) : (
                <Text style={styles.suggestionText} numberOfLines={2}>{s.label}{s.nomLieu ? ` · ${s.nomLieu}` : ""}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: "#16233a", color: "#edeff3", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#28395a" },
  suggestions: { backgroundColor: "#16233a", borderRadius: 12, borderWidth: 1, borderColor: "#28395a", marginTop: 4, overflow: "hidden" },
  suggestionRow: { padding: 10, borderBottomWidth: 1, borderBottomColor: "#28395a" },
  suggestionText: { color: "#edeff3", fontSize: 13 },
  suggestionDetail: { color: "#8b99b5", fontSize: 12, marginTop: 2 },
});
