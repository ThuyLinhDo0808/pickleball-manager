'use client';
import { useClubs } from '@/context/ClubContext';

// Returns the currently selected club (chosen via the club switcher / Clubs page).
export function useDefaultClub() {
  const { club, loading, error } = useClubs();
  return { club, loading, error };
}
