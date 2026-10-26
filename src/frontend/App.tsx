import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { PaperDefs } from "@/components/paper";
import { AuthProvider } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import { router } from "./router";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong";
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // A 401 from auth/me only means "not signed in yet".
      if (query.queryKey[0] === "auth" && query.queryKey[1] === "me") return;
      // Search and the join page show their own errors on the page.
      if (query.queryKey[0] === "games" && query.queryKey[1] === "search") return;
      if (query.queryKey[0] === "join") return;
      toast.error(errorMessage(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.mutationKey?.[0] === "join") return;
      if (mutation.options.mutationKey?.[0] === "games" && mutation.options.mutationKey?.[1] === "manual") return;
      toast.error(errorMessage(error));
    },
  }),
});

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
          <Toaster />
          <PaperDefs />
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
