export interface SavedSession {
  playerId: string;
  name: string;
  token: string;
}

const SESSIONS_KEY = "puzzle-together:sessions:v1";
const NAME_KEY = "puzzle-together:last-name:v1";
const GUIDE_KEY = "puzzle-together:guide:v1";

function readSessions(): Record<string, SavedSession> {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, SavedSession>;
  } catch {
    return {};
  }
}

function writeSessions(sessions: Record<string, SavedSession>): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // A private browser may refuse localStorage. The current tab still works.
  }
}

export function readSession(code: string): SavedSession | null {
  const session = readSessions()[code.toUpperCase()];
  if (!session || typeof session.token !== "string" || typeof session.playerId !== "string") {
    return null;
  }
  return session;
}

export function saveSession(code: string, session: SavedSession): void {
  const sessions = readSessions();
  sessions[code.toUpperCase()] = session;
  writeSessions(sessions);
}

export function clearSession(code: string): void {
  const sessions = readSessions();
  delete sessions[code.toUpperCase()];
  writeSessions(sessions);
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Ignore storage failures.
  }
}

export function readRememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function readGuidePreference(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveGuidePreference(visible: boolean): void {
  try {
    localStorage.setItem(GUIDE_KEY, visible ? "on" : "off");
  } catch {
    // Ignore storage failures.
  }
}
