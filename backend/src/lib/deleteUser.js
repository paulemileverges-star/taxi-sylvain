import { prisma } from "./prisma.js";

// Supprime un compte (chauffeur ou client) et tout ce qui lui appartient en propre (messages
// envoyés, notations, cédule, groupes créés...). Les courses où il apparaissait comme
// client/chauffeur sont conservées mais désassociées (clientId/driverId remis à NULL), pour
// garder l'historique des courses côté Taxi Sylvain plutôt que de le faire disparaître.
export async function deleteUserCascade(userId) {
  await prisma.$transaction(async (tx) => {
    const ownedConversations = await tx.conversation.findMany({
      where: { createdById: userId },
      select: { id: true },
    });
    const ownedIds = ownedConversations.map((c) => c.id);
    if (ownedIds.length > 0) {
      await tx.groupMessage.deleteMany({ where: { conversationId: { in: ownedIds } } });
      await tx.conversationParticipant.deleteMany({ where: { conversationId: { in: ownedIds } } });
      await tx.conversation.deleteMany({ where: { id: { in: ownedIds } } });
    }

    await tx.groupMessage.deleteMany({ where: { senderId: userId } });
    await tx.conversationParticipant.deleteMany({ where: { userId } });
    await tx.message.deleteMany({ where: { senderId: userId } });
    await tx.message.deleteMany({ where: { driverId: userId } }); // fil direct dispatch<->chauffeur
    await tx.rating.deleteMany({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }] } });
    await tx.schedule.deleteMany({ where: { driverId: userId } });
    await tx.weeklyReport.deleteMany({ where: { driverId: userId } });

    await tx.ride.updateMany({ where: { clientId: userId }, data: { clientId: null } });
    await tx.ride.updateMany({ where: { driverId: userId }, data: { driverId: null } });

    await tx.user.delete({ where: { id: userId } });
  });
}
