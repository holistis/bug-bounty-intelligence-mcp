#!/bin/bash
# Draait de scan (versie 2.1, testkopie die het rapport lokaal wegschrijft) op elke wedstrijd van een set, een voor een.
# Varianten: h0 = zonder het blok historische patronen (knowledge/3ilm), h1 = met dat blok, zoals de productieserver.
#   bash draai-basis.sh <h0|h1> <lijst-met-wedstrijden.txt> <voorvoegsel>
V=$1; LIJST=$2; VOOR=$3
W=/tmp/bench/$V
mkdir -p $W/scripts $W/data/bug-intel-reports $W/out
cp /tmp/bench/common/bug-intel-runner.mjs /tmp/bench/common/bug-intel-scope.mjs $W/scripts/
cp /app/euler-liquidator/data/bug-intel-patterns.json $W/data/
python3 /tmp/bench/common/test-env2.py $W/.env
if [ "$V" = "h1" ]; then ln -sfn /app/euler-liquidator/knowledge $W/knowledge; else rm -f $W/knowledge; fi
: > $W/data/bug-intel-queue.jsonl
: > $W/out/run.log
cd $W
while read -r c; do
  [ -z "$c" ] && continue
  id=${VOOR}-${V}-${c}
  printf '%s\n' "{\"jobId\":\"$id\",\"ts\":$(date +%s%3N),\"status\":\"queued\",\"repo\":\"sherlock-audit/$c\"}" >> data/bug-intel-queue.jsonl
  echo "=== start $id $(date -u +%FT%TZ)" >> out/run.log
  timeout 2700 node scripts/bug-intel-runner.mjs $id > out/$id.log 2>&1
  echo "=== klaar $id exit=$? $(date -u +%FT%TZ)" >> out/run.log
done < "$LIJST"
echo "=== ALLES KLAAR $V $(date -u +%FT%TZ)" >> out/run.log
