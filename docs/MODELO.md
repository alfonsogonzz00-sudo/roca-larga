# Motor predictivo (`src/lib/stats/model.ts`)

Modelo cuantitativo, determinista y explicable. No usa IA generativa ni números aleatorios.

## 1. Goles esperados por equipo

Para el equipo A contra B:

```
log λ_A = log μ + Σ_f  w_f · ½ · (ataque_A,f + defensa_B,f)
```

- **μ**: media de goles por equipo y partido de todo el histórico.
- **w_f**: peso configurado del factor *f*, normalizado para que los activos sumen 1.
- **ataque_A,f = log(GF̃_A,f / μ)**, **defensa_B,f = log(GC̃_B,f / μ)**, donde GF̃/GC̃ son goles a favor/en contra observados en el subconjunto del factor, *contraídos* hacia la media.

Equivale a una media geométrica ponderada de lo que «dice» cada factor sobre la tasa de goles: con todos los factores neutros, λ = μ.

## 2. Contracción por tamaño de muestra

```
x̃ = (Σ wᵢ·xᵢ + k·prior) / (Σ wᵢ + k)        fiabilidad s_f = n_f / (n_f + k)
```

Dos partidos en un estadio mueven poco el pronóstico; veinte lo mueven casi todo. `k` es configurable por tipo de factor en *Administración → Estadísticas → Parámetros del motor* (`k_pair`, `k_venue`, `k_recent`, `k_context`, `k_team`, `k_player`).

## 3. Factores

| Factor | Subconjunto del histórico | Prior |
|---|---|---|
| Composición · compañeros (30 %) | Partidos en que coincidieron jugadores de la alineación; peso = fracción de parejas de la alineación presentes | μ |
| Composición · rivales (20 %) | Partidos en que estos jugadores se enfrentaron a estos rivales; peso = (coincidencias propias × rivales)/(7×7) | μ |
| Histórico en el estadio (20 %) | Todos los partidos del equipo en el estadio | μ |
| Tres últimos partidos (10 % / 12,5 %) | Últimos 3 del equipo | μ |
| Tres últimos en el estadio (10 % / 7,5 %) | Últimos 3 del equipo en el estadio | μ |
| Clima o temperatura (7,5 %) | Mismo clima (y ±6 °C) o, sin clima, ±4 °C | nivel propio del equipo |
| Horario (2,5 %) | Inicio a ±1 h | nivel propio del equipo |

Pesos del próximo partido (7.1) y de simulaciones (7.2) se guardan por separado.

## 4. Resultado

Dos Poisson independientes (λ_A, λ_B) → matriz de marcadores 0–20 → P(victoria/empate/derrota) y marcador más probable.

**Goleadores y asistentes probables**: λ del equipo repartido según la tasa individual contraída de goles (y de asistencias × proporción histórica de goles asistidos). P(marcar) = 1 − e^(−xG).

**Actuación individual**: la tasa base del jugador (goles, asistencias, valoración, % victorias) se ajusta con los mismos factores medidos sobre *sus* partidos (con esos compañeros, contra esos rivales, en ese estadio…). Compañeros y rivales son opcionales: si no se indican, ese factor no influye.

## 5. Confianza

`score = Σ w_f · s_f × N/(N+5)`. Niveles: insuficiente (N < mínimo), baja (< 0,30), media (< 0,55), alta. La interfaz muestra advertencias y, para cada factor, peso configurado, peso efectivo, observaciones y a quién favorece.

## 6. Reproducibilidad y aprendizaje

- El pronóstico de un partido usa **sólo partidos anteriores a su fecha**, así que siempre da lo mismo y se puede ver «lo que se habría pronosticado».
- Cada partido finalizado (o histórico) entra automáticamente en el cálculo: no hay entrenamiento aparte.
- *Administración → Estadísticas* incluye una validación retrospectiva (acierto 1X2, log-loss y Brier frente a un modelo ingenuo).

## 7. Valoración de actuaciones

`gol·1 + asistencia·0,75 + MVP·2 + victoria·0,5 + empate·0,2 + invitado traído·0,5` (configurable). Los goles encajados como portero no restan nunca.
