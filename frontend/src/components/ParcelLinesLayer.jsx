import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

// TxGIO / TNRIS StratMap statewide land parcels (ArcGIS REST export, restyled to thin neutral lines).
const PARCEL_SERVICE = "https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer";
// White lines read well over aerial imagery; a neutral grey is used over the light street basemap.
const dynamicLayers = (color) => JSON.stringify([{
  id: 0,
  source: { type: "mapLayer", mapLayerId: 0 },
  drawingInfo: { renderer: { type: "simple", symbol: { type: "esriSFS", style: "esriSFSNull", outline: { type: "esriSLS", style: "esriSLSSolid", color, width: 0.8 } } } },
}]);
const COLORS = { aerial: [255, 255, 255, 215], street: [90, 90, 90, 200] };

const ParcelTileLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    const size = this.getTileSize();
    const nw = this._map.unproject(coords.scaleBy(size), coords.z);
    const se = this._map.unproject(coords.add([1, 1]).scaleBy(size), coords.z);
    const a = L.CRS.EPSG3857.project(nw);
    const b = L.CRS.EPSG3857.project(se);
    const params = new URLSearchParams({
      bbox: `${a.x},${b.y},${b.x},${a.y}`, bboxSR: "3857", imageSR: "3857",
      size: `${size.x},${size.y}`, format: "png32", transparent: "true", f: "image", dynamicLayers: dynamicLayers(this.options.lineColor),
    });
    return `${PARCEL_SERVICE}/export?${params.toString()}`;
  },
});

export const ParcelLinesLayer = ({ enabled, basemap = "aerial" }) => {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return undefined;
    const layer = new ParcelTileLayer("", { lineColor: COLORS[basemap] || COLORS.aerial, opacity: 0.75, minZoom: 11, maxZoom: 22, maxNativeZoom: 20, pane: "overlayPane", zIndex: 350, crossOrigin: "anonymous", attribution: "Parcels &copy; TxGIO/TNRIS StratMap" });
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, enabled, basemap]);
  return null;
};

export default ParcelLinesLayer;
