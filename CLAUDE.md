# Taxi Sylvain — transfert pour Claude Code

Ce document est la version de travail pour continuer le projet dans Claude Code.

## 1) Documents de référence obligatoires

Toujours lire avant toute modification :

- `AGENTS.md`
- `docs/PASSATION.md`
- `backend/.env.example`

Important : ce dépôt contient des informations de production réelles, mais aucune clé secrète n’est stockée dans le repo.

## 2) Contexte du projet

Projet : Taxi Sylvain

- API backend : `backend/`
- Dispatch web : `apps/dispatch-web/`
- App chauffeur : `apps/driver-app/`
- App client : `apps/client-app/`
- Déploiement web : Vercel + Railway
- Base de données : PostgreSQL via Prisma
- Réseau temps réel : Socket.io
- Push notification : Expo Push / Firebase à finaliser

Le projet est déjà en état de production web fonctionnel et vérifié.

## 3) Règles de travail à respecter

1. Répondre en français.
2. Preuve avant annonce : avant de dire que c’est corrigé, exécuter :
   ```bash
   cd backend && npm test
   node scripts/verifier-mise-en-ligne.mjs
   ```
3. Une règle métier demandée = un test.
4. Ne pas reconstruire les APK Android/iOS sans accord explicite du propriétaire.
5. Pour l’app client Vercel, faire `vercel alias set` après `vercel --prod`.
6. Lancer Railway depuis `backend/` uniquement.
7. Ne jamais committer de secrets ni de fichiers Firebase locals.
8. Les actions irréversibles doivent être confirmées au préalable avec le propriétaire.

## 4) État réel du projet au 18 septembre 2026

### En ligne et vérifié
- API backend répond correctement
- Dispatch web est en ligne
- App chauffeur web est en ligne
- App client web est en ligne
- Script de vérification de mise en ligne est vert

### Fonctionnellement
- Basique backend + apps web + flux métiers principaux déjà en place
- Messages, courses, calendrier, statuts, notation, app mobile/web, suivi GPS, rappels, exports, groupes, etc.
- Les règles métiers sont déjà couvertes par tests backend

### Ce qui reste prioritaire
L’ordre de priorité demandé par le propriétaire est strict :

1. Firebase / notifications push
2. Finalisation avec les fournisseurs
3. Suppression de compte + conformité magasins

## 5) Priorité actuelle

### Partie 1 — Firebase / notifications push
À compléter selon le besoin de production :

- créer le projet Firebase
- ajouter les apps `com.taxisylvain.driver` et `com.taxisylvain.client`
- charger `google-services.json` et `GoogleService-Info.plist` localement
- préparer la clé FCM V1 / service account
- tester les envois push / Expo
- recompiler si le propriétaire donne l’accord

Le dépôt est désormais préparé pour le bon emplacement des fichiers Firebase, via :

- `apps/driver-app/app.json`
- `apps/client-app/app.json`
- `.gitignore`
- `docs/FIREBASE-PUSH.md`
- `backend/test/firebaseConfig.test.js`

### Partie 2 — Finalisation fournisseurs
À prévoir dès que la partie push est OK :

- Brevo / domaine / validation courriels
- Twilio / appel masqué
- Expo / EAS / APK preview
- Apple Developer / TestFlight
- Google Play / disponibilité
- GitHub / dépôt privé
- nom de domaine public

### Partie 3 — Suppression de compte + conformité magasin
- page de suppression de compte dans les apps et web
- politique de confidentialité
- conditions d’utilisation ou docs magasin
- captures et formulaires Google/Apple

## 6) Fichiers clés à connaître

- `AGENTS.md` — consignes de base du projet
- `docs/PASSATION.md` — document central de reprise
- `docs/FIREBASE-PUSH.md` — préparation Firebase
- `backend/src/lib/push.js` — logique d’envoi Expo Push
- `backend/src/routes/auth.js` — enregistrement du jeton push
- `apps/driver-app/src/lib/pushNotifications.js` — enregistrement du token côté app
- `apps/client-app/src/lib/pushNotifications.js` — même logique côté client
- `backend/test/*.test.js` — tests métier et de base

## 7) Commandes de vérification avant toute annonce

Toujours utiliser :

```bash
cd backend && npm test
node scripts/verifier-mise-en-ligne.mjs
```

Pour le déploiement :

```bash
cd backend
railway up --service backend --detach
```

Pour Vercel :

```bash
cd apps/client-app
vercel --prod --yes
vercel alias set <adresse-du-nouveau-deploiement> taxi-sylvain-client.vercel.app
```

## 8) Pièges connus qu’il faut absolument éviter

- ne pas annoncer un correctif sans preuve
- ne pas relancer une compilation APK sans approbation du propriétaire
- ne pas oublier `vercel alias set` pour l’app client
- ne pas mettre de secrets dans le code
- ne pas lancer des builds ou des services sur la base de production
- ne pas modifier le comportement métier sans ajouter ou mettre à jour un test

## 9) Etat de la progression actuelle

- Audit et revue de priorité : fait
- Projet en place et vérifié : fait
- Firebase / push : préparation technique faite, configuration réelle à compléter côté comptes/providers
- Fournisseurs : à lancer
- Suppression de compte + conformité : à faire

## 10) Objet de travail pour la prochaine session Claude Code

Continuer exactement dans l’ordre :

1. finaliser Firebase / push notifications avec les projets et clés réelles
2. finaliser les fournisseurs et comptes de production
3. terminer la suppression de compte + conformité app stores

Ne pas inventer de nouvelles fonctionnalités tant que la priorisation production n’est pas terminée.

## 11) Lien de départ recommandé

Commencer par :

- `AGENTS.md`
- `docs/PASSATION.md`
- `docs/FIREBASE-PUSH.md`
- `backend/src/lib/push.js`
- `backend/src/routes/auth.js`

Ensuite, ouvrir la suite des tâches de fournisseurs et de conformité selon la demande du propriétaire.
