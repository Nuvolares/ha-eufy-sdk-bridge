/** SDK-advertised optical views; SDKs without the inventory expose only the default view. */
export function cameraViews(camera) {
  return camera?.views?.() ?? [0];
}

/** The primary source retains its serial and paths; additional views have stable source identifiers. */
export function cameraView(sn, view = 0) {
  const query = view === 0 ? "" : `?view=${view}`;
  return {
    view,
    id: view === 0 ? sn : `${sn}_view_${view}`,
    stream: `/stream/${sn}${query}`,
    snapshot: `/snapshot/${sn}${query}`,
  };
}

/** A non-negative safe-integer view selector, rejecting strings and other JSON values. */
export function validView(view) {
  return Number.isSafeInteger(view) && view >= 0;
}

/** One canonical integer query selector; omission preserves the SDK's default selection. */
export function requestedView(params) {
  const values = params.getAll("view");
  if (!values.length) return 0;
  if (values.length !== 1 || !/^(0|[1-9]\d*)$/.test(values[0]) || !validView(Number(values[0]))) {
    throw new RangeError("view must be specified once as a non-negative safe integer");
  }
  return Number(values[0]);
}

/**
 * [fork] Suffix of the H.264 twin go2rtc keeps beside every camera stream (`<id>_h264`). It transcodes on
 * demand only: nothing runs until a consumer opens the twin. A browser without H.265 WebRTC (most desktop
 * Chrome/Edge/Firefox) can then play an H.265 camera such as an S3 Pro behind an NVR.
 */
export const H264_SUFFIX = "_h264";
