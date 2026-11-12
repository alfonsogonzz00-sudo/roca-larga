#!/usr/bin/env bash
# Optimiza un modelo de Meshy para la app (≈20 MB → ≈3 MB, sin pérdida visible).
# Uso: scripts/optimize-glb.sh entrada.glb salida.glb
# Sin meshopt/draco: model-viewer necesitaría descargar decodificadores externos.
set -euo pipefail
in="$1"; out="$2"; tmp="$(mktemp -d)"
npx -y @gltf-transform/cli@4.1.1 weld "$in" "$tmp/w.glb"
npx -y @gltf-transform/cli@4.1.1 simplify "$tmp/w.glb" "$tmp/s.glb" --ratio 0.18 --error 0.0003
npx -y @gltf-transform/cli@4.1.1 webp "$tmp/s.glb" "$tmp/t.glb" --quality 90
npx -y @gltf-transform/cli@4.1.1 quantize "$tmp/t.glb" "$out"
rm -rf "$tmp"; ls -lh "$out"
