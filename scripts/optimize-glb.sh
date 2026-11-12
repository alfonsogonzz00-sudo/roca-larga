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
# Sólo se simplifica la malla si viene muy densa (Meshy «high poly»); las de ~30k se dejan tal cual
tris=$(node --input-type=module -e "import{NodeIO}from'@gltf-transform/core';import{ALL_EXTENSIONS}from'@gltf-transform/extensions';const d=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[1]);let n=0;for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())n+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;console.log(Math.round(n))" "$tmp/w.glb")
if [ "$tris" -gt 150000 ]; then $gt simplify "$tmp/w.glb" "$tmp/s.glb" --ratio 0.18 --error 0.0003; else cp "$tmp/w.glb" "$tmp/s.glb"; fi
node "$(dirname "$0")/crop-atlas.mjs" "$tmp/s.glb" "$tmp/c.glb"
# Texturas a 2048 como máximo (memoria del móvil y recoloreado rápido); las franjas recortadas no cambian
$gt resize "$tmp/c.glb" "$tmp/r.glb" --width 2048 --height 4096
$gt webp "$tmp/r.glb" "$tmp/t.glb" --quality 90
$gt quantize "$tmp/t.glb" "$base.glb"
node "$(dirname "$0")/build-kit-map.mjs" "$base.glb" "$base-map.png"
rm -rf "$tmp"; ls -lh "$base.glb" "$base-map.png" "$base-base.webp"
