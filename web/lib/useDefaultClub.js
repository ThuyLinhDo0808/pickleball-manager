'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// MVP convenience: most hosts run one club, so auto-create/select the first one.
// The schema and API support multiple clubs; a club switcher can be added later.
export function useDefaultClub() {
  const { user } = useAuth();
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const clubs = await api.get('/api/clubs');
        if (cancelled) return;
        if (clubs.length > 0) {
          setClub(clubs[0]);
        } else {
          const created = await api.post('/api/clubs', { name: 'My Club' });
          if (!cancelled) setClub(created);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { club, loading, error };
}
