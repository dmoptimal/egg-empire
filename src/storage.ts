// Browser persistence: the thin, non-sim side of the save system. All the
// interesting logic (shape validation, versioning, offline income) lives in
// src/sim/save.ts and is headless-tested; this file only touches
// localStorage and swallows its failure modes (private mode, quota).

import type { SaveData } from "./sim";

const KEY = "egg-empire-save";

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // No storage available — play on without saves.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
