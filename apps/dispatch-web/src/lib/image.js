// Réduit une photo avant envoi (max 1600 px, JPEG ~85 %). Les photos de téléphone font souvent
// 5 à 12 Mo, parfois en HEIC illisible par un navigateur : recompresser côté navigateur garantit
// un fichier léger et affichable partout. Si le navigateur ne sait pas décoder l'image, on
// renvoie le fichier d'origine et le serveur tranchera.
export async function prepareImageForUpload(file, maxSize = 1600) {
  if (!file || !/^image\//.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
