import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import type { CurrentMember } from "../auth-context";

export type SignInCode = { code: string; expiresAt: string };
export type CodeResult = { kind: "group"; token: string } | { kind: "signin"; member: CurrentMember };

// Codes go in POST bodies only, never in a URL.
export function useEnterCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiClient.post<CodeResult>("/code", { code }),
    onSuccess: (result) => {
      if (result.kind === "signin") queryClient.setQueryData(["auth", "me"], result.member);
    },
  });
}

// A one-time code for the signed-in member, or, for the host, for any player.
export function useMakeSignInCode(memberId?: string) {
  return useMutation({
    mutationFn: () => apiClient.post<SignInCode>(memberId ? `/members/${memberId}/code` : "/auth/code"),
  });
}
