import { beforeAll, describe, expect, it, vi } from "vitest";
import { freshDb } from "./helpers";

// Route handlers read the session cookie through next/headers; tests hand it a plain cookie jar.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }) }));

describe("project landing URL round trip", () => {
  let pid = 0;
  let route: typeof import("@/app/api/projects/[id]/route");

  beforeAll(async () => {
    freshDb();
    const { users, projects } = await import("@/lib/db/repo");
    const { newSessionCookie, SESSION_COOKIE } = await import("@/lib/auth/session");
    const u = users.create("landing@example.com", "x");
    pid = projects.create(u.id, "Oatly vs Silk", "US", null).id;
    jar.set(SESSION_COOKIE, newSessionCookie(u.id, false).value);
    route = await import("@/app/api/projects/[id]/route");
  });

  const ctx = () => ({ params: Promise.resolve({ id: String(pid) }) });
  const get = () => route.GET(new Request(`http://app.example/api/projects/${pid}`), ctx());
  const save = (landingUrl: string | null) =>
    route.PATCH(
      new Request(`http://app.example/api/projects/${pid}`, {
        method: "PATCH",
        headers: { host: "app.example", origin: "http://app.example", "x-adflank": "1", "content-type": "application/json" },
        body: JSON.stringify({ landingUrl }),
      }),
      ctx(),
    );

  it("GET returns the saved URL, not the sanitiser's [url], and saving it again works", async () => {
    expect((await save("https://www.oatly.com/en-us")).status).toBe(200);
    const view = (await (await get()).json()) as { project: { landing_url: string | null } };
    expect(view.project.landing_url).toBe("https://www.oatly.com/en-us");
    expect((await save(view.project.landing_url)).status).toBe(200);
    const again = (await (await get()).json()) as { project: { landing_url: string | null } };
    expect(again.project.landing_url).toBe("https://www.oatly.com/en-us");
  });

  it("still refuses private hosts and clears the URL on null", async () => {
    expect((await save(`http://${["10", "0", "0", "5"].join(".")}/admin`)).status).toBe(400);
    expect((await save("https://localhost/x")).status).toBe(400);
    expect((await save(null)).status).toBe(200);
    const view = (await (await get()).json()) as { project: { landing_url: string | null } };
    expect(view.project.landing_url).toBeNull();
  });
});
