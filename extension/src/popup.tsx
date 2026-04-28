import { saveInspiration, type ExtensionSavePayload } from "./api";

type ChromeLike = {
  storage?: {
    local?: {
      get(keys: string[]): Promise<Record<string, string | undefined>>;
      set(values: Record<string, string>): Promise<void>;
    };
  };
  tabs?: {
    query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number; url?: string }>>;
    sendMessage(tabId: number, message: { type: string }): Promise<ExtensionSavePayload | { error: string }>;
  };
};

const chromeApi = (globalThis as unknown as { chrome?: ChromeLike }).chrome;

function byId<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
}

function setStatus(message: string, tone: "error" | "neutral" | "success" = "neutral") {
  const status = byId<HTMLParagraphElement>("status");
  status.textContent = message;
  status.dataset.tone = tone;
}

async function activeTabPayload() {
  const [tab] = (await chromeApi?.tabs?.query({ active: true, currentWindow: true })) ?? [];
  if (!tab?.id) throw new Error("No active tab found.");
  const response = await chromeApi?.tabs?.sendMessage(tab.id, { type: "creatoros:collect-selection" });
  if (!response || "error" in response) throw new Error(response?.error ?? "Could not collect selected post text.");
  return response;
}

async function loadConfig() {
  const values = (await chromeApi?.storage?.local?.get(["creatoros_app_url", "creatoros_save_token"])) ?? {};
  const appUrl = values.creatoros_app_url?.trim();
  const token = values.creatoros_save_token?.trim();
  if (!appUrl || !token) throw new Error("Set the CreatorOS app URL and personal token in Options first.");
  return { appUrl, token };
}

async function saveCurrentSelection() {
  try {
    setStatus("Saving...");
    const [config, payload] = await Promise.all([loadConfig(), activeTabPayload()]);
    await saveInspiration(config, { ...payload, notes: byId<HTMLTextAreaElement>("notes").value, tags: ["extension"] });
    setStatus("Saved to CreatorOS.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Save failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  byId<HTMLButtonElement>("save").addEventListener("click", () => {
    void saveCurrentSelection();
  });
});

export {};
