type ChromeLike = {
  storage?: {
    local?: {
      get(keys: string[]): Promise<Record<string, string | undefined>>;
      set(values: Record<string, string>): Promise<void>;
    };
  };
};

const chromeApi = (globalThis as unknown as { chrome?: ChromeLike }).chrome;

function byId<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing options element: ${id}`);
  return element as T;
}

async function loadOptions() {
  const values = (await chromeApi?.storage?.local?.get(["creatoros_app_url", "creatoros_save_token"])) ?? {};
  byId<HTMLInputElement>("app-url").value = values.creatoros_app_url ?? "http://localhost:3000";
  byId<HTMLInputElement>("save-token").value = values.creatoros_save_token ?? "";
}

async function saveOptions() {
  const appUrl = byId<HTMLInputElement>("app-url").value.trim();
  const token = byId<HTMLInputElement>("save-token").value.trim();
  const status = byId<HTMLParagraphElement>("status");

  if (!appUrl || !token) {
    status.textContent = "App URL and personal save token are required.";
    status.dataset.tone = "error";
    return;
  }

  await chromeApi?.storage?.local?.set({ creatoros_app_url: appUrl, creatoros_save_token: token });
  status.textContent = "Saved locally in the browser extension.";
  status.dataset.tone = "success";
}

document.addEventListener("DOMContentLoaded", () => {
  void loadOptions();
  byId<HTMLFormElement>("options-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveOptions();
  });
});

export {};
