import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5";

let client: Anthropic | undefined;

// Created lazily so scripts that never call Claude run without an API key.
export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env");
    client = new Anthropic({ apiKey });
  }
  return client;
}
