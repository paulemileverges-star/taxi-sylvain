# Firebase push notifications — préparation production

Ce projet est déjà prêt pour la logique de notification push côté app et côté API via Expo Push / Firebase.

## Ce que le dépôt garde propre

Les fichiers secrets Firebase ne doivent jamais être commités :

- `apps/driver-app/google-services.json`
- `apps/client-app/google-services.json`
- `apps/driver-app/GoogleService-Info.plist`
- `apps/client-app/GoogleService-Info.plist`
- `firebase-service-account.json`

Ils sont déjà ignorés dans la racine du dépôt par `.gitignore`.

## Ce qui est prêt dans le code

Les apps Expo pointent vers les fichiers Firebase locaux par `app.json` :

- `android.googleServicesFile`: `./google-services.json`
- `ios.googleServicesFile`: `./GoogleService-Info.plist`

La logique de push est déjà en place dans :

- `apps/driver-app/src/lib/pushNotifications.js`
- `apps/client-app/src/lib/pushNotifications.js`
- `backend/src/lib/push.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/rides.js`

## Étapes à faire par le propriétaire

1. Créer le projet Firebase avec les apps Android/iOS :
   - `com.taxisylvain.driver`
   - `com.taxisylvain.client`
2. Télécharger le fichier `google-services.json` pour chaque app et le placer localement dans le bon dossier.
3. Télécharger le fichier `GoogleService-Info.plist` pour chaque app et le placer localement dans le bon dossier.
4. Vérifier le projet dans Expo/EAS avec le bon `projectId` déjà configuré dans `app.json`.
5. Ajouter la clé FCM V1 / service account côté EAS ou Firebase selon la procédure de production.
6. Recompiler les APK ou les builds avec l’accord explicite du propriétaire.

## Points de sécurité

- Ne jamais copier les clés Firebase dans le dépôt Git.
- Ne jamais brancher le code local sur la base de production.
- Ne pas relancer les APK tant que le propriétaire n’a pas validé le build.
