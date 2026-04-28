export type ExtensionSavePayload = {
  author_display_name?: string | null;
  author_username?: string | null;
  captured_at: string;
  notes?: string | null;
  post_id?: string | null;
  post_url?: string | null;
  tags?: string[];
  text: string;
};

export type ExtensionSaveConfig = {
  appUrl: string;
  token: string;
};

function endpoint(appUrl: string) {
  return new URL("/api/inspiration/save", appUrl).toString();
}

export async function saveInspiration(config: ExtensionSaveConfig, payload: ExtensionSavePayload) {
  const response = await fetch(endpoint(config.appUrl), {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? JSON.stringify((body as { error?: unknown }).error) : "Save failed.";
    throw new Error(message);
  }

  return body;
}
