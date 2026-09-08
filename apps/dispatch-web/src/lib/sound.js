// Notifications sonores — synthétisées directement (API Web Audio), aucun fichier à charger.
// "notify" = un évènement arrive (message reçu, statut de course, nouveau rapport...)
// "action"  = confirmation d'une action que l'utilisateur vient de faire (message envoyé, course créée...)

let ctx;
function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(audioCtx, freq, startTime, duration, gainValue) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.012);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

const PATTERNS = {
  notify: (audioCtx, t) => {
    tone(audioCtx, 880, t, 0.11, 0.18);
    tone(audioCtx, 1175, t + 0.13, 0.15, 0.18);
  },
  action: (audioCtx, t) => {
    tone(audioCtx, 660, t, 0.07, 0.14);
  },
  alert: (audioCtx, t) => {
    tone(audioCtx, 988, t, 0.09, 0.2);
    tone(audioCtx, 988, t + 0.15, 0.09, 0.2);
    tone(audioCtx, 988, t + 0.3, 0.13, 0.2);
  },
};

export function playSound(type = "notify") {
  try {
    const audioCtx = getContext();
    const pattern = PATTERNS[type] || PATTERNS.notify;
    pattern(audioCtx, audioCtx.currentTime);
  } catch {
    // Autoplay bloqué ou API indisponible — on ignore silencieusement.
  }
}
