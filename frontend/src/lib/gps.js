/**
 * Best-accuracy GPS fix. Phones return a coarse Wi-Fi/cell position first (often 100-300 m off);
 * we watch for up to maxMs and keep the most accurate fix, stopping early once accuracy <= goodM.
 * Resolves { lat, lng, accuracy, samples } or null (denied / unavailable). onUpdate(fix) is called on each improvement.
 */
export const getBestFix = ({ maxMs = 8000, goodM = 10, onUpdate } = {}) => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  let best = null, samples = 0, done = false, id = null;
  const finish = () => {
    if (done) return;
    done = true;
    if (id != null) navigator.geolocation.clearWatch(id);
    clearTimeout(timer);
    resolve(best ? { ...best, samples } : null);
  };
  const timer = setTimeout(finish, maxMs);
  id = navigator.geolocation.watchPosition(
    (pos) => {
      samples += 1;
      const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 9999, t: pos.timestamp || Date.now() };
      if (!best || fix.accuracy < best.accuracy) { best = fix; onUpdate?.({ ...fix, samples }); }
      if (best.accuracy <= goodM) finish();
    },
    (err) => { if (!best && (err.code === 1 || samples === 0)) finish(); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
  );
});

export const fmtAcc = (m) => (Number.isFinite(m) ? `±${Math.round(m)} m / ${Math.round(m * 3.281)} ft` : "");
