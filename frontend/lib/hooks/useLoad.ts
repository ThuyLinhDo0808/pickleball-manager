import { useCallback, useEffect, useRef, useState } from 'react';

export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const dataRef = useRef<T | null>(null);

  const run = useCallback(async (mode: 'initial' | 'silent' | 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
      setError(null);
    }
    if (mode === 'refresh') setRefreshing(true);
    try {
      const result = await fn();
      dataRef.current = result;
      setData(result);
      setError(null);
    } catch (e: any) {
      if (mode !== 'silent' || !dataRef.current) setError(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run('initial');
  }, [run]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => run('silent'),
    retry: () => run('initial'),
    refresh: () => run('refresh'),
  };
}