import jwt from "jsonwebtoken";

// Chaque utilisateur rejoint des "rooms" selon son rôle, pour recevoir uniquement
// les événements qui le concernent :
// - DISPATCH rejoint "dispatch"
// - DRIVER rejoint "drivers" (diffusion générale) + "driver:{id}" (personnel)
// - Tout le monde peut rejoindre "ride:{id}" quand une course est ouverte à l'écran
export function registerSocketHandlers(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { role, id } = socket.user;
    if (role === "DISPATCH") socket.join("dispatch");
    if (role === "DRIVER") {
      socket.join("drivers");
      socket.join(`driver:${id}`);
    }

    socket.on("ride:watch", (rideId) => socket.join(`ride:${rideId}`));
    socket.on("ride:unwatch", (rideId) => socket.leave(`ride:${rideId}`));
  });
}
