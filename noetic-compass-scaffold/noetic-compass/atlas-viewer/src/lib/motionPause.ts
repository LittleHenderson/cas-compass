import { useCallback, useEffect, useState } from 'react';

export const MOTION_PAUSED_STORAGE_KEY = 'cas_motion_paused';
const MOTION_PAUSED_EVENT = 'cas:motion-paused-change';

export function readMotionPaused(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(MOTION_PAUSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function applyMotionPausedToDocument(paused: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.motionPaused = paused ? 'true' : 'false';
}

export function setMotionPaused(paused: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(MOTION_PAUSED_STORAGE_KEY, paused ? 'true' : 'false');
    }
  } catch {
    // Ignore storage write errors in restricted browser contexts.
  }
  applyMotionPausedToDocument(paused);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(MOTION_PAUSED_EVENT, { detail: paused }));
  }
}

export function initMotionPaused(): boolean {
  const paused = readMotionPaused();
  applyMotionPausedToDocument(paused);
  return paused;
}

export function useMotionPaused(): {
  motionPaused: boolean;
  toggleMotionPaused: () => void;
  setMotionPausedState: (paused: boolean) => void;
} {
  const [motionPaused, setMotionPausedStateLocal] = useState<boolean>(() =>
    initMotionPaused(),
  );

  useEffect(() => {
    applyMotionPausedToDocument(motionPaused);
  }, [motionPaused]);

  useEffect(() => {
    const onCustom = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      if (typeof custom.detail === 'boolean') {
        setMotionPausedStateLocal(custom.detail);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_PAUSED_STORAGE_KEY) {
        const next = event.newValue === 'true';
        applyMotionPausedToDocument(next);
        setMotionPausedStateLocal(next);
      }
    };
    window.addEventListener(MOTION_PAUSED_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(MOTION_PAUSED_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setMotionPausedState = useCallback((paused: boolean) => {
    setMotionPaused(paused);
    setMotionPausedStateLocal(paused);
  }, []);

  const toggleMotionPaused = useCallback(() => {
    const next = !readMotionPaused();
    setMotionPaused(next);
    setMotionPausedStateLocal(next);
  }, []);

  return { motionPaused, toggleMotionPaused, setMotionPausedState };
}
