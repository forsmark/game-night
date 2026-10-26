import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

// Keeps one broken part of a page from blanking the whole app.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="paper mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
        <h1 className="font-display text-3xl">This page broke</h1>
        <p className="text-muted-foreground">Something on it failed to load. Reloading usually fixes it.</p>
        <Button className="rounded-full" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </div>
    );
  }
}
