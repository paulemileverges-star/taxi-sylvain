import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Veille d'une console restée ouverte longtemps (8 octobre 2026). Le 7 octobre, un iPad ouvert avant
// la publication de midi tournait encore sur l'ancienne version à 17 h, et ses écrans ne se mettaient
// plus à jour : la saisie au clavier marchait, mais rien de ce qui suit une réponse du serveur ne
// s'affichait (liste des clients vide, fenêtre « Nouveau client » jamais refermée, refus « existe
// déjà » jamais montrés). Le serveur avait pourtant créé les fiches.
//
//   - Affichage figé : au retour sur l'onglet et chaque minute, une mise à jour lancée hors d'un clic
//     (le chemin des réponses du serveur) doit s'afficher en moins de 5 secondes, sinon la console
//     demande d'être rechargée.
//   - Nouvelle version en ligne : au retour sur l'onglet et toutes les 10 minutes, la console compare
//     son propre fichier à celui que sert le site, et propose de recharger.
//   - Page restaurée depuis le cache de navigation du navigateur : rechargée d'office.
//
// Le bandeau est construit hors de React : il doit apparaître même quand React n'affiche plus rien.

const ID_BANDEAU = "bandeau-recharger";

function afficherBandeau(texte) {
  if (document.getElementById(ID_BANDEAU)) return;
  const bandeau = document.createElement("div");
  bandeau.id = ID_BANDEAU;
  bandeau.setAttribute("role", "alert");
  bandeau.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:10000;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;padding:12px 16px;background:#f5a623;color:#111;font:600 15px system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.4)";
  const message = document.createElement("span");
  message.textContent = texte;
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.textContent = "Recharger la console";
  bouton.style.cssText = "padding:8px 16px;border:0;border-radius:8px;background:#111;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer";
  bouton.addEventListener("click", () => window.location.reload());
  bandeau.append(message, bouton);
  document.body.appendChild(bandeau);
}

// Fichier principal de la console : celui de la page ouverte, puis celui que sert le site. En
// développement (Vite), « /src/main.jsx » des deux côtés : jamais de bandeau.
const scriptPrincipal = (doc) => doc.querySelector('script[type="module"][src]')?.getAttribute("src") || null;

async function nouvelleVersionEnLigne() {
  const courant = scriptPrincipal(document);
  if (!courant) return false;
  try {
    const res = await fetch(`/?verification=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return false;
    const enLigne = scriptPrincipal(new DOMParser().parseFromString(await res.text(), "text/html"));
    return Boolean(enLigne) && enLigne !== courant;
  } catch {
    return false; // hors ligne : nouvel essai au prochain passage
  }
}

export default function VeilleConsole() {
  const [battement, setBattement] = useState(0);
  // Noté au moment où React met réellement l'écran à jour.
  const affiche = useRef(0);
  useLayoutEffect(() => { affiche.current = battement; }, [battement]);

  useEffect(() => {
    let attente = null;
    const visible = () => document.visibilityState === "visible" && !document.getElementById(ID_BANDEAU);
    const verifierAffichage = () => {
      if (!visible()) return;
      clearTimeout(attente);
      const attendu = Date.now();
      setTimeout(() => setBattement(attendu), 0);
      // Deux temps : après une fenêtre de confirmation restée ouverte ou un onglet endormi, les
      // minuteries partent toutes en retard, avant que React ait eu son tour. La seconde échéance,
      // posée après coup, lui laisse ce tour : seul un affichage réellement figé déclenche le bandeau.
      attente = setTimeout(() => {
        if (affiche.current === attendu) return;
        attente = setTimeout(() => {
          if (visible() && affiche.current !== attendu) {
            afficherBandeau("L'affichage de la console ne se met plus à jour.");
          }
        }, 1000);
      }, 5000);
    };
    const verifierVersion = async () => {
      if (visible() && (await nouvelleVersionEnLigne())) afficherBandeau("Une nouvelle version de la console est en ligne.");
    };
    const auRetour = () => { verifierAffichage(); verifierVersion(); };
    const depuisLeCache = (e) => { if (e.persisted) window.location.reload(); };

    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("pageshow", depuisLeCache);
    const minuteAffichage = setInterval(verifierAffichage, 60 * 1000);
    const minuteVersion = setInterval(verifierVersion, 10 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("pageshow", depuisLeCache);
      clearInterval(minuteAffichage);
      clearInterval(minuteVersion);
      clearTimeout(attente);
    };
  }, []);

  return null;
}
