import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

const SortableTile = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`relative ${isDragging ? "z-20 opacity-90 scale-[1.02]" : ""}`} data-testid={`sortable-tile-${id}`}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-1/2 -translate-y-1/2 right-0.5 z-10 inline-flex items-center justify-center w-5 h-10 rounded text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200/70 cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        data-testid={`tile-drag-handle-${id}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
};

// Drag-to-reorder grid of job tiles (one month group). onReorder gets the new ordered id list.
export const SortableJobTiles = ({ jobs, renderJobCard, onReorder, className }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );
  const ids = jobs.map((j) => j.id);
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>
          {jobs.map((job) => <SortableTile key={job.id} id={job.id}>{renderJobCard(job)}</SortableTile>)}
        </div>
      </SortableContext>
    </DndContext>
  );
};
