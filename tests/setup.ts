import { beforeEach, vi } from "vitest";

// No test may reach BoardGameGeek. A CSV import starts fetching box images in the background,
// so block fetch everywhere, like a server that can't reach BGG. Tests that need BGG stub fetch
// with fixtures after this runs.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("fetch failed: tests have no network");
    }),
  );
});
