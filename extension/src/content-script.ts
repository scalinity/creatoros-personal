type SaveRequestMessage = {
  type: "creatoros:collect-selection";
};

type SaveResponsePayload = {
  author_username: null | string;
  captured_at: string;
  post_id: null | string;
  post_url: null | string;
  text: string;
};

type ChromeLike = {
  runtime?: {
    onMessage?: {
      addListener(listener: (message: SaveRequestMessage, sender: unknown, sendResponse: (response: SaveResponsePayload | { error: string }) => void) => boolean | void): void;
    };
  };
};

function closestArticle() {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest("article") ?? document.activeElement?.closest("article") ?? null;
}

function statusLinkFromArticle(article: Element | null) {
  return article?.querySelector<HTMLAnchorElement>('a[href*="/status/"]')?.href ?? null;
}

function usernameFromArticle(article: Element | null) {
  const match = /x\.com\/([^/]+)\/status|twitter\.com\/([^/]+)\/status/.exec(statusLinkFromArticle(article) ?? "");
  return match?.[1] ?? match?.[2] ?? null;
}

function postIdFromUrl(url: string | null) {
  if (!url) return null;
  return /\/status\/(\d+)/.exec(url)?.[1] ?? null;
}

function postUrlFromArticle(article: Element | null) {
  const articleUrl = statusLinkFromArticle(article);
  if (articleUrl) return articleUrl;
  return postIdFromUrl(window.location.href) ? window.location.href : null;
}

function selectedText(article: Element | null) {
  const selected = window.getSelection()?.toString().trim();
  if (selected) return selected;
  return article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function collectPayload(): SaveResponsePayload | { error: string } {
  const article = closestArticle();
  const text = selectedText(article);
  const url = postUrlFromArticle(article);

  if (!text) {
    return { error: "Select text or focus an X post before saving." };
  }

  return {
    author_username: usernameFromArticle(article),
    captured_at: new Date().toISOString(),
    post_id: postIdFromUrl(url),
    post_url: url,
    text,
  };
}

const chromeApi = (globalThis as unknown as { chrome?: ChromeLike }).chrome;
chromeApi?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "creatoros:collect-selection") return false;
  sendResponse(collectPayload());
  return false;
});

export {};
