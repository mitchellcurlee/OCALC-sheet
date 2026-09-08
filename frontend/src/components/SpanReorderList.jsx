import { useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Check, X, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { undergroundAbbr } from "@/lib/poleMapImage";

const Row = ({ item, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const isPole = item._type === "pole";
  const isRiser = item._type === "riser";
  const isNote = item._type === "note";
  return (
    <div ref={setNodeRef} style={style} data-testid={`span-reorder-row-${index}`} className={`flex items-center gap-3 p-2 bg-white border rounded ${isPole ? "border-zinc-200" : isRiser ? "border-l-4 border-l-orange-500 border-zinc-200" : isNote ? "border-l-4 border-l-amber-400 border-zinc-200" : "border-l-4 border-l-green-500 border-zinc-200"}`}>
      <div {...attributes} {...listeners} className="text-zinc-400 hover:text-zinc-600 cursor-grab active:cursor-grabbing touch-none" data-testid={`span-reorder-handle-${index}`}>
        <GripVertical className="w-5 h-5" />
      </div>
      <span className="text-xs font-mono text-zinc-500 w-6">{index + 1}</span>
      {isPole ? (
        <>
          <Zap className="w-4 h-4 text-yellow-600" />
          <span className="font-bold text-sm text-zinc-900">{item.pole_number || "No #"}</span>
        </>
      ) : isNote ? (
        <>
          <span className="w-9 h-5 flex items-center justify-center bg-amber-400 text-white font-mono text-[10px] font-bold rounded">NOTE</span>
          <span className="text-sm text-amber-800 truncate">{item.text}</span>
        </>
      ) : isRiser ? (
        <>
          <span className="w-9 h-5 flex items-center justify-center bg-orange-500 text-white font-mono text-[10px] font-bold rounded">RSR</span>
          <span className="font-bold text-sm text-zinc-900">{item.pole_number || "Pole"} New Riser{item.risers > 1 ? ` ×${item.risers}` : ""} = {item.risers * item.riser_height} ft</span>
        </>
      ) : (
        <>
          <span className="w-9 h-5 flex items-center justify-center bg-green-600 text-white font-mono text-[10px] font-bold rounded">{undergroundAbbr(item.type)}</span>
          <span className="font-bold text-sm text-zinc-900">{item.type}{item.label && item.label !== item.type ? ` · ${item.label}` : ""}</span>
        </>
      )}
      {!isRiser && !isNote && !(item.latitude && item.longitude) && <span className="text-[10px] text-zinc-400 ml-auto">no GPS</span>}
    </div>
  );
};

export const SpanReorderList = ({ initialItems, onSave, onSaveSync, onCancel, saving }) => {
  const [items, setItems] = useState(initialItems);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) {
      setItems((its) => arrayMove(its, its.findIndex((i) => i.id === active.id), its.findIndex((i) => i.id === over.id)));
    }
  };
  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3" data-testid="span-reorder-panel">
      <p className="text-xs text-amber-700 mb-2">Drag items to fine-tune the route order, then save. Span measurements and default connections follow this order.</p>
      <div className="flex justify-end gap-2 mb-3">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} className="bg-white" data-testid="span-reorder-cancel-top-btn"><X className="w-4 h-4 mr-1" />Cancel</Button>
        <Button size="sm" onClick={() => onSave(items)} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white" data-testid="span-reorder-save-top-btn">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}Save Order
        </Button>
        <Button size="sm" onClick={() => onSaveSync(items)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white" title="Save order, rebuild default connection lines to match it, and re-sync span distances from GPS" data-testid="span-reorder-save-sync-top-btn">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Save &amp; Sync
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {items.map((item, idx) => <Row key={item.id} item={item} index={idx} />)}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} className="bg-white" data-testid="span-reorder-cancel-btn"><X className="w-4 h-4 mr-1" />Cancel</Button>
        <Button size="sm" onClick={() => onSave(items)} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white" data-testid="span-reorder-save-btn">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}Save Order
        </Button>
        <Button size="sm" onClick={() => onSaveSync(items)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white" title="Save order, rebuild default connection lines to match it, and re-sync span distances from GPS" data-testid="span-reorder-save-sync-btn">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Save &amp; Sync
        </Button>
      </div>
    </div>
  );
};

export default SpanReorderList;
