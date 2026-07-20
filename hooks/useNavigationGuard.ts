import { useRef, useCallback } from 'react';

export function useNavigationGuard(delay = 600) {
  const locked = useRef(false);
  return useCallback((fn: () => void) => {
    if (locked.current) return;
    locked.current = true;
    fn();
    setTimeout(() => { locked.current = false; }, delay);
  }, []);
}
