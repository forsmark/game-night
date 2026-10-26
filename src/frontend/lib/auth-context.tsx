import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./api-client";
import type { MeepleColor } from "../../shared/meeples";

export type CurrentMember = { id: string; name: string; role: "host" | "guest"; color: MeepleColor };

const AuthContext = createContext<{ member: CurrentMember | null; isLoading: boolean } | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiClient.get<CurrentMember>("/auth/me").catch(() => null),
    retry: false,
  });

  return <AuthContext.Provider value={{ member: data ?? null, isLoading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
