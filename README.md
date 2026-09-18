# Taxi Sylvain — Plateforme Dispatch / Chauffeur / Client

> **Reprise du projet** : lire `AGENTS.md` puis `docs/PASSATION.md` avant toute modification.

Monorepo contenant le code des 3 applications :

- `backend/` — API REST + temps réel (Node.js, Express, Prisma, PostgreSQL, Socket.io)
- `apps/dispatch-web/` — console web pour Taxi Sylvain (React + Vite)
- `apps/driver-app/` — application chauffeur (React Native / Expo)
- `apps/client-app/` — application client (React Native / Expo)
- `docs/ARCHITECTURE.md` — stack, hébergement, intégration Maps/Waze, distribution hors App Store/Play Store

## Statut de ce code

Plateforme **déployée et en usage** :
- API + base de données : Railway (`backend/`, `npm start` applique les migrations Prisma puis démarre le serveur).
- Console Dispatch : https://taxi-sylvain-dispatch.vercel.app
- App Chauffeur (web) : https://taxi-sylvain-driver.vercel.app — APK Android via EAS Build (profil `preview`).
- App Client (web) : https://taxi-sylvain-client.vercel.app — APK Android via EAS Build (profil `preview`).

Intégrations optionnelles qui dépendent d'un compte fournisseur (voir `docs/ARCHITECTURE.md`) : masquage d'appel (Twilio Proxy), notifications push Android (Firebase Cloud Messaging à configurer sur EAS), publication sur les stores.

## Démarrage rapide (développement local)

```bash
# 1. Backend
cd backend
cp .env.example .env   # renseigner DATABASE_URL, JWT_SECRET
npm install
npx prisma migrate dev
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
