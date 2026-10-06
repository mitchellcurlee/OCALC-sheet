import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PoleForm } from "@/components/PoleForm";

/** Previous / next pole stepper shown above the form when editing inside a job */
const PoleNav = ({ jobId, poles, id, fromMap }) => {
  const idx = poles.findIndex((p) => p.id === id);
  const prev = idx > 0 ? poles[idx - 1] : null;
  const next = idx >= 0 && idx < poles.length - 1 ? poles[idx + 1] : null;
  const href = (p) => `/jobs/${jobId}/edit/${p.id}${fromMap ? "?from=map" : ""}`;
  return (
    <div className="flex items-center justify-between bg-white border-b border-zinc-200 px-4 py-2" data-testid="pole-navigation">
      <Link to={prev ? href(prev) : "#"} className={!prev ? "pointer-events-none opacity-40" : ""}>
        <Button variant="outline" size="sm" disabled={!prev} className="flex items-center gap-1 text-zinc-700" data-testid="prev-pole-btn">
          <ChevronLeft className="w-4 h-4" /><span className="hidden sm:inline">Previous</span>
          {prev && <span className="font-mono text-xs ml-1">({prev.pole_number || "No #"})</span>}
        </Button>
      </Link>
      <span className="text-sm text-zinc-500 font-mono" data-testid="pole-counter">Pole {idx + 1} of {poles.length}</span>
      <Link to={next ? href(next) : "#"} className={!next ? "pointer-events-none opacity-40" : ""}>
        <Button variant="outline" size="sm" disabled={!next} className="flex items-center gap-1 text-zinc-700" data-testid="next-pole-btn">
          {next && <span className="font-mono text-xs mr-1">({next.pole_number || "No #"})</span>}
          <span className="hidden sm:inline">Next</span><ChevronRight className="w-4 h-4" />
        </Button>
      </Link>
    </div>
  );
};

/** One page for both /jobs/:jobId/add and /jobs/:jobId/edit/:id — the route decides create vs edit. */
export default function PoleEditor() {
  const navigate = useNavigate();
  const { id, jobId } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const fromMap = searchParams.get("from") === "map";
  const backUrl = !jobId ? "/" : fromMap ? `/jobs/${jobId}/map${isEdit ? `?focus=${id}` : ""}` : `/jobs/${jobId}`;

  const [pole, setPole] = useState(null);
  const [poles, setPoles] = useState([]);
  const [fetching, setFetching] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!isEdit) return;
    setFetching(true);
    setPole(null);
    try {
      const [p, list] = await Promise.all([
        axios.get(`/poles/${id}?_t=${Date.now()}`),
        jobId ? axios.get(`/jobs/${jobId}/poles?_t=${Date.now()}`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setPole(p.data);
      setPoles(list.data || []);
    } catch {
      toast.error("Failed to fetch pole data");
      navigate(backUrl);
    } finally {
      setFetching(false);
    }
  }, [isEdit, id, jobId, navigate, backUrl]);

  useEffect(() => { load(); window.scrollTo(0, 0); }, [load]);

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (isEdit) await axios.put(`/poles/${id}`, payload);
      else await axios.post("/poles", payload);
      toast.success(isEdit ? "Pole updated successfully!" : "Pole data saved successfully!");
      navigate(backUrl);
      return true;
    } catch (error) {
      toast.error(isEdit ? "Failed to update pole" : "Failed to save pole data");
      console.error(error);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const showNav = useMemo(() => isEdit && jobId && poles.length > 1, [isEdit, jobId, poles.length]);

  if (fetching) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div>
      {showNav && <PoleNav jobId={jobId} poles={poles} id={id} fromMap={fromMap} />}
      <PoleForm key={id || "new"} mode={isEdit ? "edit" : "create"} jobId={jobId} initialPole={pole} backUrl={backUrl} onSubmit={handleSubmit} submitting={submitting} />
    </div>
  );
}
