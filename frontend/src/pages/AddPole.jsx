import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { PoleForm } from "@/components/PoleForm";

const AddPole = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [submitting, setSubmitting] = useState(false);
  const backUrl = jobId ? `/jobs/${jobId}` : "/";

  // Scroll to top when starting a new pole entry
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      await axios.post("/poles", payload);
      toast.success("Pole data saved successfully!");
      navigate(backUrl);
      return true;
    } catch (error) {
      toast.error("Failed to save pole data");
      console.error(error);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PoleForm
      mode="create"
      jobId={jobId}
      backUrl={backUrl}
      onSubmit={handleSubmit}
      submitting={submitting}
    />
  );
};

export default AddPole;
