/** Tipos de dominio (espejo de las tablas de Supabase). */
export type Role = "admin" | "organizer" | "player";
export type MatchStatus = "pending" | "confirmed" | "played" | "postponed" | "cancelled";
export type MatchOrigin = "scheduled" | "historical";
export type Position = "POR" | "DEF" | "MED" | "DEL";
export type Weather = "despejado" | "nublado" | "lluvia" | "viento" | "niebla" | "otro";

export interface Team {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  full_name: string | null;
  crest_url: string | null;
  headquarters: string | null;
  home_venue_id: string | null;
  primary_color: string;
  secondary_color: string;
  founded_label: string | null;
  description: string | null;
  sort_order: number;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  maps_url: string | null;
  image_url: string | null;
  surface: string | null;
  notes: string | null;
  phone: string | null;
  phone_alt: string | null;
  website: string | null;
  booking_url: string | null;
  pitch_info: string | null;
  hours: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  is_demo: boolean;
}

export interface Player {
  id: string;
  kind: "member" | "guest";
  team_id: string | null;
  full_name: string;
  nickname: string | null;
  usual_position: Position | null;
  shirt_number: number | null;
  photo_url: string | null;
  bio: string | null;
  active: boolean;
  is_demo: boolean;
}

export interface Formation {
  id: string;
  name: string;
  lines: number[];
  is_default: boolean;
  active: boolean;
  sort_order: number;
}

export interface Match {
  id: string;
  kickoff_at: string;
  venue_id: string | null;
  home_team_id: string;
  away_team_id: string;
  status: MatchStatus;
  origin: MatchOrigin;
  home_formation_id: string | null;
  away_formation_id: string | null;
  forecast_weather: Weather | null;
  forecast_temp_c: number | null;
  actual_weather: Weather | null;
  actual_temp_c: number | null;
  notes: string | null;
  incidents: string | null;
  final_notes: string | null;
  home_score: number | null;
  away_score: number | null;
  exceptional_lineup: boolean;
  exceptional_reason: string | null;
  status_reason: string | null;
  vote_enabled: boolean;
  vote_opens_at: string | null;
  vote_closes_at: string | null;
  vote_closed_at: string | null;
  is_demo: boolean;
  finalized_at: string | null;
  created_at: string;
}

export interface MatchPlayer {
  match_id: string;
  player_id: string;
  team_id: string;
  called: boolean;
  participated: boolean;
  lineup_position: Position | null;
  brought_by_id: string | null;
  attendance: "pending" | "yes" | "no";
}

export interface Goal {
  id: string;
  match_id: string;
  team_id: string;
  seq: number;
  scorer_id: string | null;
  assist_id: string | null;
  conceded_gk_id: string | null;
  minute: number | null;
  is_own_goal: boolean;
}

export interface GkSpell {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string;
  seq: number;
  start_minute: number | null;
  end_minute: number | null;
}

export interface MatchMvp {
  match_id: string;
  player_id: string;
  source: "vote" | "manual";
  points: number | null;
}

export interface MvpTally {
  match_id: string;
  category: "match" | "team";
  team_id: string | null;
  player_id: string;
  votes: number;
  rank: number;
  ballots: number;
}

export interface TeamBest {
  match_id: string;
  team_id: string;
  player_id: string;
  source: "vote" | "manual";
  votes: number | null;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  auth_provider: string | null;
  role: Role;
  status: "active" | "suspended";
  player_id: string | null;
  notification_prefs: Record<string, boolean>;
  created_at: string;
}

export interface PredictionConfig {
  id: string;
  name: string;
  scope: "next_match" | "simulation";
  weights: FactorWeights;
  enabled: Record<FactorKey, boolean>;
  is_active: boolean;
  is_system: boolean;
  notes: string | null;
  created_at: string;
}

export const FACTOR_KEYS = [
  "composition_teammates",
  "composition_rivals",
  "venue_history",
  "recent_form",
  "recent_venue",
  "weather",
  "time_slot",
] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];
export type FactorWeights = Record<FactorKey, number>;

export const FACTOR_LABELS: Record<FactorKey, string> = {
  composition_teammates: "Composición · compañeros",
  composition_rivals: "Composición · rivales",
  venue_history: "Histórico en el estadio",
  recent_form: "Tres últimos partidos",
  recent_venue: "Tres últimos en el estadio",
  weather: "Clima o temperatura",
  time_slot: "Horario",
};

export const STATUS_LABELS: Record<MatchStatus, string> = {
  pending: "Pendiente de organizar",
  confirmed: "Confirmado",
  played: "Disputado",
  postponed: "Aplazado",
  cancelled: "Cancelado",
};

/** Posiciones elegibles (la portería rota y no es una posición) */
export const FIELD_POSITIONS = ["DEF", "MED", "DEL"] as const;

export const POSITION_LABELS: Record<Position, string> = {
  POR: "Portero",
  DEF: "Central",
  MED: "Centrocampista",
  DEL: "Delantero",
};

export const WEATHER_LABELS: Record<Weather, string> = {
  despejado: "Despejado",
  nublado: "Nublado",
  lluvia: "Lluvia",
  viento: "Viento",
  niebla: "Niebla",
  otro: "Otro",
};

/** Nota del jugador en cada partido, sobre 10 (independiente de las votaciones) */
export interface PerformanceWeights {
  base: number;           // nota de partida (6,0)
  played: number;         // por jugar el partido (+0,5)
  goal: number;           // por cada gol propio (+2,5)
  assist: number;         // por cada asistencia (+1,2)
  team_goal: number;      // por cada gol del equipo que no marca él (+0,8)
  team_conceded: number;  // por cada gol que encaja el equipo (−1,0)
  guest_bonus: number;    // por cada invitado que trae
  max: number;            // tope (10,0)
  min: number;            // suelo (0,0)
}

export interface ModelParams {
  k_team: number;
  k_venue: number;
  k_recent: number;
  k_context: number;
  k_pair: number;
  k_player: number;
  min_matches: number;
}
