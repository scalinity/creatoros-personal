import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);

const authMock = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({
    email: "owner@example.com",
    supabase: {},
    user: { id: "user-1" },
    userId: "user-1",
  })),
}));

const voiceMock = vi.hoisted(() => ({
  generateVoiceProfile: vi.fn(async () => ({ id: "profile-1" })),
}));

const embeddingsMock = vi.hoisted(() => ({
  refreshEmbeddingsForUser: vi.fn(async () => ({
    jobId: "job-1",
    mode: "embedding" as const,
    refreshed: 2,
    skipped: 0,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth/admin", () => authMock);
vi.mock("@/lib/voice", () => voiceMock);
vi.mock("@/lib/embeddings", () => embeddingsMock);

import { recomputeVoiceProfileAction, refreshEmbeddingsAction } from "@/app/(app)/settings/ai/actions";

describe("Phase 13 settings AI actions", () => {
  it("redirects successful voice recompute with the generated profile id", async () => {
    redirectMock.mockClear();
    authMock.requireAdmin.mockClear();
    voiceMock.generateVoiceProfile.mockClear();

    await expect(recomputeVoiceProfileAction()).rejects.toThrow("NEXT_REDIRECT:/settings/ai?notice=voice_profile_generated&profile=profile-1");

    expect(voiceMock.generateVoiceProfile).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
    expect(redirectMock).toHaveBeenCalledWith("/settings/ai?notice=voice_profile_generated&profile=profile-1");
  });

  it("redirects successful embedding refresh as completed", async () => {
    redirectMock.mockClear();
    authMock.requireAdmin.mockClear();
    embeddingsMock.refreshEmbeddingsForUser.mockClear();

    await expect(refreshEmbeddingsAction()).rejects.toThrow("NEXT_REDIRECT:/settings/ai?notice=embedding_refresh_completed");

    expect(embeddingsMock.refreshEmbeddingsForUser).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
    expect(redirectMock).toHaveBeenCalledWith("/settings/ai?notice=embedding_refresh_completed");
  });
});
