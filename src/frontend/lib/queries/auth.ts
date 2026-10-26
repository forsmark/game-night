import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post("/auth/logout"),
    onSuccess: () => queryClient.setQueryData(["auth", "me"], null),
  });
}
