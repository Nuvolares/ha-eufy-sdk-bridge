// [fork] Build-time patch of the installed @mega-yfue/eufy-sdk: serve more cameras through a T8N00 NVR.
//
// The SDK opens a camera's live video through the NVR's media call only for models it has measured
// (`isNvrMediaCamera`). Any other camera behind the NVR falls through to a P2P session on the NVR, which
// never connects ("station T8N00…'s P2P session did not connect within 45100ms"). This adds the models in
// NVR_EXTRA_MEDIA_MODELS (comma-separated, read at RUNTIME; default "T8172", the eufyCam S4) to that check.
// Set NVR_EXTRA_MEDIA_MODELS="" to restore the SDK's own list without rebuilding.
//
// Run after `npm install`: `node scripts/patch-sdk.mjs`. Idempotent. Exits non-zero when the SDK no
// longer has the expected shape, so a changed SDK fails the build loudly instead of silently unpatched.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MARKER = "__FORK_NVR_EXTRA_MEDIA_MODELS";
const SDK_BUNDLE = new URL("../node_modules/@mega-yfue/eufy-sdk/dist/index.js", import.meta.url);
const file = process.argv[2] ?? fileURLToPath(SDK_BUNDLE);

export function patchSdk(src) {
  if (src.includes(MARKER)) return { src, changed: false };
  const re = /var isNvrMediaCamera = \(ctx\) => ([^;\n]+);/;
  const m = src.match(re);
  if (!m) throw new Error("isNvrMediaCamera not found in the SDK bundle — the SDK changed; update this patch");
  const extra =
    `var ${MARKER} = new Set((process.env.NVR_EXTRA_MEDIA_MODELS ?? "T8172")` +
    `.split(",").map((s) => s.trim()).filter(Boolean));\n`;
  const fn = `var isNvrMediaCamera = (ctx) => (${m[1]}) || ${MARKER}.has(ctx.model ?? "");`;
  return { src: src.replace(re, extra + fn), changed: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { src, changed } = patchSdk(readFileSync(file, "utf8"));
    if (changed) writeFileSync(file, src, "utf8");
    console.log(`[patch-sdk] ${changed ? "patched" : "already patched"}: ${file}`);
  } catch (e) {
    console.error(`[patch-sdk] ${e.message}`);
    process.exit(1);
  }
}
