"use client";
import { useMemo, useState, useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { simulateIndividualAction, simulateMatchAction } from "@/app/actions/simulate";
import { Button, Card, Crest, Field, Input, Notice, Pill, Select, Stat, cx } from "@/components/ui";
import { Tabs } from "@/components/ui/client";
import { FactorTable, PredictionPanel } from "@/components/match/parts";
import { nowMs, num, pct } from "@/lib/format";
import type { IndividualPrediction, MatchPrediction } from "@/lib/stats/model";
import { WEATHER_LABELS, type Formation, type Player, type Team, type Venue } from "@/lib/types";

interface Common { teams: Team[]; players: Player[]; venues: Venue[]; formations: Formation[]; lowText: string; initialTab: number; initialPlayer?: string }

function Conditions({ v, set }: { v: Cond; set: (c: Cond) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div className="col-span-2"><Field label="Estadio" htmlFor="sv"><Select id="sv" value={v.venue_id} onChange={(e) => set({ ...v, venue_id: e.target.value })}><option value="">Cualquiera</option>{v.venues.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field></div>
      <Field label="Fecha" htmlFor="sd"><Input id="sd" type="date" value={v.date} onChange={(e) => set({ ...v, date: e.target.value })} /></Field>
      <Field label="Hora" htmlFor="st"><Input id="st" type="time" value={v.time} onChange={(e) => set({ ...v, time: e.target.value })} /></Field>
      <Field label="Clima" htmlFor="sw"><Select id="sw" value={v.weather} onChange={(e) => set({ ...v, weather: e.target.value })}><option value="">—</option>{Object.entries(WEATHER_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Temp. °C" htmlFor="stt"><Input id="stt" type="number" step={1} min={-20} max={55} value={v.temp} onChange={(e) => set({ ...v, temp: e.target.value })} /></Field>
    </div>
  );
}

interface Cond { venues: Venue[]; venue_id: string; date: string; time: string; weather: string; temp: string }

function useCond(venues: Venue[]) {
  return useState<Cond>(() => ({ venues, venue_id: "", date: new Date(nowMs() + 7 * 864e5).toISOString().slice(0, 10), time: "21:00", weather: "", temp: "" }));
}

function PickList({ title, players, value, onChange, max, disabled = [] }: { title: string; players: Player[]; value: string[]; onChange: (v: string[]) => void; max: number; disabled?: string[] }) {
  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full justify-between text-sm font-semibold"><span>{title}</span><span className="tabular text-ink-3">{value.length}/{max}</span></legend>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => {
          const on = value.includes(p.id);
          const dis = disabled.includes(p.id) || (!on && value.length >= max);
          return (
            <button key={p.id} type="button" aria-pressed={on} disabled={dis} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
              className={cx("min-h-10 rounded-full border px-3 text-sm transition disabled:opacity-40", on ? "border-pitch bg-pitch text-pitch-ink" : "border-line bg-surface text-ink-2")}>
              {p.nickname || p.full_name.split(" ")[0]} <span className={on ? "opacity-80" : "text-ink-3"}>{p.full_name.split(" ").slice(-1)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Simulators(props: Common) {
  return (
    <Tabs initial={props.initialTab} tabs={[
      { label: "Simulador de partido", content: <MatchSim {...props} /> },
      { label: "Simulador individual", content: <IndividualSim {...props} /> },
    ]} />
  );
}

function MatchSim({ teams, players, venues, formations, lowText }: Common) {
  const [cond, setCond] = useCond(venues);
  const [homeId, setHomeId] = useState(teams[0].id);
  const awayId = teams.find((t) => t.id !== homeId)!.id;
  const [hp, setHp] = useState<string[]>([]);
  const [ap, setAp] = useState<string[]>([]);
  const [hf, setHf] = useState(formations.find((f) => f.is_default)?.id ?? "");
  const [af, setAf] = useState(formations.find((f) => f.is_default)?.id ?? "");
  const [res, setRes] = useState<MatchPrediction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roster = (tid: string) => players.filter((p) => p.kind === "member" && p.team_id === tid && p.active);
  const pmap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const home = teams.find((t) => t.id === homeId)!, away = teams.find((t) => t.id === awayId)!;
  const run = () => start(async () => {
    setErr(null);
    const r = await simulateMatchAction({ ...cond, venues: undefined, temp: cond.temp === "" ? null : Number(cond.temp), home_team_id: homeId, away_team_id: awayId, home_players: hp, away_players: ap });
    if (r.ok) setRes(r.data); else setErr(r.error);
  });
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <Field label="Equipo local" htmlFor="sh">
          <Select id="sh" value={homeId} onChange={(e) => { setHomeId(e.target.value); setHp(ap); setAp(hp); setRes(null); }}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        </Field>
        <Conditions v={cond} set={setCond} />
        {[{ t: home, v: hp, set: setHp, f: hf, setF: setHf }, { t: away, v: ap, set: setAp, f: af, setF: setAf }].map(({ t, v, set, f, setF }) => (
          <div key={t.id} className="space-y-2 rounded-xl border border-line p-3" style={{ borderLeft: `4px solid ${t.primary_color}` }}>
            <div className="flex items-center gap-2"><Crest src={t.crest_url} name={t.name} size={24} /><span className="flex-1 font-semibold">{t.name}</span>
              <Select aria-label={`Formación de ${t.name}`} value={f} onChange={(e) => setF(e.target.value)} className="min-h-9 w-28 py-0 text-sm">{formations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
            </div>
            <PickList title="Jugadores" players={roster(t.id)} value={v} onChange={set} max={7} />
          </div>
        ))}
        <p className="text-xs text-ink-3">La formación no altera el cálculo (no hay datos suficientes para medir su efecto); se registra con la simulación.</p>
        <Button onClick={run} disabled={pending} className="w-full sm:w-auto"><FlaskConical size={18} /> {pending ? "Calculando…" : "Simular partido"}</Button>
        {err && <Notice tone="danger">{err}</Notice>}
      </Card>
      {res && <PredictionPanel p={res} home={home} away={away} players={pmap} lowText={lowText} />}
      {res?.players.length ? (
        <Card className="p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Rendimiento individual estimado</div>
          <ul className="divide-y divide-line">
            {[...res.players].sort((a, b) => b.expectedRating - a.expectedRating).map((x) => (
              <li key={x.playerId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">{pmap.get(x.playerId)?.full_name} <span className="text-ink-3">· {x.sample} PJ</span></span>
                <span className="tabular text-ink-2">{num(x.xGoals, 2)} G · {num(x.xAssists, 2)} A · <strong className="text-ink">{num(x.expectedRating, 2)}</strong> pts</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function IndividualSim({ teams, players, venues, lowText, initialPlayer }: Common) {
  const init = initialPlayer ? players.find((p) => p.id === initialPlayer && p.kind === "member") : undefined;
  const [cond, setCond] = useCond(venues);
  const [teamId, setTeamId] = useState(init?.team_id ?? teams[0].id);
  const [playerId, setPlayerId] = useState(init?.id ?? "");
  const [mates, setMates] = useState<string[]>([]);
  const [rivals, setRivals] = useState<string[]>([]);
  const [res, setRes] = useState<IndividualPrediction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roster = players.filter((p) => p.kind === "member" && p.team_id === teamId && p.active);
  const rivalRoster = players.filter((p) => p.kind === "member" && p.team_id && p.team_id !== teamId && p.active);
  const run = () => start(async () => {
    setErr(null);
    const r = await simulateIndividualAction({ ...cond, venues: undefined, temp: cond.temp === "" ? null : Number(cond.temp), team_id: teamId, player_id: playerId, teammates: mates, rivals });
    if (r.ok) setRes(r.data); else setErr(r.error);
  });
  const name = players.find((p) => p.id === playerId)?.full_name;
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Equipo" htmlFor="it"><Select id="it" value={teamId} onChange={(e) => { setTeamId(e.target.value); setPlayerId(""); setMates([]); setRivals([]); setRes(null); }}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Jugador" htmlFor="ip"><Select id="ip" value={playerId} onChange={(e) => { setPlayerId(e.target.value); setMates((m) => m.filter((x) => x !== e.target.value)); setRes(null); }}><option value="">Elige…</option>{roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></Field>
        </div>
        <Conditions v={cond} set={setCond} />
        <PickList title="Compañeros (opcional)" players={roster} value={mates} onChange={setMates} max={6} disabled={[playerId]} />
        <PickList title="Rivales (opcional)" players={rivalRoster} value={rivals} onChange={setRivals} max={7} />
        <Button onClick={run} disabled={pending || !playerId} className="w-full sm:w-auto"><FlaskConical size={18} /> {pending ? "Calculando…" : "Simular actuación"}</Button>
        {err && <Notice tone="danger">{err}</Notice>}
      </Card>
      {res && (
        res.status !== "ok" ? <Notice tone="warn">{res.warnings[0]}</Notice> : (
          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-display text-xl font-bold uppercase">{name}</div>
              <Pill tone={res.confidence.level === "alta" ? "pitch" : res.confidence.level === "media" ? "neutral" : res.confidence.level === "baja" ? "gold" : "danger"}>Confianza {res.confidence.level}</Pill>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Goles estimados" value={num(res.xGoals, 2)} hint={`${pct(res.pScore)} de marcar`} />
              <Stat label="Asistencias est." value={num(res.xAssists, 2)} hint={`${pct(res.pAssist)} de asistir`} />
              <Stat label="Rendimiento esperado" value={num(res.expectedRating, 2)} hint="puntos de valoración" />
              <Stat label="Prob. victoria" value={pct(res.pWin)} hint="según sus resultados" />
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="mb-1 font-semibold">Comparación con sus actuaciones</div>
              {res.history.matches ? (
                <p className="text-ink-2">Media histórica {num(res.history.avgRating, 2)} · mejor {num(res.history.bestRating, 2)} en {res.history.matches} partidos. Esta simulación supera al {pct(res.history.percentile)} de sus actuaciones.</p>
              ) : <p className="text-ink-2">Sin actuaciones previas: se usa la media del grupo.</p>}
            </div>
            {res.warnings.length > 0 && <ul className="rounded-xl bg-gold-soft px-3 py-2 text-xs">{res.confidence.level !== "alta" && <li className="font-semibold">{lowText}</li>}{res.warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
            <FactorTable factors={res.factors} sample={res.sample} config={res.configName} individual />
          </Card>
        )
      )}
    </div>
  );
}
