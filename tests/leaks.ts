import os from "node:os";

/** Strings that must never appear in anything Poachly outputs (built from parts so the repo scan stays clean). */
export const FAKE_SECRETS = {
  GLM_API_KEY: "fake-glm-key-7c1d9e2a5b",
  QLOO_API_KEY: "fake-qloo-key-3f8e6a0c4d",
  QLOO_HACKATHON_API_KEY: "fake-qloo-key-3f8e6a0c4d",
  KAGGLE_KEY: "fake-kaggle-key-91b2c3d4e5",
};

export function installFakeSecrets(): void {
  for (const [k, v] of Object.entries(FAKE_SECRETS)) process.env[k] = v;
}

const ENV_NAMES = ["GLM_API_KEY", "ZAI_API_KEY", "QLOO_API_KEY", "QLOO_HACKATHON_API_KEY", "KAGGLE_KEY"];
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const HOME = "/" + "home" + "/";

/** Every leak found in a text blob (empty = clean). */
export function findLeaks(text: string): string[] {
  const out: string[] = [];
  for (const v of Object.values(FAKE_SECRETS)) if (text.includes(v)) out.push(`secret value ${v.slice(0, 8)}…`);
  for (const n of ENV_NAMES) if (text.includes(n)) out.push(`env name ${n}`);
  if (text.includes(HOME)) out.push("home path");
  if (text.includes("root:x:0:0")) out.push("passwd content");
  if (text.includes(".ssh/")) out.push("ssh path");
  const host = os.hostname();
  if (host.length >= 5 && text.includes(host)) out.push("hostname");
  const ip = text.match(IPV4);
  if (ip) out.push(`ip ${ip[0]}`);
  if (/PATH=|HOME=/.test(text)) out.push("env assignment");
  return out;
}
