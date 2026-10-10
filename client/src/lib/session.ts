type SessionEnd = () => void;

let handler: SessionEnd | null = null;
let handling = false;

export function registerSessionEnd(next: SessionEnd): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** Ends the signed-in UI once. A 401 storm from clearing the cache must not loop. */
export function sessionEnded(): void {
  if (handling) return;
  handling = true;
  try {
    handler?.();
  } finally {
    setTimeout(() => {
      handling = false;
    }, 1000);
  }
}
