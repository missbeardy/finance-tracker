import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { get, set, del, clear } from 'idb-keyval'

export const QUERY_CACHE_KEY = 'randall-finance-query-cache'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: async (key, value) => {
      await set(key, value)
    },
    removeItem: async (key) => {
      await del(key)
    },
  },
  key: QUERY_CACHE_KEY,
})

/** Spec §15.3 — cached ledger must not survive sign-out. */
export async function clearQueryCache() {
  queryClient.clear()
  await del(QUERY_CACHE_KEY)
  await clear()
}
