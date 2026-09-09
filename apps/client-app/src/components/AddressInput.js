import React, { useRef, useState } from "react";
import { View, TextInput, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../lib/api";

// Champ d'adresse avec autocomplétion (Nominatim/OpenStreetMap, via le proxy backend) —
// saisie debouncée à 350ms pour rester raisonnable vis-à-vis du service gratuit.
export default function AddressInput({ placeholder, value, onChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const handleChange = (text) => {
    onChange({ address: text, lat: null, lng: null });
    clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await api.geocodeSearch(text);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const select = (s) => {
    onChange({ address: s.label, lat: s.lat, lng: s.lng });
    setSuggestions([]);
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
              <Text style={styles.suggestionText} numberOfLines={2}>{s.label}</Text>
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
});
