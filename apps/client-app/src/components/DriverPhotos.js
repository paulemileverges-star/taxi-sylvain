import React, { useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { assetUrl } from "../lib/api";

// Photo du chauffeur et de son véhicule. Si le fichier n'est plus sur le serveur (photo envoyée
// avant la mise en place du disque persistant), on affiche un repli lisible plutôt qu'un carré
// vide : initiale du chauffeur, ou mention explicite pour la voiture.
export function DriverAvatar({ driver, size = 52 }) {
  const [broken, setBroken] = useState(false);
  const uri = driver?.photoUrl ? assetUrl(driver.photoUrl) : null;
  const style = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !broken) {
    return <Image source={{ uri }} style={[styles.avatar, style]} onError={() => setBroken(true)} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback, style]}>
      <Text style={[styles.initial, { fontSize: size / 2.4 }]}>{driver?.name?.[0]?.toUpperCase() || "?"}</Text>
    </View>
  );
}

// « contain » et non « cover » : le véhicule doit être visible en entier (une photo prise en
// largeur était coupée en haut et en bas), quitte à laisser des marges sur les côtés.
export function CarPhoto({ driver, height = 170, style }) {
  const [broken, setBroken] = useState(false);
  const uri = driver?.carPhotoUrl ? assetUrl(driver.carPhotoUrl) : null;

  if (uri && !broken) {
    return <Image source={{ uri }} style={[styles.car, { height }, style]} onError={() => setBroken(true)} resizeMode="contain" />;
  }
  return (
    <View style={[styles.car, styles.carFallback, { height }, style]}>
      <Text style={styles.carFallbackText}>
        {driver?.carModel ? `${driver.carModel}${driver.plate ? ` · ${driver.plate}` : ""}` : "Photo du véhicule non disponible"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { backgroundColor: "#1d2c46", overflow: "hidden" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  initial: { color: "#edeff3", fontWeight: "700" },
  car: { width: "100%", borderRadius: 10, backgroundColor: "#1d2c46" },
  carFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#28395a", padding: 8 },
  carFallbackText: { color: "#8b99b5", fontSize: 12, textAlign: "center" },
});
