'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// The signed-in Host's plan and which paid features it unlocks (from /api/host/subscription).
// Shared by every component on the page; refreshed on each full page load.
let cache = null;
export function loadSubscription(force = false) {
  if (!cache || force) cache = api.get('/api/host/subscription').catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

export function useFeatures() {
  const [sub, setSub] = useState(null);
  useEffect(() => {
    let alive = true;
    loadSubscription()
      .then((s) => alive && setSub(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return {
    sub,
    ready: !!sub,
    // Unknown (still loading / failed) counts as allowed so nothing flickers shut;
    // the server enforces the plan anyway.
    has: (feature) => !sub?.features || sub.features[feature] !== false,
    tierFor: (feature) => sub?.feature_tiers?.[feature] || null,
  };
}
