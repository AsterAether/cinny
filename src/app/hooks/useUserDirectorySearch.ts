import { useCallback, useRef, useState } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { useDebounce } from './useDebounce';

export type UserDirectorySearchResult = {
  user_id: string;
  display_name?: string;
  avatar_url?: string;
};

export type UseUserDirectorySearchState = {
  results: UserDirectorySearchResult[];
  loading: boolean;
  term: string | undefined;
};

const DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 20;

export function useUserDirectorySearch(limit: number = DEFAULT_LIMIT) {
  const mx = useMatrixClient();
  const [state, setState] = useState<UseUserDirectorySearchState>({
    results: [],
    loading: false,
    term: undefined,
  });

  const currentTermRef = useRef<string>();

  const performSearch = useCallback(
    async (term: string) => {
      try {
        const response = await mx.searchUserDirectory({ term, limit });
        if (currentTermRef.current !== term) return;
        const myUserId = mx.getSafeUserId();
        const filtered = response.results.filter(
          (u: { user_id: string }) => u.user_id !== myUserId
        );
        setState({ results: filtered, loading: false, term });
      } catch {
        if (currentTermRef.current !== term) return;
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [mx, limit]
  );

  const debouncedSearch = useDebounce(performSearch, { wait: DEBOUNCE_MS });

  const search = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) {
        currentTermRef.current = undefined;
        setState({ results: [], loading: false, term: undefined });
        return;
      }
      currentTermRef.current = trimmed;
      setState((prev) => ({ ...prev, loading: true, term: trimmed }));
      debouncedSearch(trimmed);
    },
    [debouncedSearch]
  );

  const reset = useCallback(() => {
    currentTermRef.current = undefined;
    setState({ results: [], loading: false, term: undefined });
  }, []);

  return { ...state, search, reset };
}
