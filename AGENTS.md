# Consignes pour les assistants de code — Taxi Sylvain

Lire d'abord **`docs/PASSATION.md`** : état du projet, déploiement, règles métier, pièges connus, travaux
restants et historique complet des demandes.

## Règles de travail

1. **Français** pour tout ce que lit le propriétaire : messages, textes d'interface, rapports. Il n'est pas
   développeur : phrases courtes, sans jargon.
2. **Preuve avant annonce.** Ne jamais écrire « c'est corrigé » sans avoir vérifié. Avant toute annonce :
   ```bash
   cd backend && npm test
   node scripts/verifier-mise-en-ligne.mjs
   ```
   Rendre compte point par point : fait et vérifié comment, ou pas fait et pourquoi.
3. **Une règle métier demandée = un test.** Les tests sont dans `backend/test/`, harnais `node --test`.
4. **Pas de recompilation des APK** Android ou iOS sans l'accord explicite du propriétaire. Par défaut, les
   corrections se font sur les versions web.
5. **App Client sur Vercel** : `client.taxisylvain.ca` suit automatiquement chaque mise en production.
   L'ancienne adresse `taxi-sylvain-client.vercel.app` doit encore être réaliasée après `vercel --prod`.
   Détails dans `docs/PASSATION.md` § 6.
6. **Railway** : lancer `railway up --service backend` depuis `backend/` uniquement.
7. **Secrets** : jamais dans le code, les commits ou les documents. Les clés se saisissent dans Railway,
   Vercel ou EAS. Ne jamais brancher un environnement local sur la base de production.
8. **Actions irréversibles** (suppression de projet, de service, de volume, de données) : demander d'abord.
9. **Registre des demandes** : mettre à jour `docs/PASSATION.md` § 11 à chaque nouvelle série de demandes.

## Repères rapides

- API : `backend/` (Express, Prisma, PostgreSQL, Socket.io). Migrations appliquées au démarrage.
- Console Dispatch : `apps/dispatch-web/` (React + Vite).
- Apps Chauffeur et Client : `apps/driver-app/`, `apps/client-app/` (Expo SDK 51, aussi publiées en web).
- Fuseau horaire de référence : `America/Toronto`.
- Domaine : `taxisylvain.ca` chez Vercel. Adresses officielles `dispatch.`, `chauffeur.`, `client.` et
  `api.taxisylvain.ca`. Toute nouvelle adresse web doit être ajoutée à `CORS_ORIGIN` dans Railway.
