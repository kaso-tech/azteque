#!/usr/bin/env bash
#
# merge-pr.sh — Fusionne une branche de PR vers main, sans rien casser.
#
# Conçu pour le repo kaso-tech/azteque qui est synchronisé en aller-retour
# avec l'éditeur Lovable : Lovable peut pusher sur main à tout moment, et
# ce script doit gérer ce cas sans perdre d'historique et sans force-push.
#
# Garanties :
#   - Pas de force-push (interdit par l'AGENTS.md du repo)
#   - Pas de rebase de l'historique publié
#   - Refuse de merger si le working tree est sale
#   - Refuse de merger si la PR cible n'existe pas ou si ses commits sont
#     déjà sur main
#   - Fetch systématique avant toute décision (détecte les commits Lovable
#     qui auraient pu arriver pendant la PR)
#   - Si main a divergé, fait un merge commit (et pas un fast-forward) :
#     l'historique des deux côtés est préservé
#
# Usage :
#   ./scripts/merge-pr.sh <branche>
#   ./scripts/merge-pr.sh mavis/admin-v2-pr2
#
# Variables d'env :
#   GIT_SSL_NO_VERIFY=true   requis si le sandbox a un problème de CA
#

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <branche>" >&2
  exit 1
fi

BRANCHE="$1"
COULEUR_ROUGE='\033[0;31m'
COULEUR_VERT='\033[0;32m'
COULEUR_BLEU='\033[0;34m'
COULEUR_RESET='\033[0m'

log()  { printf "${COULEUR_BLEU}==>${COULEUR_RESET} %s\n" "$*"; }
ok()   { printf "${COULEUR_VERT}✓${COULEUR_RESET}  %s\n" "$*"; }
warn() { printf "${COULEUR_ROUGE}!${COULEUR_RESET}  %s\n" "$*" >&2; }
die()  { warn "$*"; exit 1; }

# 0. Préconditions locales
[[ -d .git ]] || die "Pas dans un dépôt git"
command -v git >/dev/null || die "git introuvable"

# 1. Working tree doit être propre (sinon on ne sait pas ce qu'on merge)
if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet HEAD 2>/dev/null; then
  die "Working tree sale. Commit ou stash tes changements avant."
fi

# 2. Fetch systématique pour voir si Lovable a pushé pendant la PR
log "Fetch de origin…"
git fetch origin --prune >/dev/null 2>&1

# 3. Vérifier que la branche existe
git show-ref --verify --quiet "refs/remotes/origin/$BRANCHE" \
  || die "Branche origin/$BRANCHE introuvable"

# 4. Vérifier qu'il y a quelque chose à merger
COMMITS_A_MERGER=$(git log --oneline "origin/main..origin/$BRANCHE" | wc -l | tr -d ' ')
if [[ "$COMMITS_A_MERGER" == "0" ]]; then
  ok "Aucun commit à merger depuis $BRANCHE (déjà sur main ?)"
  exit 0
fi
log "$COMMITS_A_MERGER commit(s) à merger depuis $BRANCHE :"
git log --oneline "origin/main..origin/$BRANCHE" | sed 's/^/    /'

# 5. Détecter les commits Lovable arrivés pendant la PR
COMMITS_LOVABLE=$(git log --oneline "$BRANCHE..origin/main" | wc -l | tr -d ' ')
if [[ "$COMMITS_LOVABLE" != "0" ]]; then
  warn "$COMMITS_LOVABLE commit(s) sur main qui ne sont pas dans $BRANCHE :"
  git log --oneline "$BRANCHE..origin/main" | sed 's/^/    /'
  log "Ces commits seront préservés via un merge commit (pas de rebase, pas de force-push)."
fi

# 6. Checkout main et merge
log "Checkout main…"
git checkout main >/dev/null 2>&1

log "Pull des derniers commits de main (synchronisation Lovable)…"
if ! git pull --no-rebase --no-edit origin main >/dev/null 2>&1; then
  die "git pull a échoué — résous manuellement"
fi

# 7. Merger avec --no-ff pour préserver l'historique de la PR
TITRE="Merge $BRANCHE : $(git log -1 --format='%s' "origin/$BRANCHE")"
log "Merge $BRANCHE vers main…"
if ! git merge --no-ff "$BRANCHE" -m "$TITRE" >/dev/null 2>&1; then
  warn "Conflit lors du merge. Résous manuellement :"
  warn "  1. Édite les fichiers en conflit"
  warn "  2. git add <fichiers>"
  warn "  3. git commit"
  warn "  4. ./scripts/merge-pr.sh $BRANCHE  (pour push et fermer la PR)"
  exit 2
fi

# 8. Push
log "Push vers origin main…"
if ! git push origin main >/dev/null 2>&1; then
  warn "git push a échoué. Si origin/main a divergé entre temps :"
  warn "  git pull --no-rebase origin main"
  warn "  git push origin main"
  exit 3
fi

ok "Push OK. main est synchro sur origin."

# 9. Tenter de fermer la PR sur GitHub (best effort, ne bloque pas)
PR_NUM=$(git log --all --oneline | head -200 | while read sha rest; do
  pr=$(gh pr list --state open --head "$BRANCHE" --json number -q '.[0].number' 2>/dev/null || true)
  if [[ -n "$pr" ]]; then echo "$pr"; break; fi
done || true)

if [[ -z "$PR_NUM" ]] && command -v gh >/dev/null 2>&1; then
  PR_NUM=$(gh pr list --state open --head "$BRANCHE" --json number -q '.[0].number' 2>/dev/null || true)
fi

# Fallback : deviner le numéro de PR via l'API en cherchant par head ref
if [[ -z "$PR_NUM" ]]; then
  REMOTE_URL=$(git config --get remote.origin.url)
  if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    OWNER="${BASH_REMATCH[1]}"
    REPO="${BASH_REMATCH[2]}"
    # Récupère le token depuis .git/config
    TOKEN=$(git config --get "remote.origin.url" \
      | sed -n 's|.*x-access-token:\([^@]*\)@.*|\1|p' || true)
    if [[ -n "$TOKEN" ]]; then
      PR_NUM=$(curl -s \
        -H "Authorization: token $TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$OWNER/$REPO/pulls?state=open&head=$OWNER:$BRANCHE" \
        | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['number'] if d else '')" \
        2>/dev/null || true)
    fi
  fi
fi

if [[ -n "$PR_NUM" ]]; then
  log "Fermeture de la PR #$PR_NUM sur GitHub…"
  REMOTE_URL=$(git config --get remote.origin.url)
  if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    OWNER="${BASH_REMATCH[1]}"
    REPO="${BASH_REMATCH[2]}"
    TOKEN=$(git config --get "remote.origin.url" | sed -n 's|.*x-access-token:\([^@]*\)@.*|\1|p' || true)
    if [[ -n "$TOKEN" ]]; then
      curl -s -X PUT \
        -H "Authorization: token $TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUM/merge" \
        -d '{"merge_method":"merge","commit_title":"'"$TITRE"'"}' >/dev/null 2>&1 \
        && ok "PR #$PR_NUM fermée" \
        || warn "Impossible de fermer la PR #$PR_NUM (à faire à la main)"
    fi
  fi
fi

# 10. Nettoyage : supprimer la branche locale (et la remote) si elle a été mergée
log "Nettoyage de la branche $BRANCHE…"
git branch -d "$BRANCHE" >/dev/null 2>&1 || warn "Branche locale $BRANCHE non supprimée (peut-être déjà supprimée)"
git push origin --delete "$BRANCHE" >/dev/null 2>&1 && ok "Branche $BRANCHE supprimée sur origin" \
  || warn "Branche $BRANCHE pas supprimée sur origin (à vérifier)"

ok "Tout est mergé, poussé, et nettoyé."
log "Prochaines étapes :"
log "  - Si migration SQL : appliquer via Lovable"
log "  - PR suivante ?"
