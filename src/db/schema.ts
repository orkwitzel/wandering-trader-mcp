import type { Database } from "bun:sqlite";

export function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id          TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      status      TEXT NOT NULL,
      rng_state   TEXT NOT NULL,
      state_json  TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS game_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id       TEXT NOT NULL,
      day           REAL NOT NULL,
      kind          TEXT NOT NULL,
      payload_json  TEXT NOT NULL,
      FOREIGN KEY (game_id) REFERENCES games(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id)`);
}
