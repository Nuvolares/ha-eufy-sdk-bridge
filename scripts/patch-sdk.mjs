// [fork] Build-time patch of the installed @mega-yfue/eufy-sdk: serve more cameras through a T8N00 NVR.
//
// 1. The SDK opens a camera's live video through the NVR's media call only for models it has measured
//    (`isNvrMediaCamera`). Any other camera behind the NVR falls through to a P2P session on the NVR, which
//    never connects ("station T8N00…'s P2P session did not connect within 45100ms"). This adds the models in
//    NVR_EXTRA_MEDIA_MODELS (comma-separated, read at RUNTIME; default "T8172", the eufyCam S4).
// 2. On that media call the SDK offers the second lens (view 1, the PTZ lens) only for the models in
//    `isNvrDualLensCamera` (the S4 Max PoE, T8E00). This adds NVR_DUAL_LENS_MODELS (same format; default
//    "T8172", which has the same fixed + PTZ lens pair). It only matters for a model on the media call.
// 3. `cameraPowerTier` calls a camera "battery" when it has the battery capability and is not a known
//    mains model. A wired doorbell with a backup cell (a T8214 on a transformer) then gets every battery
//    rule: a 45 s live budget, no HLS in HA, no live stills. POWER_MAINS_MODELS (default "", none) makes
//    the listed models "wired". Only the tier changes: the battery-level properties keep their own check.
// Set any of these variables to "" to restore the SDK's own list without rebuilding.
//
// Run after `npm install`: `node scripts/patch-sdk.mjs`. Idempotent. Exits non-zero when the SDK no
// longer has the media-call check, so a changed SDK fails the build loudly instead of silently unpatched.
// The dual-lens check is newer (the stable SDK has none), so it is patched only where it exists.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MEDIA_MARKER = "__FORK_NVR_EXTRA_MEDIA_MODELS";
export const DUAL_LENS_MARKER = "__FORK_NVR_DUAL_LENS_MODELS";
export const MAINS_MARKER = "__FORK_POWER_MAINS_MODELS";
const SDK_BUNDLE = new URL("../node_modules/@mega-yfue/eufy-sdk/dist/index.js", import.meta.url);
const file = process.argv[2] ?? fileURLToPath(SDK_BUNDLE);

const modelSet = (marker, envName, fallback = "T8172") =>
  `var ${marker} = new Set((process.env.${envName} ?? "${fallback}")` +
  `.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));\n`;

/** Make the models in POWER_MAINS_MODELS "wired" in `cameraPowerTier` (prefix match, like the SDK's list). */
function patchPowerTier(src) {
  if (src.includes(MAINS_MARKER)) return { src, found: true, changed: false };
  const head = "function cameraPowerTier(model, capabilities) {";
  if (!src.includes(head)) return { src, found: false, changed: false };
  const isMains = `[...(${MAINS_MARKER} ?? [])].some((p) => (model ?? "").toUpperCase().startsWith(p))`;
  const patched = modelSet(MAINS_MARKER, "POWER_MAINS_MODELS", "") + `${head}\n  if (${isMains}) return "wired";`;
  return { src: src.replace(head, () => patched), found: true, changed: true };
}

/** Widen `var <name> = (ctx) => <expr>;` with the models in `marker`'s runtime set. */
function widen(src, name, marker, envName) {
  if (src.includes(marker)) return { src, found: true, changed: false };
  const re = new RegExp(`var ${name} = \\(ctx\\) => ([^;\\n]+);`);
  const m = src.match(re);
  if (!m) return { src, found: false, changed: false };
  const fn = `var ${name} = (ctx) => (${m[1]}) || ${marker}.has(ctx.model ?? "");`;
  return { src: src.replace(re, () => modelSet(marker, envName) + fn), found: true, changed: true };
}

export function patchSdk(src) {
  const media = widen(src, "isNvrMediaCamera", MEDIA_MARKER, "NVR_EXTRA_MEDIA_MODELS");
  if (!media.found)
    throw new Error("isNvrMediaCamera not found in the SDK bundle — the SDK changed; update this patch");
  const dual = widen(media.src, "isNvrDualLensCamera", DUAL_LENS_MARKER, "NVR_DUAL_LENS_MODELS");
  const power = patchPowerTier(dual.src);
  return { src: power.src, changed: media.changed || dual.changed || power.changed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { src, changed } = patchSdk(readFileSync(file, "utf8"));
    if (changed) writeFileSync(file, src, "utf8");
    const dual = src.includes(DUAL_LENS_MARKER) ? "with" : "WITHOUT (no isNvrDualLensCamera in this SDK)";
    const power = src.includes(MAINS_MARKER) ? "with" : "WITHOUT (no cameraPowerTier in this SDK)";
    const lists = `${dual} the dual-lens list, ${power} the mains-model list`;
    console.log(`[patch-sdk] ${changed ? "patched" : "already patched"} ${lists}: ${file}`);
  } catch (e) {
    console.error(`[patch-sdk] ${e.message}`);
    process.exit(1);
  }
}
