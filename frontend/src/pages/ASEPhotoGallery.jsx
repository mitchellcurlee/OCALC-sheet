import { HomeButton } from "@/components/HomeButton";
import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Loader2, Image as ImageIcon, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

const ASEPhotoGallery = () => {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const res = await axios.get(`/jobs/${jobId}/ase-gallery?token=${token}`);
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to load gallery");
      } finally {
        setLoading(false);
      }
    };
    
    if (jobId && token) {
      fetchGallery();
    } else {
      setError("Invalid gallery link");
      setLoading(false);
    }
  }, [jobId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <div className="text-red-600 text-xl font-bold mb-2">Access Denied</div>
          <p className="text-zinc-600">{error}</p>
        </div>
      </div>
    );
  }

  const photoGroups = data?.photos || {};
  const allPhotos = Object.entries(photoGroups).flatMap(([label, urls]) => 
    urls.map(url => ({ label, url }))
  );

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <HomeButton />
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-zinc-900">ASE Site Walk Survey Photos</h1>
              <p className="text-sm text-zinc-500">{data?.job_name || "Job"} • {data?.job_location || ""}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {allPhotos.length === 0 ? (
          <div className="bg-white rounded-lg p-12 text-center">
            <ImageIcon className="w-16 h-16 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500">No photos have been uploaded yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(photoGroups).map(([label, urls]) => (
              <div key={label} className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="font-bold text-lg text-zinc-800 mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 bg-blue-600 rounded"></div>
                  {label}
                  <span className="text-sm font-normal text-zinc-500">({urls.length} photo{urls.length !== 1 ? 's' : ''})</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {urls.map((url, idx) => (
                    <div 
                      key={idx} 
                      className="aspect-square bg-zinc-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                      onClick={() => setLightboxPhoto({ label, url, index: idx + 1 })}
                    >
                      <img 
                        src={url} 
                        alt={`${label} ${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        <div className="mt-8 bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-blue-800 font-medium">
            Total: {allPhotos.length} photo{allPhotos.length !== 1 ? 's' : ''} across {Object.keys(photoGroups).length} categories
          </p>
          <p className="text-blue-600 text-sm mt-1">
            This gallery link is valid for 30 days
          </p>
        </div>
      </main>

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
        <DialogContent className="max-w-5xl p-0 bg-black/95 border-0">
          {lightboxPhoto && (
            <div className="relative">
              <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
                <div className="bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                  {lightboxPhoto.label} - Photo {lightboxPhoto.index}
                </div>
                <div className="flex gap-2">
                  <a 
                    href={lightboxPhoto.url} 
                    download 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                  >
                    <Download className="w-5 h-5" />
                  </a>
                  <button 
                    onClick={() => setLightboxPhoto(null)}
                    className="bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <img 
                src={lightboxPhoto.url} 
                alt={lightboxPhoto.label}
                className="w-full max-h-[85vh] object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ASEPhotoGallery;
