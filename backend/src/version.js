// Version du code du serveur, exposée par /health/ready (sans aucune donnée personnelle).
// À changer à CHAQUE modification du serveur qui part en production : la surveillance
// (scripts/verifier-mise-en-ligne.mjs) compare cette valeur à celle du dépôt et signale un serveur
// resté sur une ancienne version (audit du 7 octobre 2026, OPS-04).
export const VERSION_SERVEUR = "2026-10-07.audit";
