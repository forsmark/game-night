import { afterEach, beforeEach, vi } from "vitest";

// Tests run without a BGG token, like a fresh deploy. The server loads a developer's .env on
// import, and a BGG_TOKEN there would switch search and lookups to the XML API and fail the
// tests that expect it off. A test that needs a token stubs one in its own beforeEach, which
// runs after this one.
beforeEach(() => {
  vi.stubEnv("BGG_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

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
