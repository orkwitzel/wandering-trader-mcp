import type { Database } from "bun:sqlite";
import type { GameState } from "../engine/types";

export interface LoadedGame {
  state: GameState;
  rng_state: string;
  created_at: string;
  updated_at: string;
  status: "active" | "completed";
}

export function saveGame(db: Database, state: GameState, rngState: string, status: "active" | "completed" = "active"): void {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT created_at FROM games WHERE id = ?").get(state.session_id) as { created_at: string } | null;
  const createdAt = existing?.created_at ?? now;
  db.run(
    `INSERT INTO games (id, created_at, updated_at, status, rng_state, state_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       updated_at = excluded.updated_at,
       status     = excluded.status,
       rng_state  = excluded.rng_state,
       state_json = excluded.state_json`,
    [state.session_id, createdAt, now, status, rngState, JSON.stringify(state)],
  );
}

type GameRow = { state_json: string; rng_state: string; created_at: string; updated_at: string; status: "active" | "completed" };

export function loadGame(db: Database, sessionId: string): LoadedGame | null {
  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(sessionId) as GameRow | null;
  if (!row) return null;
  return {
    state: JSON.parse(row.state_json) as GameState,
    rng_state: row.rng_state,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
  };
}

export function appendEvent(
  db: Database, sessionId: string, day: number, kind: string, payload: unknown,
): void {
  db.run(
    `INSERT INTO game_events (game_id, day, kind, payload_json) VALUES (?, ?, ?, ?)`,
    [sessionId, day, kind, JSON.stringify(payload)],
  );
}
