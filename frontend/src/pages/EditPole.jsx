import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PoleForm } from "@/components/PoleForm";

const EditPole = () => {
  const navigate = useNavigate();
  const { id, jobId } = useParams();
  const [pole, setPole] = useState(null);
  const [poles, setPoles] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const fromMap = searchParams.get("from") === "map";
  // Coming from the map: go back to the map centered on the edited item
  const backUrl = fromMap && jobId ? `/jobs/${jobId}/map?focus=${id}` : jobId ? `/jobs/${jobId}` : "/";

  // Fetch all poles in the job for navigation
  const fetchPoles = useCallback(async () => {
    if (!jobId) return;
    try {
      const response = await axios.get(`/jobs/${jobId}/poles?_t=${Date.now()}`);
      setPoles(response.data);
    } catch (error) {
      console.error("Failed to fetch poles for navigation");
    }
  }, [jobId]);

  const fetchPole = useCallback(async () => {
    try {
      const response = await axios.get(`/poles/${id}?_t=${Date.now()}`);
      console.log('[EditPole] Fetched pole data:', {
        pole_owner: response.data.pole_owner,
        pole_class: response.data.pole_class,
        pole_type: response.data.pole_type,
        condition: response.data.condition,
        access: response.data.access,
        pole_size: response.data.pole_size,
      });
      setPole(response.data);
    } catch (error) {
      toast.error("Failed to fetch pole data");
      navigate(backUrl);
    } finally {
      setFetching(false);
    }
  }, [id, navigate, backUrl]);

  useEffect(() => {
    // Reset state when navigating to a different pole
    setFetching(true);
    setPole(null);
    fetchPole();
    fetchPoles();
    window.scrollTo(0, 0);
  }, [id, jobId]);

  // Calculate previous and next poles
  const { prevPole, nextPole, currentIndex, totalPoles } = useMemo(() => {
    if (!poles.length || !id) {
      return { prevPole: null, nextPole: null, currentIndex: -1, totalPoles: 0 };
    }
    const idx = poles.findIndex(p => p.id === id);
    return {
      prevPole: idx > 0 ? poles[idx - 1] : null,
      nextPole: idx < poles.length - 1 ? poles[idx + 1] : null,
      currentIndex: idx,
      totalPoles: poles.length
    };
  }, [poles, id]);

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      await axios.put(`/poles/${id}`, payload);
      toast.success("Pole updated successfully!");
      navigate(backUrl);
      return true;
    } catch (error) {
      toast.error("Failed to update pole");
      console.error(error);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  if (fetching) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  // Should show navigation
  const showNavigation = jobId && poles.length > 1;

  return (
    <div>
      {/* Pole Navigation */}
      {showNavigation && (
        <div className="flex items-center justify-between bg-white border-b border-zinc-200 px-4 py-2" data-testid="pole-navigation">
          <Link 
            to={prevPole ? `/jobs/${jobId}/edit/${prevPole.id}${fromMap ? "?from=map" : ""}` : '#'}
            className={!prevPole ? 'pointer-events-none opacity-40' : ''}
          >
            <Button 
              variant="outline" 
              size="sm" 
              disabled={!prevPole}
              className="flex items-center gap-1 text-zinc-700"
              data-testid="prev-pole-btn"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
              {prevPole && <span className="font-mono text-xs ml-1">({prevPole.pole_number || 'No #'})</span>}
            </Button>
          </Link>
          
          <span className="text-sm text-zinc-500 font-mono" data-testid="pole-counter">
            Pole {currentIndex + 1} of {totalPoles}
          </span>
          
          <Link 
            to={nextPole ? `/jobs/${jobId}/edit/${nextPole.id}${fromMap ? "?from=map" : ""}` : '#'}
            className={!nextPole ? 'pointer-events-none opacity-40' : ''}
          >
            <Button 
              variant="outline" 
              size="sm" 
              disabled={!nextPole}
              className="flex items-center gap-1 text-zinc-700"
              data-testid="next-pole-btn"
            >
              {nextPole && <span className="font-mono text-xs mr-1">({nextPole.pole_number || 'No #'})</span>}
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}
      <PoleForm
        key={id}
        mode="edit"
        jobId={jobId}
        initialPole={pole}
        backUrl={backUrl}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  );
};

export default EditPole;
