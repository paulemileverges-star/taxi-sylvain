// La configuration de l'application reste dans app.json. Ce fichier ne sert qu'à une chose :
// les fichiers Firebase sont exclus du code enregistré (.gitignore), donc Expo ne les emporte pas
// sur ses serveurs de compilation. Ils y arrivent à la place par deux variables d'environnement de
// type fichier, créées une fois pour toutes dans le projet Expo :
//   GOOGLE_SERVICES_JSON       -> google-services.json (Android)
//   GOOGLE_SERVICE_INFO_PLIST  -> GoogleService-Info.plist (iPhone)
// Sans ces variables, par exemple en local, on garde les fichiers rangés à côté de app.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || config.android.googleServicesFile,
  },
  ios: {
    ...config.ios,
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST || config.ios.googleServicesFile,
  },
});
