import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Pencil, Type, Circle, Square, Minus, Undo, Redo, Trash2, 
  Save, MousePointer, List, Waypoints, GitBranch
} from "lucide-react";
import { UG_MARKERS, LINE_COLORS, SHAPES } from "./MarkupConstants";

/**
 * MarkupToolbar - Tool selection panel for PhotoMarkupEditor
 */
export const MarkupToolbar = ({
  // Tool state
  tool,
  setTool,
  selectedMarker,
  setSelectedMarker,
  selectedShape,
  setSelectedShape,
  selectedIcon,
  setSelectedIcon,
  
  // Color/Size state
  lineColor,
  setLineColor,
  lineWidth,
  setLineWidth,
  fillShape,
  setFillShape,
  markerSize,
  setMarkerSize,
  textInput,
  setTextInput,
  textColor,
  setTextColor,
  fontSize,
  setFontSize,
  labelSize,
  setLabelSize,
  iconSize,
  setIconSize,
  iconColor,
  setIconColor,
  
  // Polyline state
  polylinePoints,
  finishPolyline,
  cancelPolyline,
  
  // Selection state
  selectedAnnotation,
  annotations,
  
  // Resize handlers
  resizeSelectedMarker,
  resizeSelectedLabel,
  resizeSelectedText,
  deleteSelectedAnnotation,
  
  // History handlers
  historyIndex,
  history,
  undo,
  redo,
  clearAnnotations,
  
  // Legend
  showLegend,
  setShowLegend,
  
  // Save
  saveMarkup,
  
  // Job data
  undergroundItems = [],
  poles = []
}) => {
  return (
    <div className="w-64 border-r bg-zinc-50 p-3 space-y-3 overflow-y-auto">
      {/* Tool selection */}
      <div className="space-y-2">
        <Label className="text-xs font-mono">TOOLS</Label>
        <div className="grid grid-cols-5 gap-1">
          <Button
            type="button"
            size="sm"
            variant={tool === "select" ? "default" : "outline"}
            onClick={() => setTool("select")}
            className="h-8 p-0"
            title="Select & Move"
          >
            <MousePointer className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "draw" ? "default" : "outline"}
            onClick={() => setTool("draw")}
            className="h-8 p-0"
            title="Freehand Draw"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "straightline" ? "default" : "outline"}
            onClick={() => setTool("straightline")}
            className="h-8 p-0"
            title="Straight Line"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "polyline" ? "default" : "outline"}
            onClick={() => setTool("polyline")}
            className="h-8 p-0"
            title="Multi-Point Line"
          >
            <Waypoints className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "shape" ? "default" : "outline"}
            onClick={() => setTool("shape")}
            className="h-8 p-0"
            title="Shapes"
          >
            <Square className="w-4 h-4" />
          </Button>
        </div>
        <div className="grid grid-cols-5 gap-1">
          <Button
            type="button"
            size="sm"
            variant={tool === "marker" ? "default" : "outline"}
            onClick={() => setTool("marker")}
            className="h-8 p-0"
            title="Markers"
          >
            <Circle className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "label" ? "default" : "outline"}
            onClick={() => setTool("label")}
            className="h-8 p-0"
            title="Insertable Labels"
          >
            <GitBranch className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "text" ? "default" : "outline"}
            onClick={() => setTool("text")}
            className="h-8 p-0"
            title="Text"
          >
            <Type className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "icon" ? "default" : "outline"}
            onClick={() => setTool("icon")}
            className="h-8 p-0"
            title="UG Icons"
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Polyline controls */}
      {tool === "polyline" && (
        <div className="space-y-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
          <Label className="text-xs font-mono text-blue-700">MULTI-POINT LINE</Label>
          <p className="text-xs text-blue-600">Click to add points. Double-click to finish.</p>
          {polylinePoints.length > 0 && (
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={finishPolyline}
                className="flex-1 h-7 text-xs bg-blue-600"
                disabled={polylinePoints.length < 2}
              >
                Finish ({polylinePoints.length} pts)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancelPolyline}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* Straight line info */}
      {tool === "straightline" && (
        <div className="p-2 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-xs text-orange-600">Click and drag to draw a straight line.</p>
        </div>
      )}

      {/* Shapes */}
      {tool === "shape" && (
        <div className="space-y-2">
          <Label className="text-xs font-mono">SHAPES</Label>
          <div className="grid grid-cols-5 gap-1">
            {SHAPES.map(s => (
              <Button
                key={s.type}
                type="button"
                size="sm"
                variant={selectedShape === s.type ? "default" : "outline"}
                onClick={() => setSelectedShape(s.type)}
                className="h-8 p-0"
                title={s.label}
              >
                <s.icon className="w-4 h-4" />
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={fillShape} 
              onChange={(e) => setFillShape(e.target.checked)}
              className="rounded"
            />
            Fill shape
          </label>
        </div>
      )}

      {/* Colors */}
      <div className="space-y-2">
        <Label className="text-xs font-mono">COLOR</Label>
        <div className="flex flex-wrap gap-1">
          {LINE_COLORS.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setLineColor(c.value)}
              className={`w-6 h-6 rounded border-2 ${lineColor === c.value ? 'border-blue-500 scale-110' : 'border-zinc-300'}`}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
        </div>
      </div>

      {/* Line width */}
      {(tool === "draw" || tool === "shape" || tool === "straightline" || tool === "polyline") && (
        <div className="space-y-2">
          <Label className="text-xs font-mono">LINE WIDTH: {lineWidth}px</Label>
          <Slider
            value={[lineWidth]}
            onValueChange={([v]) => setLineWidth(v)}
            min={1}
            max={20}
            step={1}
            className="w-full"
          />
        </div>
      )}
      
      {/* Insertable Labels tool */}
      {tool === "label" && (
        <div className="space-y-2">
          <Label className="text-xs font-mono text-purple-700">INSERTABLE LABELS</Label>
          <p className="text-xs text-zinc-500">Select a label, then click on the image to place it.</p>
          
          {/* Job Underground Labels */}
          {undergroundItems.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] font-mono text-green-700">UNDERGROUND ({undergroundItems.length})</Label>
              <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto bg-green-50 p-2 rounded">
                {undergroundItems.map((item, idx) => {
                  const abbr = item.type?.substring(0, 2).toUpperCase() || "UG";
                  const baseLabel = item.label || `${abbr}-${idx + 1}`;
                  const stationNum = item.stationNumber || "";
                  const fullLabel = stationNum ? `${baseLabel} ${stationNum}` : baseLabel;
                  return (
                    <button
                      key={item.id || idx}
                      type="button"
                      onClick={() => setTextInput(fullLabel)}
                      className={`p-1.5 text-[10px] font-mono rounded border text-left ${
                        textInput === fullLabel 
                          ? 'bg-green-200 border-green-500' 
                          : 'border-green-300 hover:bg-green-100 bg-white'
                      }`}
                      title={`${item.type}: ${fullLabel}`}
                    >
                      <span className="font-bold">{baseLabel}</span>
                      {stationNum && <span className="text-green-700 ml-1">{stationNum}</span>}
                      <span className="text-zinc-400 ml-1">({item.type?.substring(0, 3)})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Job Pole Labels */}
          {poles.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] font-mono text-orange-700">POLES ({poles.length})</Label>
              <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto bg-orange-50 p-2 rounded">
                {poles.map((pole, idx) => {
                  const baseLabel = pole.pole_number || `P-${idx + 1}`;
                  const stationNum = pole.stationNumber || "";
                  const fullLabel = stationNum ? `${baseLabel} ${stationNum}` : baseLabel;
                  return (
                    <button
                      key={pole.id || idx}
                      type="button"
                      onClick={() => setTextInput(fullLabel)}
                      className={`p-1.5 text-[10px] font-mono rounded border text-left ${
                        textInput === fullLabel 
                          ? 'bg-orange-200 border-orange-500' 
                          : 'border-orange-300 hover:bg-orange-100 bg-white'
                      }`}
                      title={`Pole: ${fullLabel}`}
                    >
                      <span className="font-bold">{baseLabel}</span>
                      {stationNum && <span className="text-orange-700 ml-1">{stationNum}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Custom label input */}
          <div className="space-y-1">
            <Label className="text-[10px] font-mono">CUSTOM LABEL</Label>
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type custom label..."
              className="text-xs h-8"
            />
          </div>
          
          {/* Label size */}
          <div className="space-y-1">
            <Label className="text-xs font-mono">LABEL SIZE: {labelSize}px</Label>
            <Slider
              value={[labelSize]}
              onValueChange={([v]) => setLabelSize(v)}
              min={10}
              max={32}
              step={1}
              className="w-full"
            />
          </div>
          
          {textInput && (
            <p className="text-xs text-purple-600 bg-purple-50 p-2 rounded">
              Click on image to place: <strong>{textInput}</strong>
            </p>
          )}
        </div>
      )}

      {/* Underground markers */}
      {tool === "marker" && (
        <div className="space-y-2">
          {/* Job-specific underground labels */}
          {undergroundItems.length > 0 && (
            <>
              <Label className="text-xs font-mono text-green-700">JOB UNDERGROUND ({undergroundItems.length})</Label>
              <div className="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto bg-green-50 p-2 rounded">
                {undergroundItems.map((item, idx) => {
                  const abbr = item.type?.substring(0, 2).toUpperCase() || "UG";
                  const baseLabel = item.label || `${abbr}-${idx + 1}`;
                  const stationNum = item.stationNumber || "";
                  const fullLabel = stationNum ? `${baseLabel} ${stationNum}` : baseLabel;
                  return (
                    <button
                      key={item.id || idx}
                      type="button"
                      onClick={() => {
                        setSelectedMarker(fullLabel);
                        setTextInput(fullLabel);
                      }}
                      className={`p-1 text-[10px] font-mono rounded border text-left ${
                        selectedMarker === fullLabel 
                          ? 'bg-green-200 border-green-500' 
                          : 'border-green-300 hover:bg-green-100 bg-white'
                      }`}
                      title={`${item.type}: ${fullLabel}`}
                    >
                      <span className="font-bold">{baseLabel}</span>
                      {stationNum && <span className="text-green-700 ml-1">{stationNum}</span>}
                      <span className="text-zinc-400 ml-1">({item.type?.substring(0, 3)})</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          
          {/* Job-specific pole labels */}
          {poles.length > 0 && (
            <>
              <Label className="text-xs font-mono text-orange-700">JOB POLES ({poles.length})</Label>
              <div className="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto bg-orange-50 p-2 rounded">
                {poles.map((pole, idx) => {
                  const baseLabel = pole.pole_number || `P-${idx + 1}`;
                  const stationNum = pole.stationNumber || "";
                  const fullLabel = stationNum ? `${baseLabel} ${stationNum}` : baseLabel;
                  return (
                    <button
                      key={pole.id || idx}
                      type="button"
                      onClick={() => {
                        setSelectedMarker(fullLabel);
                        setTextInput(fullLabel);
                      }}
                      className={`p-1 text-[10px] font-mono rounded border text-left ${
                        selectedMarker === fullLabel 
                          ? 'bg-orange-200 border-orange-500' 
                          : 'border-orange-300 hover:bg-orange-100 bg-white'
                      }`}
                      title={`Pole: ${fullLabel}`}
                    >
                      <span className="font-bold">{baseLabel}</span>
                      {stationNum && <span className="text-orange-700 ml-1">{stationNum}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          
          <Label className="text-xs font-mono">UG MARKERS</Label>
          <div className="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto">
            {UG_MARKERS.map(m => (
              <button
                key={m.type}
                type="button"
                onClick={() => setSelectedMarker(m.type)}
                className={`p-1 text-[10px] font-mono rounded border ${
                  selectedMarker === m.type 
                    ? 'bg-blue-100 border-blue-500' 
                    : 'border-zinc-300 hover:bg-zinc-100'
                }`}
                style={{ color: m.color }}
                title={m.label}
              >
                {m.type}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-mono">MARKER SIZE: {markerSize}px</Label>
            <Slider
              value={[markerSize]}
              onValueChange={([v]) => setMarkerSize(v)}
              min={16}
              max={48}
              step={2}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Text input */}
      {tool === "text" && (
        <div className="space-y-2">
          <Label className="text-xs font-mono">TEXT BOX</Label>
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter text..."
            className="h-8 text-sm"
          />
          <div className="space-y-1">
            <Label className="text-xs font-mono">FONT SIZE: {fontSize}px</Label>
            <Slider
              value={[fontSize]}
              onValueChange={([v]) => setFontSize(v)}
              min={10}
              max={48}
              step={2}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-mono">TEXT COLOR</Label>
            <div className="flex gap-1 flex-wrap">
              {["#18181b", "#dc2626", "#16a34a", "#2563eb", "#9333ea", "#f97316"].map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setTextColor(color)}
                  className={`w-6 h-6 rounded border-2 ${textColor === color ? 'border-blue-500' : 'border-zinc-300'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <p className="text-[10px] text-zinc-500">Click on image to place text with white background box</p>
        </div>
      )}
      
      {/* Underground Icons tool */}
      {tool === "icon" && (
        <div className="space-y-2">
          <Label className="text-xs font-mono text-green-700">UNDERGROUND ICONS</Label>
          <p className="text-xs text-zinc-500">Select an icon, then click on the image to place it.</p>
          
          <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto bg-zinc-50 p-2 rounded">
            {UG_MARKERS.map(m => (
              <button
                key={m.type}
                type="button"
                onClick={() => setSelectedIcon(m.type)}
                className={`p-2 text-[10px] font-mono rounded border flex flex-col items-center ${
                  selectedIcon === m.type 
                    ? 'bg-green-100 border-green-500' 
                    : 'border-zinc-300 hover:bg-zinc-100 bg-white'
                }`}
                title={m.label}
              >
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold mb-1"
                  style={{ backgroundColor: iconColor }}
                >
                  {m.type}
                </div>
                <span className="text-[8px] text-zinc-500 truncate w-full text-center">{m.label.substring(0, 8)}</span>
              </button>
            ))}
          </div>
          
          <div className="space-y-1">
            <Label className="text-xs font-mono">ICON SIZE: {iconSize}px</Label>
            <Slider
              value={[iconSize]}
              onValueChange={([v]) => setIconSize(v)}
              min={20}
              max={64}
              step={2}
              className="w-full"
            />
          </div>
          
          <div className="space-y-1">
            <Label className="text-xs font-mono">ICON COLOR</Label>
            <div className="flex gap-1 flex-wrap">
              {["#16a34a", "#2563eb", "#dc2626", "#f97316", "#9333ea", "#64748b", "#18181b"].map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setIconColor(color)}
                  className={`w-6 h-6 rounded border-2 ${iconColor === color ? 'border-blue-500' : 'border-zinc-300'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          
          {selectedIcon && (
            <p className="text-xs text-green-600 bg-green-50 p-2 rounded">
              Click on image to place: <strong>{selectedIcon}</strong>
            </p>
          )}
        </div>
      )}

      {/* Selected annotation controls */}
      {tool === "select" && selectedAnnotation !== null && (
        <div className="space-y-2 p-2 bg-blue-50 rounded">
          <Label className="text-xs font-mono text-blue-700">SELECTED ITEM</Label>
          <p className="text-xs text-blue-600">Drag to move</p>
          {annotations[selectedAnnotation]?.type === "marker" && (
            <div className="space-y-1">
              <Label className="text-xs">Marker: {annotations[selectedAnnotation]?.label}</Label>
              <Label className="text-xs">Resize:</Label>
              <Slider
                value={[annotations[selectedAnnotation]?.size || 24]}
                onValueChange={([v]) => resizeSelectedMarker(v)}
                min={16}
                max={48}
                step={2}
                className="w-full"
              />
            </div>
          )}
          {annotations[selectedAnnotation]?.type === "label" && (
            <div className="space-y-2">
              <div className="text-xs bg-white p-1 rounded border">
                <span className="font-bold">{annotations[selectedAnnotation]?.text}</span>
              </div>
              <Label className="text-xs">Resize label: {annotations[selectedAnnotation]?.fontSize || 14}px</Label>
              <Slider
                value={[annotations[selectedAnnotation]?.fontSize || 14]}
                onValueChange={([v]) => resizeSelectedLabel(v)}
                min={10}
                max={48}
                step={1}
                className="w-full"
              />
            </div>
          )}
          {annotations[selectedAnnotation]?.type === "text" && (
            <div className="space-y-2">
              <div className="text-xs bg-white p-1 rounded border">
                <span className="font-bold">{annotations[selectedAnnotation]?.text}</span>
              </div>
              <Label className="text-xs">Resize text: {annotations[selectedAnnotation]?.fontSize || 16}px</Label>
              <Slider
                value={[annotations[selectedAnnotation]?.fontSize || 16]}
                onValueChange={([v]) => resizeSelectedText(v)}
                min={10}
                max={48}
                step={1}
                className="w-full"
              />
            </div>
          )}
          {annotations[selectedAnnotation]?.type === "polyline" && (
            <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
              <p>Click and drag vertices to edit the line.</p>
            </div>
          )}
          {annotations[selectedAnnotation]?.type === "straightline" && (
            <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
              <p>Straight line selected.</p>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={deleteSelectedAnnotation}
            className="w-full h-8"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {/* History controls */}
      <div className="space-y-2">
        <Label className="text-xs font-mono">HISTORY</Label>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={undo}
            disabled={historyIndex < 0}
            className="flex-1 h-8"
          >
            <Undo className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="flex-1 h-8"
          >
            <Redo className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearAnnotations}
            className="flex-1 h-8 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Legend toggle */}
      <div className="space-y-2">
        <Label className="text-xs font-mono">LEGEND</Label>
        <Button
          type="button"
          size="sm"
          variant={showLegend ? "default" : "outline"}
          onClick={() => setShowLegend(!showLegend)}
          className="w-full h-8"
          data-testid="toggle-legend-btn"
        >
          <List className="w-4 h-4 mr-1" />
          {showLegend ? "Hide Legend" : "Show Legend"}
        </Button>
      </div>

      {/* Save button */}
      <Button
        type="button"
        onClick={saveMarkup}
        className="w-full bg-green-600 hover:bg-green-700"
      >
        <Save className="w-4 h-4 mr-2" />
        Save Markup
      </Button>
    </div>
  );
};

export default MarkupToolbar;
