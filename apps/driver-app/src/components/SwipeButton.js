import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, PanResponder, StyleSheet } from "react-native";

// Bouton "glisser pour confirmer" — évite les acceptations/actions déclenchées par un tap
// accidentel sur des actions à conséquence (accepter, démarrer, terminer une course...).
//
// Le PanResponder n'est créé qu'une fois : tout ce dont ses callbacks ont besoin (largeur mesurée,
// onConfirm et disabled du rendu courant) est lu à travers des refs mises à jour à chaque rendu.
// Sans ça, le bouton garderait le onConfirm du premier rendu — c'est ce qui faisait qu'après
// « En route », le glissement « Démarrer » rejouait l'étape précédente et ne faisait rien
// jusqu'au rafraîchissement de la page.
const THUMB_SIZE = 46;
const TRACK_HEIGHT = 54;
const CONFIRM_THRESHOLD = 0.8;

export default function SwipeButton({ label, onConfirm, color = "#f5a623", textColor = "#1a1200", disabled }) {
  const pan = useRef(new Animated.Value(0)).current;
  const maxSwipeRef = useRef(1);
  const onConfirmRef = useRef(onConfirm);
  const disabledRef = useRef(disabled);
  const busyRef = useRef(false);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
    disabledRef.current = disabled;
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && !busyRef.current,
      onMoveShouldSetPanResponder: (evt, gesture) => !disabledRef.current && !busyRef.current && Math.abs(gesture.dx) > 2,
      onPanResponderMove: (evt, gesture) => {
        const x = Math.min(Math.max(gesture.dx, 0), maxSwipeRef.current);
        pan.setValue(x);
      },
      onPanResponderRelease: (evt, gesture) => {
        if (gesture.dx >= maxSwipeRef.current * CONFIRM_THRESHOLD) {
          busyRef.current = true;
          Animated.timing(pan, { toValue: maxSwipeRef.current, duration: 120, useNativeDriver: false }).start(async () => {
            try {
              await onConfirmRef.current?.();
            } finally {
              setTimeout(() => { pan.setValue(0); busyRef.current = false; }, 350);
            }
          });
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  const onLayout = (e) => {
    const w = e.nativeEvent.layout.width;
    setTrackWidth(w);
    maxSwipeRef.current = Math.max(w - THUMB_SIZE - 8, 1);
  };

  const labelOpacity = pan.interpolate({
    inputRange: [0, Math.max(trackWidth - THUMB_SIZE - 8, 1)],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View
      onLayout={onLayout}
      style={[styles.track, { backgroundColor: disabled ? "#28395a" : `${color}26`, borderColor: disabled ? "#28395a" : color }]}
    >
      <Animated.Text style={[styles.label, { color: disabled ? "#8b99b5" : color, opacity: labelOpacity }]}>
        {label} — glisser pour confirmer →
      </Animated.Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.thumb,
          { backgroundColor: disabled ? "#8b99b5" : color, transform: [{ translateX: pan }] },
        ]}
      >
        <Text style={[styles.thumbArrow, { color: textColor }]}>→</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  label: { textAlign: "center", fontWeight: "700", fontSize: 13 },
  thumb: {
    position: "absolute",
    left: 4,
    top: 4,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbArrow: { fontWeight: "700", fontSize: 18 },
});
