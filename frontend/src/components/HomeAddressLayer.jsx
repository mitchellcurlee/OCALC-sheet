import { useEffect, useRef, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import axios from "axios";

const MIN_ZOOM = 17;

const addrIcon = (num) =>
  L.divIcon({
    className: "home-address-label",
    html: `<div style="background:rgba(255,255,255,.92);color:#1e293b;border:1px solid #94a3b8;border-radius:3px;padding:1px 4px;font:600 10px/1.2 ui-monospace,monospace;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.35);pointer-events:auto;">${num}</div>`,
    iconSize: null,
    iconAnchor: [0, 8],
  });

// House numbers per lot from the USDOT National Address Database for the visible area
export const HomeAddressLayer = ({ enabled, onStatus }) => {
  const map = useMap();
  const [rows, setRows] = useState([]);
  const cacheRef = useRef({});
  const timerRef = useRef(null);

  const load = () => {
    if (!enabled) return;
    const z = map.getZoom();
    if (z < MIN_ZOOM) { setRows([]); onStatus?.("zoom"); return; }
    const b = map.getBounds().pad(0.15);
    const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(4)).join(",");
    if (cacheRef.current[key]) { setRows(cacheRef.current[key]); onStatus?.(cacheRef.current[key].length ? "ok" : "none"); return; }
    onStatus?.("loading");
    axios.get("/maps/addresses", { params: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() } })
      .then((r) => {
        const list = r.data?.addresses || [];
        cacheRef.current[key] = list;
        setRows(list);
        onStatus?.(r.data?.too_wide ? "zoom" : list.length ? "ok" : "none");
      })
      .catch(() => onStatus?.("error"));
  };

  const schedule = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(load, 350);
  };

  useMapEvents({ moveend: schedule, zoomend: schedule });
  useEffect(() => { if (enabled) load(); else setRows([]); /* eslint-disable-next-line */ }, [enabled]);

  if (!enabled) return null;
  return rows.map((a, i) => (
    <Marker
      key={`addr-${i}-${a.lat}-${a.lng}`}
      position={[a.lat, a.lng]}
      icon={addrIcon(a.unit ? `${a.num} #${a.unit}` : a.num)}
      interactive={true}
      zIndexOffset={-200}
      title={`${a.num}${a.unit ? ` #${a.unit}` : ""} ${a.street}, ${a.city} ${a.zip}`}
    />
  ));
};

export default HomeAddressLayer;
