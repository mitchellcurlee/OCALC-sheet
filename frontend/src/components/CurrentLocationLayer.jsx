import { useEffect, useState } from "react";
import { Marker, Circle } from "react-leaflet";
import L from "leaflet";
import { LocateOff } from "lucide-react";

const dotIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:22px;height:22px">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,0.25);animation:cl-pulse 2s ease-out infinite"></div>
    <div style="position:absolute;left:5px;top:5px;width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>
  </div>
  <style>@keyframes cl-pulse{0%{transform:scale(.6);opacity:1}100%{transform:scale(2.2);opacity:0}}</style>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Blue "you are here" dot that follows the device GPS; asks for permission once on mount.
// Renders a small corner note instead when location is denied/unavailable.
export const CurrentLocationLayer = () => {
  const [pos, setPos] = useState(null);
  const [accuracy, setAccuracy] = useState(0);
  const [status, setStatus] = useState("pending"); // pending | ok | denied | unavailable

  useEffect(() => {
    if (!navigator.geolocation) { setStatus("unavailable"); return undefined; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude]);
        setAccuracy(p.coords.accuracy || 0);
        setStatus("ok");
      },
      (err) => setStatus(err.code === 1 ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  if (status === "ok" && pos) {
    return (
      <>
        {accuracy > 15 && <Circle center={pos} radius={accuracy} pathOptions={{ color: "#2563eb", weight: 1, fillOpacity: 0.08 }} interactive={false} />}
        <Marker position={pos} icon={dotIcon} zIndexOffset={2000} interactive={false} title="Your current location" />
      </>
    );
  }
  if (status === "pending") return null;
  return (
    <div className="leaflet-bottom leaflet-left" style={{ pointerEvents: "none" }}>
      <div className="leaflet-control m-2 flex items-center gap-1.5 rounded bg-white/90 px-2 py-1 text-[11px] font-mono text-zinc-600 shadow" data-testid="location-unavailable-indicator">
        <LocateOff className="h-3 w-3 text-zinc-400" />
        {status === "denied" ? "Location off — allow access in browser settings" : "Location unavailable"}
      </div>
    </div>
  );
};
