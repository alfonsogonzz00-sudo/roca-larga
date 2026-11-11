import Link from "next/link";
import { MapPin } from "lucide-react";
import { Crest } from "@/components/ui";
import { BallIcon } from "@/components/match/lineup-pitch";
import { fmtTime } from "@/lib/format";
import { STATUS_LABELS, type Match, type Team, type Venue } from "@/lib/types";

export interface ScorerLine { name: string; goals: number; ownGoal?: boolean }

const pad = (n: number) => String(n).padStart(2, "0");
function datePill(iso: string) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const g = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return `${pad(Number(g("day")))}/${pad(Number(g("month")))}/${g("year")} • ${fmtTime(iso)}`;
}

function Side({ team }: { team: Team }) {
  return (
    <Link href={`/equipos/${team.slug}`} className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Crest src={team.crest_url} name={team.name} size={64} className="drop-shadow-[0_2px_8px_rgb(0_0_0/0.35)]" />
      <span className="w-full truncate text-sm font-semibold leading-tight text-white">{team.name}</span>
    </Link>
  );
}

function Scorers({ list, align }: { list: ScorerLine[]; align: "left" | "right" }) {
  return (
    <ul className={align === "right" ? "space-y-0.5 text-right" : "space-y-0.5 text-left"}>
      {list.map((s) => (
        <li key={s.name + (s.ownGoal ? "pp" : "")} className="truncate">
          {s.name}{s.ownGoal ? " (p.p.)" : ""}{s.goals > 1 ? <span className="text-white/55"> ×{s.goals}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Cabecera de la ficha de partido (estilo marcador digital) */
export function MatchHeader({ m, home, away, venue, scorers }: {
  m: Match; home: Team; away: Team; venue?: Venue; scorers: { home: ScorerLine[]; away: ScorerLine[] };
}) {
  const played = m.status === "played";
  const status = played ? "Finalizado" : STATUS_LABELS[m.status];
  const hasScorers = played && (scorers.home.length > 0 || scorers.away.length > 0);
  return (
    <header className="-mx-4 -mt-5 bg-[linear-gradient(180deg,#0d1117_0%,#141b26_55%,#1a2333_100%)] px-4 pt-4 pb-5 text-white lg:mx-0 lg:mt-0">
      <div className="flex justify-center">
        <span className="tabular bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white/85">{datePill(m.kickoff_at)}</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <Side team={home} />
        <div className="flex min-w-[7.5rem] flex-col items-center pt-3">
          {played ? (
            <div className="tabular text-[2.75rem] font-bold leading-none">
              {m.home_score}<span className="mx-2 text-white/45">-</span>{m.away_score}
            </div>
          ) : (
            <div className="tabular text-4xl font-bold leading-none">{fmtTime(m.kickoff_at)}</div>
          )}
          <span className={played ? "mt-2 text-sm text-white/70" : "mt-2 text-sm font-semibold text-[#4ade80]"}>{status}</span>
        </div>
        <Side team={away} />
      </div>
      {hasScorers && (
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-xs text-white/85">
          <Scorers list={scorers.home} align="right" />
          <BallIcon className="mt-0.5 h-3.5 w-3.5 opacity-80" />
          <Scorers list={scorers.away} align="left" />
        </div>
      )}
      {venue && (
        <div className="mt-4 flex justify-center">
          <Link href={`/estadios/${venue.id}`} className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"><MapPin size={12} aria-hidden />{venue.name}</Link>
        </div>
      )}
    </header>
  );
}
