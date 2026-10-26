import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

export type Game = {
  bggId: number;
  name: string;
  year: number | null;
  minPlayers: number;
  maxPlayers: number;
  bestWith: number[];
  minTime: number | null;
  maxTime: number | null;
  weight: number | null;
  thumbnail: string | null;
  onShelf: boolean;
  kind: "base" | "expansion";
  baseId: number | null;
  // Expansions for this game that are on the shelf.
  expansions: Expansion[];
  // The most players the game seats with those expansions.
  maxWithExpansions: number;
};

export type Expansion = { bggId: number; name: string; minPlayers: number; maxPlayers: number };
export type CsvImportResult = { added: number; removed: number; baseGames: number; expansions: number; unmatched: string[] };

export type SearchResult = {
  bggId: number;
  name: string;
  year: number | null;
  onShelf: boolean;
  // Known games know their kind. BGG search results don't until they are added.
  kind: "base" | "expansion" | null;
  source: "known" | "bgg";
};
// bgg: "off" without a token, "error" when BGG failed. Known games are searched either way.
export type SearchResponse = { results: SearchResult[]; bgg: "ok" | "off" | "error"; message?: string };

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export type ManualGame = {
  name: string;
  minPlayers: number;
  maxPlayers: number;
  minTime: number | null;
  maxTime: number | null;
  weight: number | null;
  bggLink: string | null;
  baseId: number | null;
};

// Whether this server can look games up on BGG. Without it, games are typed in by hand.
export function useBggStatus() {
  return useQuery({
    queryKey: ["games", "status"],
    queryFn: () => apiClient.get<{ bgg: boolean }>("/games/status"),
    staleTime: Infinity,
  });
}

export function useCreateManualGame() {
  return useMutation({
    mutationKey: ["games", "manual"],
    mutationFn: (game: ManualGame) => apiClient.post<{ bggId: number; created: boolean }>("/games/manual", game),
  });
}

export function useGameSearch(query: string) {
  const q = useDebounced(query.trim(), 400);
  return useQuery({
    queryKey: ["games", "search", q],
    queryFn: () => apiClient.get<SearchResponse>(`/games/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useShelf() {
  return useQuery({ queryKey: ["shelf"], queryFn: () => apiClient.get<Game[]>("/shelf") });
}

export function useAddToShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bggId: number) => apiClient.post("/shelf", { bggId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shelf"] }),
  });
}

export function useRemoveFromShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bggId: number) => apiClient.delete(`/shelf/${bggId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shelf"] }),
  });
}

export function useImportCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { csv: string; replace: boolean }) => apiClient.post<CsvImportResult>("/shelf/import-csv", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shelf"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useSetExpansionBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bggId, baseId }: { bggId: number; baseId: number | null }) => apiClient.patch(`/shelf/${bggId}`, { baseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shelf"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useImportShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => apiClient.post<{ added: number; total: number }>("/shelf/import", { username }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shelf"] }),
  });
}
