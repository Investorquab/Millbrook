import { describe, expect, it } from "vitest";
import { AuthStore, TOKEN_TTL_MS, cleanUsername, magicLinkEmail } from "./auth.js";

/** A store with a controllable clock and a counter-based token generator. */
function makeStore(startTime = 1_000_000) {
  let t = startTime;
  let n = 0;
  const store = new AuthStore({
    now: () => t,
    randomToken: () => `tok${n++}`,
    publicBaseUrl: "https://play.example.com/",
  });
  return { store, advance: (ms: number) => (t += ms) };
}

describe("AuthStore magic links", () => {
  it("requests a link, verifies it, and issues a session", () => {
    const { store } = makeStore();
    const link = store.requestLink("Ada@Example.com ", "  Ada Baker  ");
    expect(link.email).toBe("ada@example.com"); // lowercased + trimmed
    expect(link.username).toBe("Ada Baker");
    expect(link.link).toBe(`https://play.example.com/auth/verify?token=${link.token}`);

    const session = store.verify(link.token);
    expect(session).not.toBeNull();
    expect(session!.username).toBe("Ada Baker");
    expect(session!.email).toBe("ada@example.com");
    expect(store.session(session!.sessionId)?.username).toBe("Ada Baker");
  });

  it("a token is single-use", () => {
    const { store } = makeStore();
    const link = store.requestLink("a@b.co", "Ada");
    expect(store.verify(link.token)).not.toBeNull();
    expect(store.verify(link.token)).toBeNull(); // second time fails
  });

  it("a token expires", () => {
    const { store, advance } = makeStore();
    const link = store.requestLink("a@b.co", "Ada");
    advance(TOKEN_TTL_MS + 1);
    expect(store.verify(link.token)).toBeNull();
  });

  it("rejects an unknown token and a bad email", () => {
    const { store } = makeStore();
    expect(store.verify("nope")).toBeNull();
    expect(() => store.requestLink("not-an-email", "Ada")).toThrow();
    expect(() => store.requestLink("a@b.co", "   ")).toThrow();
  });

  it("an expired session is dropped", () => {
    const { store, advance } = makeStore();
    const link = store.requestLink("a@b.co", "Ada");
    const s = store.verify(link.token)!;
    advance(31 * 24 * 60 * 60 * 1000); // past SESSION_TTL
    expect(store.session(s.sessionId)).toBeUndefined();
  });
});

describe("username and email helpers", () => {
  it("cleans control characters and caps the length", () => {
    expect(cleanUsername("  hi\u0000there  ")).toBe("hithere");
    expect(cleanUsername("x".repeat(40)).length).toBe(24);
  });
  it("builds a plain, link-bearing email", () => {
    const m = magicLinkEmail("https://x/auth/verify?token=abc", "Ada");
    expect(m.text).toContain("https://x/auth/verify?token=abc");
    expect(m.html).toContain("Ada");
    expect(m.subject).toMatch(/sign-in/i);
  });
});
