import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { CurrentMember } from "../auth-context";
import type { RsvpStatus } from "./events";

export type InviteInfo = { full: boolean; night: { startsAt: string; location: string } | null };
export type InviteSettings = { link: string; code: string; limit: number; used: number };

export function useInviteInfo(token: string) {
  return useQuery({
    queryKey: ["join", token],
    queryFn: () => apiClient.get<InviteInfo>(`/join/${token}`),
    retry: false,
  });
}

export function useJoin(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["join"],
    mutationFn: (input: { name: string; status: RsvpStatus }) => apiClient.post<CurrentMember>(`/join/${token}`, input),
    onSuccess: (member) => queryClient.setQueryData(["auth", "me"], member),
  });
}

export function useMyLink() {
  return useQuery({ queryKey: ["auth", "link"], queryFn: () => apiClient.get<{ link: string }>("/auth/link"), enabled: false });
}

export function useInviteSettings() {
  return useQuery({ queryKey: ["invite"], queryFn: () => apiClient.get<InviteSettings>("/invite") });
}

function useInviteMutation<T>(mutationFn: (input: T) => Promise<InviteSettings>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: (data) => queryClient.setQueryData(["invite"], data) });
}

export const useSetInviteLimit = () =>
  useInviteMutation((limit: number) => apiClient.patch<InviteSettings>("/invite", { limit }));
export const useNewInviteLink = () => useInviteMutation(() => apiClient.post<InviteSettings>("/invite/new-link"));
