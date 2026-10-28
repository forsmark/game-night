import { Link, useLocation } from "@tanstack/react-router";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { CalendarDays, Copy, KeyRound, Library, Settings, Moon, Sun } from "lucide-react";
import { Popover } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMyLink } from "@/lib/queries/invite";
import { useTheme } from "next-themes";
import { Meeple } from "@/components/pieces/meeple";
import { SignInCodeDialog } from "@/components/sign-in-code";
import type { CurrentMember } from "@/lib/auth-context";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center overflow-hidden rounded-full px-3 py-2 text-sm font-medium opacity-70 hover:opacity-100"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "sun" : "moon"}
          initial={reduceMotion ? false : { rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={reduceMotion ? undefined : { rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="flex"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function MeMenu({ member }: { member: CurrentMember }) {
  const myLink = useMyLink();
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  const copy = async () => {
    const { data } = await myLink.refetch();
    if (!data) return;
    await navigator.clipboard.writeText(data.link);
    toast.success("Copied your personal link");
  };

  return (
    <>
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger
          aria-label={`Signed in as ${member.name}`}
          className="flex items-center gap-1.5 rounded-full py-2 pr-3 pl-2 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Meeple color={member.color} size={20} />
          <span className="hidden sm:inline">{member.name}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={8} className="paper z-50 flex w-72 flex-col gap-3 p-4">
            <p className="text-sm">
              Signed in as <span className="font-semibold">{member.name}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Sign in as yourself on another phone or computer with a one-time code, or with your personal link.
              Keep both to yourself. The code also works in the app on your home screen.
            </p>
            <Button
              className="rounded-full"
              onClick={() => {
                setMenuOpen(false);
                setCodeOpen(true);
              }}
            >
              <KeyRound /> Sign in on another device
            </Button>
            <Button variant="outline" className="rounded-full" onClick={copy}>
              <Copy /> Copy your link
            </Button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <SignInCodeDialog open={codeOpen} onOpenChange={setCodeOpen} />
    </>
  );
}

const BASE_TABS = [
  { to: "/", label: "Next night", icon: CalendarDays },
  { to: "/shelf", label: "Shelf", icon: Library },
] as const;

const HOST_TAB = { to: "/host", label: "Host", icon: Settings } as const;

export function TopNav({ member }: { member: CurrentMember }) {
  const location = useLocation();
  const tabs = member.role === "host" ? [...BASE_TABS, HOST_TAB] : BASE_TABS;

  return (
    <nav className="paper fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 px-2 py-1.5">
      {tabs.map((tab) => {
        const isActive = tab.to === "/" ? location.pathname === "/" || location.pathname.startsWith("/nights") : location.pathname === tab.to;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-label={tab.label}
            className="relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
          >
            {isActive && (
              <motion.div
                layoutId="nav-active-pill"
                className="paper-piece absolute inset-0 bg-secondary"
                transition={{ type: "spring", duration: 0.5 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </span>
          </Link>
        );
      })}
      <ThemeToggle />
      <MeMenu member={member} />
    </nav>
  );
}
