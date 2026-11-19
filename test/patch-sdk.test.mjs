// [fork] The SDK patch widens the NVR media-camera check without touching anything else.
import { test } from "node:test";
import assert from "node:assert/strict";

import { patchSdk } from "../scripts/patch-sdk.mjs";

const BETA = [
  'var NVR_MEDIA_CAMERA_MODELS = /* @__PURE__ */ new Set(["T8E00", "T8P00"]);',
  "var isNvrMediaCamera = (ctx) => ctx.model !== void 0 && NVR_MEDIA_CAMERA_MODELS.has(ctx.model);",
  'var isNvrDualLensCamera = (ctx) => ctx.model === "T8E00";',
  "export { isNvrMediaCamera };",
].join("\n");

function load(src) {
  return new Function(`${src.replace("export { isNvrMediaCamera };", "")}\nreturn isNvrMediaCamera;`)();
}

test("[fork] patched check admits T8172 by default and keeps the SDK's own models", () => {
  const { src, changed } = patchSdk(BETA);
  assert.equal(changed, true);
  const prev = process.env.NVR_EXTRA_MEDIA_MODELS;
  delete process.env.NVR_EXTRA_MEDIA_MODELS;
  try {
    const isNvrMediaCamera = load(src);
    assert.equal(isNvrMediaCamera({ model: "T8172" }), true);
    assert.equal(isNvrMediaCamera({ model: "T8E00" }), true);
    assert.equal(isNvrMediaCamera({ model: "T8999" }), false);
    assert.equal(isNvrMediaCamera({}), false);
  } finally {
    if (prev !== undefined) process.env.NVR_EXTRA_MEDIA_MODELS = prev;
  }
});

test("[fork] NVR_EXTRA_MEDIA_MODELS overrides the extra list, and empty restores the SDK list", () => {
  const { src } = patchSdk(BETA);
  const prev = process.env.NVR_EXTRA_MEDIA_MODELS;
  try {
    process.env.NVR_EXTRA_MEDIA_MODELS = " T8999 , T8172 ";
    assert.equal(load(src)({ model: "T8999" }), true);
    process.env.NVR_EXTRA_MEDIA_MODELS = "";
    assert.equal(load(src)({ model: "T8172" }), false);
  } finally {
    if (prev === undefined) delete process.env.NVR_EXTRA_MEDIA_MODELS;
    else process.env.NVR_EXTRA_MEDIA_MODELS = prev;
  }
});

test("[fork] the patch is idempotent and the stable SDK's inline check is patched too", () => {
  const once = patchSdk(BETA).src;
  assert.deepEqual(patchSdk(once), { src: once, changed: false });
  const stable = 'var isNvrMediaCamera = (ctx) => ctx.model === "T8E00" || ctx.model === "T8P00";';
  const prev = process.env.NVR_EXTRA_MEDIA_MODELS;
  delete process.env.NVR_EXTRA_MEDIA_MODELS;
  try {
    const patched = load(patchSdk(stable).src);
    assert.equal(patched({ model: "T8P00" }), true);
    assert.equal(patched({ model: "T8172" }), true);
  } finally {
    if (prev !== undefined) process.env.NVR_EXTRA_MEDIA_MODELS = prev;
  }
});

function loadDual(src) {
  return new Function(`${src.replace("export { isNvrMediaCamera };", "")}\nreturn isNvrDualLensCamera;`)();
}

test("[fork] the dual-lens check admits T8172 by default, keeps T8E00, and is overridable", () => {
  const { src } = patchSdk(BETA);
  const prev = process.env.NVR_DUAL_LENS_MODELS;
  try {
    delete process.env.NVR_DUAL_LENS_MODELS;
    const isDual = loadDual(src);
    assert.equal(isDual({ model: "T8172" }), true);
    assert.equal(isDual({ model: "T8E00" }), true);
    assert.equal(isDual({ model: "T8162" }), false);
    process.env.NVR_DUAL_LENS_MODELS = "";
    assert.equal(loadDual(src)({ model: "T8172" }), false);
    assert.equal(loadDual(src)({ model: "T8E00" }), true);
  } finally {
    if (prev === undefined) delete process.env.NVR_DUAL_LENS_MODELS;
    else process.env.NVR_DUAL_LENS_MODELS = prev;
  }
});

test("[fork] an SDK without the dual-lens check still gets the media patch", () => {
  const { src, changed } = patchSdk('var isNvrMediaCamera = (ctx) => ctx.model === "T8E00";');
  assert.equal(changed, true);
  assert.ok(src.includes("__FORK_NVR_EXTRA_MEDIA_MODELS"));
  assert.ok(!src.includes("__FORK_NVR_DUAL_LENS_MODELS"));
});

test("[fork] a changed SDK fails the patch loudly", () => {
  assert.throws(() => patchSdk("var somethingElse = 1;"), /isNvrMediaCamera not found/);
});
