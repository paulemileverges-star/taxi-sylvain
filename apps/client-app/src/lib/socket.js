import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

let socket;

export async function getSocket() {
  if (!socket) {
    const token = await AsyncStorage.getItem("ts_token");
    socket = io(process.env.EXPO_PUBLIC_SOCKET_URL || "http://localhost:4000", { auth: { token } });
  }
  return socket;
}
