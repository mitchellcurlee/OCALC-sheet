import { Loader2, Pencil, Type, Square } from "lucide-react";
import { UG_MARKERS } from "./MarkupConstants";

/**
 * MarkupCanvas - Canvas rendering area with legend overlay
 */
export const MarkupCanvas = ({
  containerRef,
  canvasRef,
  imageLoaded,
  currentPhoto,
  tool,
  showLegend,
  getLegendItems,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleDoubleClick
}) => {
  return (
    <div ref={containerRef} className="flex-1 bg-zinc-900 flex items-center justify-center p-4 overflow-auto relative">
      {!imageLoaded && currentPhoto && (
        <div className="text-white text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>Loading image...</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        className={`bg-white shadow-lg ${tool === "select" ? 'cursor-default' : 'cursor-crosshair'} ${!imageLoaded ? 'hidden' : ''}`}
        style={{ maxWidth: "100%", maxHeight: "100%" }}
      />
      
      {/* Legend overlay */}
      {showLegend && imageLoaded && (
        <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-sm border border-zinc-300 rounded-lg shadow-lg p-3 max-w-xs" data-testid="photo-markup-legend">
          <h4 className="font-mono text-xs font-bold text-zinc-700 mb-2 border-b pb-1">LEGEND</h4>
          {getLegendItems().length === 0 ? (
            <p className="text-xs text-zinc-500 italic">No annotations yet</p>
          ) : (
            <div className="space-y-1.5">
              {getLegendItems().map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  {item.type === "marker" && (
                    <>
                      <span 
                        className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.label.split(" - ")[0]}
                      </span>
                      <span className="text-zinc-700">{item.label.split(" - ")[1]}</span>
                      <span className="text-zinc-400 ml-auto">×{item.count}</span>
                    </>
                  )}
                  {item.type === "shape" && (
                    <>
                      <Square className="w-4 h-4 text-zinc-600" />
                      <span className="text-zinc-700">{item.label}</span>
                      <span className="text-zinc-400 ml-auto">×{item.count}</span>
                    </>
                  )}
                  {item.type === "draw" && (
                    <>
                      <Pencil className="w-4 h-4 text-zinc-600" />
                      <span className="text-zinc-700">{item.label}</span>
                      <span className="text-zinc-400 ml-auto">×{item.count}</span>
                    </>
                  )}
                  {item.type === "text" && (
                    <>
                      <Type className="w-4 h-4 text-zinc-600" />
                      <span className="text-zinc-700">{item.label}</span>
                      <span className="text-zinc-400 ml-auto">×{item.count}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MarkupCanvas;
