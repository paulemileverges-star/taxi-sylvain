import { Alert, Platform } from "react-native";

// Alert.alert() est un no-op silencieux sur le web (react-native-web ne l'implémente
// pas) — ce wrapper retombe sur window.alert/confirm pour que les erreurs et
// confirmations restent visibles dans la version web de l'app.
export function showAlert(title, message, buttons) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = [title, message].filter(Boolean).join("\n\n");
  const cancelBtn = buttons?.find((b) => b.style === "cancel");
  const confirmBtn = buttons?.find((b) => b.style !== "cancel") || buttons?.[0];

  if (buttons && buttons.length > 1) {
    if (window.confirm(text)) confirmBtn?.onPress?.();
    else cancelBtn?.onPress?.();
  } else {
    window.alert(text);
    buttons?.[0]?.onPress?.();
  }
}
