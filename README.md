# Taxi Sylvain — Plateforme Dispatch / Chauffeur / Client

Monorepo contenant le code source de départ pour les 3 applications demandées :

- `backend/` — API REST + temps réel (Node.js, Express, Prisma, PostgreSQL, Socket.io)
- `apps/dispatch-web/` — console web pour Taxi Sylvain (React + Vite)
- `apps/driver-app/` — application chauffeur (React Native / Expo)
- `apps/client-app/` — application client (React Native / Expo)
- `docs/ARCHITECTURE.md` — stack, hébergement, intégration Maps/Waze, distribution hors App Store/Play Store

## Statut de ce code

Ceci est une **base de départ fonctionnelle et cohérente**, pas un produit fini prêt pour la production :
- La logique métier centrale (courses, affectation, statuts, messagerie, notation, rapports) est implémentée et reliée de bout en bout (API ↔ web ↔ mobile ↔ temps réel).
- Certaines intégrations tierces (Maps/Waze réels, paiement, masquage d'appel téléphonique, notifications push) sont câblées avec des points d'ancrage clairs (`TODO`) mais nécessitent vos propres clés API / comptes fournisseurs pour fonctionner réellement.
- Le code n'a pas pu être exécuté ni testé dans cet environnement (pas d'accès réseau pour installer les dépendances) — un développeur doit l'installer et le valider avant mise en production.

## Démarrage rapide (à faire sur votre machine ou un serveur, pas ici)

```bash
# 1. Backend
cd backend
cp .env.example .env   # renseigner DATABASE_URL, JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run dev             # démarre l'API sur http://localhost:4000

# 2. Console Dispatch (web)
cd ../apps/dispatch-web
npm install
npm run dev              # http://localhost:5173

# 3. App Chauffeur / App Client (Expo)
cd ../apps/driver-app   # puis apps/client-app
npm install
npx expo start
```
