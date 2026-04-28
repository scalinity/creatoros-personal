import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

const E2E_AUTH_COOKIE = "creatoros_e2e_admin";
const E2E_AUTH_HEADER = "x-creatoros-e2e-auth";
const E2E_AUTH_VALUE = process.env.CREATOROS_E2E_AUTH_SECRET ?? "missing-e2e-auth-secret";

async function grantE2eAdmin(page: Page) {
  if (page.url() === "about:blank") {
    await page.goto("/login");
  }

  await page.context().addCookies([
    {
      name: E2E_AUTH_COOKIE,
      url: new URL(page.url()).origin,
      value: E2E_AUTH_VALUE,
    },
  ]);
}

function e2eHeaders() {
  return { [E2E_AUTH_HEADER]: E2E_AUTH_VALUE };
}

async function expectOk(response: Awaited<ReturnType<APIRequestContext["post"]>>) {
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.ok).toBe(true);
  return body.data;
}

test.describe.configure({ mode: "serial" });

test.describe("Phase 24 production readiness smoke flows", () => {
  test("private routes deny anonymous access and dashboard loads with the E2E admin fixture", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?error=/);

    await grantE2eAdmin(page);
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("private session")).toBeVisible();
    await expect(page.getByLabel("Archive counts")).toContainText("Posts imported");
  });

  test("creates idea and generated output records with deterministic local fixtures", async ({ page }) => {
    await grantE2eAdmin(page);

    const ideaData = await expectOk(
      await page.request.post("/api/ideas", {
        data: {
          favorite: true,
          raw_text: "Phase 24 idea: make the smoke run prove the cockpit can write safely.",
          source: "manual",
          status: "inbox",
          tags: ["phase24", "smoke"],
          title: "Phase 24 smoke idea",
        },
        headers: e2eHeaders(),
      }),
    );

    const outputData = await expectOk(
      await page.request.post("/api/generated-outputs", {
        data: {
          favorite: false,
          input_id: ideaData.idea.id,
          input_type: "content_idea",
          provider: "mock",
          saved: true,
          text: "A saved generated output from the mocked Phase 24 fixture.",
          type: "x_post",
          variants: [{ rationale: "Phase 24 fixture", text: "A saved generated output from the mocked Phase 24 fixture." }],
        },
        headers: e2eHeaders(),
      }),
    );

    await page.goto(`/composer?selected=${ideaData.idea.id}`);
    await expect(page.getByLabel("Idea inbox").getByText("Phase 24 smoke idea")).toBeVisible();
    await expect(page.getByText("A saved generated output from the mocked Phase 24 fixture.")).toBeVisible();
    expect(outputData.output.id).toBeTruthy();
  });

  test("imports a post and surfaces it in post history", async ({ page }) => {
    await grantE2eAdmin(page);

    const importData = await expectOk(
      await page.request.post("/api/posts/import", {
        data: {
          is_owner_post: true,
          mode: "single",
          payload: {
            author_username: "creatoros",
            created_at_platform: "2026-04-28T13:00:00.000Z",
            format: "single",
            impression_count: 2400,
            like_count: 96,
            platform_post_id: "phase24-post-1",
            reply_count: 12,
            repost_count: 18,
            source: "manual",
            text: "Phase 24 imported post for smoke coverage.",
            topic: "Testing",
          },
        },
        headers: e2eHeaders(),
      }),
    );

    await page.goto(`/post-history?selected=${importData.post.id}`);
    await expect(page.getByText("manual imports and deterministic scoring")).toBeVisible();
    await expect(page.getByText("Phase 24 imported post for smoke coverage.")).toBeVisible();
  });

  test("analyzes a draft with mocked AI and saves a rewrite output", async ({ page }) => {
    await grantE2eAdmin(page);
    await page.goto("/algo-analyzer");

    await page.getByLabel("Draft textarea").fill("Phase 24 mocked AI analysis draft with a concrete owner payoff.");
    await page.getByRole("button", { name: "Analyze draft" }).click();

    await expect(page.getByText("Draft analysis saved with prompt run and report records.")).toBeVisible();
    await expect(page.getByLabel("Algorithm analysis result")).toContainText("9 metrics");
    await expect(page.getByRole("button", { name: "Save output" }).first()).toBeEnabled();

    await page.getByRole("button", { name: "Save output" }).first().click();
    await expect(page.getByText("Rewrite saved to generated outputs.")).toBeVisible();
  });

  test("creates a blog draft through the API and verifies the blog workspace", async ({ page }) => {
    await grantE2eAdmin(page);

    const blogData = await expectOk(
      await page.request.post("/api/blogs", {
        data: {
          categories: ["craft"],
          markdown: "# Phase 24 Blog\n\nThis smoke draft proves blog creation without live AI credentials.",
          source_type: "manual",
          status: "drafting",
          tags: ["phase24"],
          title: "Phase 24 Blog Draft",
        },
        headers: e2eHeaders(),
      }),
    );

    await page.goto(`/blogs?selected=${blogData.blog.id}`);
    await expect(page.getByRole("heading", { name: "Blogs" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Phase 24 Blog Draft/ })).toBeVisible();
  });

  test("creates, approves, dry-runs, and schedules a publishing draft", async ({ page }) => {
    await grantE2eAdmin(page);

    const draftData = await expectOk(
      await page.request.post("/api/publishing/drafts", {
        data: {
          content_type: "single_post",
          source_type: "manual",
          text: "Phase 24 publishing draft dry-run payload.",
          timezone: "UTC",
        },
        headers: e2eHeaders(),
      }),
    );

    const approvalData = await expectOk(
      await page.request.post(`/api/publishing/drafts/${draftData.draft.id}/approve`, {
        data: { confirmation: "approve exact payload" },
        headers: e2eHeaders(),
      }),
    );

    const dryRunData = await expectOk(
      await page.request.post(`/api/publishing/drafts/${draftData.draft.id}/publish`, {
        data: {
          confirmation: "confirm dry run",
          dry_run: true,
          payload_hash: approvalData.draft.approvalPayloadHash,
        },
        headers: e2eHeaders(),
      }),
    );

    const scheduleData = await expectOk(
      await page.request.post(`/api/publishing/drafts/${draftData.draft.id}/schedule`, {
        data: {
          scheduled_for: "2099-04-28T16:30:00.000Z",
          timezone: "America/New_York",
        },
        headers: e2eHeaders(),
      }),
    );

    await page.goto(`/publishing?selected=${draftData.draft.id}`);
    await expect(page.getByRole("heading", { name: "Publishing" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Phase 24 publishing draft dry-run payload/ })).toBeVisible();
    await expect(page.getByLabel("Publishing summary")).toContainText("Approved");
    await expect(page.getByLabel("Publishing summary")).toContainText("Scheduled");
    await expect(page.getByRole("complementary").filter({ hasText: "Approval rail" })).toContainText("scheduled");
    await expect(page.getByRole("complementary").filter({ hasText: "Approval rail" })).toContainText("approved");
    expect(dryRunData.job.status).toBe("succeeded");
    expect(scheduleData.draft.status).toBe("scheduled");
  });

  test("extension save endpoint rejects missing and invalid personal tokens", async ({ page }) => {
    await grantE2eAdmin(page);

    const missing = await page.request.post("/api/inspiration/save", {
      data: { platform: "x", text: "External source payload", url: "https://x.com/example/status/1" },
      headers: { origin: "chrome-extension://creatoros-e2e" },
    });
    expect(missing.status()).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "unauthenticated" }, ok: false });

    const invalid = await page.request.post("/api/inspiration/save", {
      data: { platform: "x", text: "External source payload", url: "https://x.com/example/status/2" },
      headers: { ...e2eHeaders(), authorization: "Bearer cos_live_invalid", origin: "chrome-extension://creatoros-e2e" },
    });
    expect(invalid.status()).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "unauthenticated" }, ok: false });
  });
});
