import OpenAI from "openai";

let client: OpenAI | undefined;

const PLACEHOLDER_KEY_RE = /^(sk-\.\.\.|your[_-]?openai|changeme|placeholder)/i;

export function resolveOpenAIConfig(): { apiKey: string | undefined; baseURL: string } {
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim();
  const baseURL =
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.openai.com/v1";
  return { apiKey, baseURL };
}

/** True when a real API key is present (not empty / placeholder). */
export function isOpenAIConfigured(): boolean {
  const { apiKey } = resolveOpenAIConfig();
  return !!apiKey && !PLACEHOLDER_KEY_RE.test(apiKey);
}

export function getOpenAIConfigError(): string {
  const { apiKey } = resolveOpenAIConfig();
  if (!apiKey) {
    return "OpenAI API key is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY in server/.env.";
  }
  if (PLACEHOLDER_KEY_RE.test(apiKey)) {
    return "OpenAI API key is a placeholder. Replace AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY with a real key in server/.env.";
  }
  return "OpenAI is not configured.";
}

function createClient(): OpenAI {
  const { apiKey, baseURL } = resolveOpenAIConfig();
  if (!isOpenAIConfigured()) {
    throw new Error(getOpenAIConfigError());
  }
  return new OpenAI({ apiKey: apiKey!, baseURL });
}

/** Lazily created — server can boot without AI keys; AI routes fail on first use. */
export function getOpenAI(): OpenAI {
  client ??= createClient();
  return client;
}

/** Back-compat export used by brands routes and batch helpers. */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const instance = getOpenAI();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
});
