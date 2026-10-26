import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { MeepleColor } from "../../../shared/meeples";

export type Member = { id: string; name: string; role: "host" | "guest"; color: MeepleColor; link: string };

export function useMembers() {
  return useQuery({ queryKey: ["members"], queryFn: () => apiClient.get<Member[]>("/members") });
}

function useMemberMutation<T, R = unknown>(mutationFn: (input: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["invite"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export const useAddMember = () => useMemberMutation((name: string) => apiClient.post<Member>("/members", { name }));
export const useUpdateMember = () =>
  useMemberMutation(({ id, ...input }: { id: string; name?: string; color?: MeepleColor }) =>
    apiClient.patch(`/members/${id}`, input),
  );
export const useNewLink = () => useMemberMutation((id: string) => apiClient.post<Member>(`/members/${id}/new-link`));
export const useRemoveMember = () => useMemberMutation((id: string) => apiClient.delete(`/members/${id}`));
