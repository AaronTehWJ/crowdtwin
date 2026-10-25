import { useEffect, useState } from 'react';
import { api, apiUrl, isTerminal, type Job } from './api';

export function useJob(id: string | undefined) {
  const [job, setJob] = useState<Job>();
  const [error, setError] = useState('');
  useEffect(() => {
    setJob(undefined); setError('');
    if (!id) return;
    const controller = new AbortController();
    const events = new EventSource(apiUrl(`/jobs/${id}/events`), { withCredentials: true });
    let refreshing = false;
    let again = false;
    const refresh = async () => {
      if (refreshing) { again = true; return; }
      refreshing = true;
      try {
        do {
          again = false;
          const value = await api<Job>(`/jobs/${id}`, undefined, controller.signal);
          if (controller.signal.aborted) return;
          setJob(value); setError('');
          if (isTerminal(value.stage)) events.close();
        } while (again);
      } catch {
        if (!controller.signal.aborted) setError('Progress connection lost. Reconnecting to the API…');
      } finally { refreshing = false; }
    };
    events.onmessage = () => { void refresh(); };
    events.onopen = () => { void refresh(); };
    events.onerror = () => { if (!controller.signal.aborted) setError('Progress disconnected. Reconnecting…'); };
    void refresh();
    return () => { controller.abort(); events.close(); };
  }, [id]);
  return { job, error };
}
