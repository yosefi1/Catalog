import { useEffect, useState } from 'react';

/** Wide screens with mouse — show desktop-only controls like rotate. */
export function useMediaDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px) and (pointer: fine)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return desktop;
}
