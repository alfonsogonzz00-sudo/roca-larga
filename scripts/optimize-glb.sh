#!/usr/bin/env bash
# Prepara un modelo de Meshy para la app: ≈20 MB → ≈2-3 MB sin pérdida visible,
# más el mapa de zonas para personalizar botas, medias y dorsal.
# Uso: scripts/optimize-glb.sh entrada.glb public/players/<id-del-jugador>
#   → public/players/<id>.glb, <id>-map.png y <id>-base.webp
# Sin meshopt/draco: model-viewer necesitaría descargar decodificadores externos.
set -euo pipefail
in="$1"; base="$2"; tmp="$(mktemp -d)"
gt="npx -y @gltf-transform/cli@4.1.1"
$gt weld "$in" "$tmp/w.glb"
$gt simplify "$tmp/w.glb" "$tmp/s.glb" --ratio 0.18 --error 0.0003
node "$(dirname "$0")/crop-atlas.mjs" "$tmp/s.glb" "$tmp/c.glb"
$gt webp "$tmp/c.glb" "$tmp/t.glb" --quality 90
$gt quantize "$tmp/t.glb" "$base.glb"
node "$(dirname "$0")/build-kit-map.mjs" "$base.glb" "$base-map.png"
rm -rf "$tmp"; ls -lh "$base.glb" "$base-map.png" "$base-base.webp"
