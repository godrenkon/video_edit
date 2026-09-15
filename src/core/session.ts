const SESSION_KEY = 'suiram-video-edit.session-state';

interface SessionState {
  status: 'open' | 'clean';
  startedAt: number;
  updatedAt: number;
}

let initialUncleanObservation: boolean | null = null;

export function beginEditorSession() {
  const previous = readSessionState();
  if (initialUncleanObservation === null) {
    initialUncleanObservation = previous?.status === 'open';
  }

  const now = Date.now();
  const current: SessionState = { status: 'open', startedAt: now, updatedAt: now };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(current));
  } catch {
    return initialUncleanObservation;
  }
  return initialUncleanObservation;
}

export function markEditorSessionClean() {
  const previous = readSessionState();
  const now = Date.now();
  const clean: SessionState = {
    status: 'clean',
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(clean));
  } catch {
    // A blocked localStorage should not prevent the editor from closing.
  }
}

export function editorSessionWasUnclean() {
  return initialUncleanObservation ?? readSessionState()?.status === 'open';
}

function readSessionState(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    if ((parsed.status !== 'open' && parsed.status !== 'clean') || typeof parsed.startedAt !== 'number') {
      return null;
    }
    return {
      status: parsed.status,
      startedAt: parsed.startedAt,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : parsed.startedAt,
    };
  } catch {
    return null;
  }
}
