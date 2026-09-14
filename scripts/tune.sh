#!/usr/bin/env bash
# Balaye une constante d'évaluation de l'IA et mesure son effet.
# Chaque variante affronte le même adversaire de référence sur les mêmes donnes.
#   ./scripts/tune.sh tempo 0.10 0.22 0.35 0.50
set -euo pipefail

KEY="$1"; shift
FILE="src/lib/azteque/engine.ts"
BACKUP="$(mktemp)"
cp "$FILE" "$BACKUP"
trap 'cp "$BACKUP" "$FILE"; rm -f "$BACKUP"' EXIT

ORIG=$(grep -E "^  $KEY: " "$FILE" | sed -E "s/^  $KEY: ([0-9.]+),.*/\1/")
echo "== $KEY (valeur actuelle : $ORIG) =="

for v in "$@"; do
  sed -i -E "s/^  $KEY: [0-9.]+,/  $KEY: $v,/" "$FILE"
  line=$(timeout 280 bun scripts/ai-bench.ts expert old:grand_maitre 300 2>&1 | tail -1)
  pts=$(echo "$line" | sed -E 's/.*pts +([0-9.]+) \/ +([0-9.]+).*/\1 \2/')
  win=$(echo "$line" | sed -E 's/.*victoires +([0-9.]+)%.*/\1/')
  diff=$(awk -v p="$pts" 'BEGIN{split(p,a," "); printf "%+.2f", a[1]-a[2]}')
  printf "  %-6s → victoires %5s%%   écart de points %s\n" "$v" "$win" "$diff"
  cp "$BACKUP" "$FILE"
done
