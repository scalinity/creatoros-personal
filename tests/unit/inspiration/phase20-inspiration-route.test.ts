import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createInspiration: vi.fn(),
  requireAdminForRoute: vi.fn(),
  saveInspirationWithExtensionToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin", () => ({
  requireAdminForRoute: routeMocks.requireAdminForRoute,
}));
vi.mock("@/lib/inspiration", () => ({
  createInspiration: routeMocks.createInspiration,
  saveInspirationWithExtensionToken: routeMocks.saveInspirationWithExtensionToken,
}));

import { POST } from "@/app/api/inspiration/save/route";

const originalChromeExtensionOrigins = process.env.CHROME_EXTENSION_ORIGINS;

function saveRequest(headers: HeadersInit = {}) {
  return new NextRequest("http://localhost:3000/api/inspiration/save", {
    body: JSON.stringify({ post_id: "123", post_url: "https://x.com/a/status/123", text: "Useful structure." }),
    headers: { "Content-Type": "application/json", ...headers },
    method: "POST",
  });
}

describe("Phase 20 inspiration save route", () => {
  beforeEach(() => {
    process.env.CHROME_EXTENSION_ORIGINS = "chrome-extension://creatoros";
    routeMocks.createInspiration.mockReset();
    routeMocks.requireAdminForRoute.mockReset();
    routeMocks.saveInspirationWithExtensionToken.mockReset();
  });

  afterEach(() => {
    if (originalChromeExtensionOrigins === undefined) {
      delete process.env.CHROME_EXTENSION_ORIGINS;
    } else {
      process.env.CHROME_EXTENSION_ORIGINS = originalChromeExtensionOrigins;
    }
  });

  it("rejects unapproved Chrome extension origins before token verification", async () => {
    const response = await POST(saveRequest({ Authorization: "Bearer cos_live_good", Origin: "chrome-extension://unknown" }));
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("access_denied");
    expect(routeMocks.saveInspirationWithExtensionToken).not.toHaveBeenCalled();
    expect(routeMocks.requireAdminForRoute).not.toHaveBeenCalled();
  });

  it("rejects extension-origin saves without falling back to admin session auth", async () => {
    routeMocks.requireAdminForRoute.mockResolvedValue({
      admin: { userId: "user-1" },
      ok: true,
    });

    const response = await POST(saveRequest({ Origin: "chrome-extension://creatoros" }));
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("unauthenticated");
    expect(routeMocks.requireAdminForRoute).not.toHaveBeenCalled();
    expect(routeMocks.saveInspirationWithExtensionToken).not.toHaveBeenCalled();
    expect(routeMocks.createInspiration).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer tokens before any admin save path can run", async () => {
    routeMocks.saveInspirationWithExtensionToken.mockResolvedValue({ error: "invalid_token", ok: false });

    const response = await POST(saveRequest({ Authorization: "Bearer cos_live_bad", Origin: "chrome-extension://creatoros" }));
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("unauthenticated");
    expect(routeMocks.saveInspirationWithExtensionToken).toHaveBeenCalledWith("cos_live_bad", expect.any(Object), { request: expect.any(NextRequest) });
    expect(routeMocks.requireAdminForRoute).not.toHaveBeenCalled();
    expect(routeMocks.createInspiration).not.toHaveBeenCalled();
  });

  it("lets valid extension tokens create inspiration and nothing else", async () => {
    routeMocks.saveInspirationWithExtensionToken.mockResolvedValue({
      data: {
        duplicate: false,
        inspiration: { id: "insp-1" },
      },
      ok: true,
    });

    const response = await POST(saveRequest({ Authorization: "Bearer cos_live_good", Origin: "chrome-extension://creatoros" }));
    const body = (await response.json()) as { data?: { duplicate?: boolean; inspiration_id?: string } };

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ duplicate: false, inspiration_id: "insp-1" });
    expect(routeMocks.saveInspirationWithExtensionToken).toHaveBeenCalledWith("cos_live_good", expect.any(Object), { request: expect.any(NextRequest) });
    expect(routeMocks.requireAdminForRoute).not.toHaveBeenCalled();
    expect(routeMocks.createInspiration).not.toHaveBeenCalled();
  });

  it("wraps unexpected extension save failures in a stable JSON envelope", async () => {
    routeMocks.saveInspirationWithExtensionToken.mockRejectedValue(new Error("database offline"));

    const response = await POST(saveRequest({ Authorization: "Bearer cos_live_good", Origin: "chrome-extension://creatoros" }));
    const body = (await response.json()) as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ code: "internal_error", message: "Extension save could not be completed." });
    expect(routeMocks.requireAdminForRoute).not.toHaveBeenCalled();
    expect(routeMocks.createInspiration).not.toHaveBeenCalled();
  });
});
