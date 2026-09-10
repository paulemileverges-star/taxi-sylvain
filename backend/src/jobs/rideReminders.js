import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/push.js";

// Rappelle à un client et à son chauffeur leur course prévue, aux décalages que chacun a choisi
// (ex. 1h avant, 10min avant — voir User.reminderOffsets). Tourne chaque minute (voir index.js) ;
// une fenêtre de grâce de 5 minutes couvre les à-coups d'exécution sans jamais spammer un rappel
// manqué depuis longtemps (ex. après un redémarrage du serveur).
const GRACE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_STATUSES = ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED"];
const MAX_OFFSET_MINUTES = 24 * 60;

export async function sendRideReminders() {
  const now = new Date();
  const rides = await prisma.ride.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      scheduledFor: { gte: now, lte: new Date(now.getTime() + MAX_OFFSET_MINUTES * 60 * 1000) },
    },
    include: {
      client: { select: { id: true, name: true, reminderOffsets: true } },
      driver: { select: { id: true, name: true, reminderOffsets: true } },
    },
  });

  for (const ride of rides) {
    for (const [party, label] of [[ride.client, "client"], [ride.driver, "chauffeur"]]) {
      if (!party) continue;
      for (const offsetMinutes of party.reminderOffsets) {
        const target = new Date(ride.scheduledFor.getTime() - offsetMinutes * 60 * 1000);
        const dueSince = now.getTime() - target.getTime();
        if (dueSince < 0 || dueSince > GRACE_WINDOW_MS) continue;

        try {
          await prisma.sentReminder.create({ data: { rideId: ride.id, userId: party.id, offsetMinutes } });
        } catch (e) {
          continue; // déjà envoyé (contrainte unique) — on l'ignore silencieusement
        }

        const when = offsetMinutes >= 60 ? `${Math.round(offsetMinutes / 60)} h` : `${offsetMinutes} min`;
        await notifyUser(party.id, {
          title: "Course à venir",
          body:
            label === "client"
              ? `Votre course est prévue dans ${when} : ${ride.pickupAddress} → ${ride.destAddress}.`
              : `Course prévue dans ${when} : ${ride.pickupAddress} → ${ride.destAddress}.`,
          data: { type: "ride:reminder", rideId: ride.id },
        });
      }
    }
  }
}
