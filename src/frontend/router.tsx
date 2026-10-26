import { createRootRoute, createRoute, createRouter, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { TopNav } from "@/components/nav/top-nav";
import { Playground } from "@/components/pieces/playground";
import { ErrorBoundary } from "@/components/error-boundary";
import WelcomePage from "@/pages/welcome-page";
import NextNightPage from "@/pages/next-night-page";
import NightPage from "@/pages/night-page";
import ShelfPage from "@/pages/shelf-page";
import HostPage from "@/pages/host-page";
import JoinPage from "@/pages/join-page";

function RootLayout() {
  const { member, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isJoin = location.pathname.startsWith("/i/");
  const blocked = (location.pathname === "/host" && member?.role !== "host") || isJoin;

  // The nav hides the Host tab from guests, but the route must redirect too.
  // Someone who is already signed in and opens the group link goes to the next night.
  useEffect(() => {
    if (member && blocked) navigate({ to: "/" });
  }, [member, blocked, navigate]);

  if (isLoading) return null;
  // There is no login form. People sign in through the group link or their personal link.
  if (!member) return isJoin ? <Outlet /> : <WelcomePage />;
  if (blocked) return null;

  return (
    <div className="relative min-h-dvh">
      <TopNav member={member} />
      <main className="relative mx-auto max-w-3xl px-4 pt-24 pb-24">
        {/* Keyed by page, so moving to another page clears the error. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Playground />
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

const nextNightRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: NextNightPage });
const nightRoute = createRoute({ getParentRoute: () => rootRoute, path: "/nights/$id", component: NightPage });
const shelfRoute = createRoute({ getParentRoute: () => rootRoute, path: "/shelf", component: ShelfPage });
const hostRoute = createRoute({ getParentRoute: () => rootRoute, path: "/host", component: HostPage });
const joinRoute = createRoute({ getParentRoute: () => rootRoute, path: "/i/$token", component: JoinPage });

export const routeTree = rootRoute.addChildren([nextNightRoute, nightRoute, shelfRoute, hostRoute, joinRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
