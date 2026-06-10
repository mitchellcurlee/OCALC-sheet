import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PoleForm } from "@/components/PoleForm";

const EditPole = () => {
  const navigate = useNavigate();
  const { id, jobId } = useParams();
  const [pole, setPole] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const backUrl = jobId ? `/jobs/${jobId}` : "/";

  const fetchPole = useCallback(async () => {
    try {
      // Add cache-busting timestamp to ensure fresh data
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
    fetchPole();
    // Scroll to top when editing a pole
    window.scrollTo(0, 0);
  }, [fetchPole]);

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

  return (
    <PoleForm
      mode="edit"
      jobId={jobId}
      initialPole={pole}
      backUrl={backUrl}
      onSubmit={handleSubmit}
      submitting={submitting}
    />
  );
};

export default EditPole;
