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
export type CsvImportResult = {
  added: number;
  removed: number;
  baseGames: number;
  expansions: number;
  unmatched: string[];
  // Shelf games still without a box image. The server fetches them in the background, about one a second.
  imagesPending: number;
};

export type SearchResult = {
  bggId: number;
  name: string;
  year: number | null;
  onShelf: boolean;
  // Known games and the BGG game list know their kind. BGG search results don't until they are added.
  kind: "base" | "expansion" | null;
  // known: already in this app. catalogue: from the BGG game list. bgg: from BGG's own search.
  source: "known" | "catalogue" | "bgg";
};
// bgg: "off" without a token, "error" when BGG failed. catalogue: whether the BGG game list is loaded.
export type SearchResponse = { results: SearchResult[]; bgg: "ok" | "off" | "error"; catalogue: boolean; message?: string };
export type CatalogueInfo = { games: number; importedAt: string | null };

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

// bgg: whether this server has a BGG API token. catalogue: the BGG game list that search runs on.
export function useBggStatus() {
  return useQuery({
    queryKey: ["games", "status"],
    queryFn: () => apiClient.get<{ bgg: boolean; catalogue: CatalogueInfo }>("/games/status"),
    staleTime: Infinity,
  });
}

export function useImportCatalogue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => apiClient.post<CatalogueInfo>("/games/catalogue", { csv }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games", "status"] });
      queryClient.invalidateQueries({ queryKey: ["games", "search"] });
    },
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
    onSuccess: ({ imagesPending }) => {
      queryClient.invalidateQueries({ queryKey: ["shelf"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      // Reload the shelf now and then, so box images show up as the server gets them.
      if (imagesPending > 0) {
        const timer = setInterval(() => queryClient.invalidateQueries({ queryKey: ["shelf"] }), 5000);
        setTimeout(() => clearInterval(timer), imagesPending * 1500 + 10_000);
      }
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
