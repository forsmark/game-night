import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { MeepleColor } from "../../../shared/meeples";
import type { Game } from "./games";

export type RsvpStatus = "yes" | "maybe" | "no";
export type GameNight = { id: string; startsAt: string; location: string; note: string };
export type EventMember = { id: string; name: string; color: MeepleColor };
export type Nomination = { game: Game; nominatedBy: string; broughtBy: string | null; voters: string[] };
export type PlanTable = { bggId: number; players: string[]; happy: number };
export type PlanOption = { tables: PlanTable[]; happy: number; score: number };
export type Plan = {
  recommended: "one" | "two" | "three" | "none";
  oneTable: PlanOption[];
  twoTables: PlanOption[];
  threeTables: PlanOption[];
};
export type EventDetail = {
  event: GameNight;
  members: EventMember[];
  rsvps: { memberId: string; status: RsvpStatus }[];
  nominations: Nomination[];
  includeMaybes: boolean;
  plan: Plan;
};
export type EventSummary = { id: string; startsAt: string; location: string; going: number };
export type EventInput = Omit<GameNight, "id">;

const eventKey = (id: string) => ["events", id];

// The host's "places taken" count follows the next night's answers, so it refreshes with the nights.
function invalidateNights(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["events"] });
  queryClient.invalidateQueries({ queryKey: ["invite"] });
}

export function useNextEventId() {
  return useQuery({ queryKey: ["events", "next"], queryFn: () => apiClient.get<{ id: string | null }>("/events/next") });
}

export function useEvents() {
  return useQuery({ queryKey: ["events", "list"], queryFn: () => apiClient.get<EventSummary[]>("/events") });
}

export function useEvent(id: string, includeMaybes: boolean) {
  return useQuery({
    queryKey: [...eventKey(id), { includeMaybes }],
    queryFn: () => apiClient.get<EventDetail>(`/events/${id}${includeMaybes ? "?maybes=1" : ""}`),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
    // Friends vote from their own phones. Poll so the tables move without a reload.
    refetchInterval: 30_000,
  });
}

function useEventMutation<T>(id: string, mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => invalidateNights(queryClient),
    onSettled: () => queryClient.invalidateQueries({ queryKey: eventKey(id) }),
  });
}

export function useRsvp(id: string) {
  return useEventMutation(id, (status: RsvpStatus) => apiClient.put(`/events/${id}/rsvp`, { status }));
}

export function useVote(id: string, memberId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bggId, approve }: { bggId: number; approve: boolean }) =>
      apiClient.put(`/events/${id}/votes/${bggId}`, { approve }),
    // Flip the vote at once. The plan catches up when the refetch lands.
    onMutate: async ({ bggId, approve }) => {
      await queryClient.cancelQueries({ queryKey: eventKey(id) });
      queryClient.setQueriesData<EventDetail>({ queryKey: eventKey(id) }, (detail) =>
        detail && {
          ...detail,
          nominations: detail.nominations.map((n) =>
            n.game.bggId !== bggId
              ? n
              : { ...n, voters: approve ? [...n.voters, memberId] : n.voters.filter((v) => v !== memberId) },
          ),
        },
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: eventKey(id) }),
  });
}

export function useNominate(id: string) {
  return useEventMutation(id, (input: { bggId: number; bringing: boolean }) =>
    apiClient.post(`/events/${id}/nominations`, input),
  );
}

export function useRemoveNomination(id: string) {
  return useEventMutation(id, (bggId: number) => apiClient.delete(`/events/${id}/nominations/${bggId}`));
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EventInput) => apiClient.post<{ id: string }>("/events", input),
    onSuccess: () => invalidateNights(queryClient),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<EventInput> & { id: string }) => apiClient.patch(`/events/${id}`, input),
    onSuccess: () => invalidateNights(queryClient),
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/events/${id}`),
    onSuccess: () => invalidateNights(queryClient),
  });
}
