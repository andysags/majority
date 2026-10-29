// Cloudflare Turnstile, loaded on demand only for visitors who need a new
// session (or who sign in by e-mail). Returns a one-time token.

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not initialise")));
      s.onerror = () => {
        loading = null;
        reject(new Error("Turnstile script failed to load"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export async function getTurnstileToken(siteKey: string, container: HTMLElement): Promise<string> {
  const api = await loadScript();
  return new Promise((resolve, reject) => {
    const id = api.render(container, {
      sitekey: siteKey,
      appearance: "interaction-only", // only shown if Cloudflare needs the player to click
      language: "fr",
      callback: (token: string) => {
        resolve(token);
        setTimeout(() => api.remove(id), 0);
      },
      "error-callback": (code: string) => {
        reject(new Error(`Turnstile error ${code}`));
        setTimeout(() => api.remove(id), 0);
      },
      "timeout-callback": () => reject(new Error("Turnstile timeout")),
    });
  });
}
