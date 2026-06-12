import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowLeft, Save, FileSpreadsheet, Loader2, ClipboardList, Users, FileOutput, Map } from "lucide-react";

// Import ASE sub-components
import { INITIAL_FORM_DATA } from "@/components/ase";
import ASEChecklistTab from "@/components/ase/ASEChecklistTab";
import ASECoordinatorTab from "@/components/ase/ASECoordinatorTab";
import ASESVCLOutputTab from "@/components/ase/ASESVCLOutputTab";

const ASEForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [underground, setUnderground] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fetchJobAndASE = useCallback(async () => {
    try {
      const [jobRes, aseRes, polesRes, undergroundRes] = await Promise.all([
        axios.get(`/jobs/${jobId}`),
        axios.get(`/jobs/${jobId}/ase-data`),
        axios.get(`/jobs/${jobId}/poles`),
        axios.get(`/jobs/${jobId}/underground`)
      ]);
      setJob(jobRes.data);
      setPoles(polesRes.data || []);
      setUnderground(undergroundRes.data || []);
      
      if (aseRes.data.ase_data) {
        setFormData(prev => ({ ...prev, ...aseRes.data.ase_data }));
      }
      
      // Auto-populate from job data
      const jobData = jobRes.data;
      const polesData = polesRes.data || [];
      const ugData = undergroundRes.data || [];
      
      setFormData(prev => {
        const updated = { ...prev };
        
        // Address from job
        if (!updated.address && jobData.location) {
          updated.address = jobData.location;
        }
        
        // Pole coordinates
        if (polesData.length > 0) {
          const firstPole = polesData[0];
          const lastPole = polesData[polesData.length - 1];
          
          if (!updated.soc_pole_line_start && firstPole.latitude && firstPole.longitude) {
            updated.soc_pole_line_start = `${firstPole.latitude}, ${firstPole.longitude}`;
          }
          if (!updated.soc_pole_line_end && lastPole.latitude && lastPole.longitude) {
            updated.soc_pole_line_end = `${lastPole.latitude}, ${lastPole.longitude}`;
          }
          
          // Starting measurements from first pole
          if (!updated.starting_tie_in_measurements && firstPole) {
            const measurements = [];
            if (firstPole.span1_direction && firstPole.span1_distance) {
              measurements.push(`Span 1: ${firstPole.span1_direction} - ${firstPole.span1_distance} ft`);
            }
            if (firstPole.span2_direction && firstPole.span2_distance) {
              measurements.push(`Span 2: ${firstPole.span2_direction} - ${firstPole.span2_distance} ft`);
            }
            if (measurements.length > 0) {
              updated.starting_tie_in_measurements = measurements.join("; ");
            }
          }
          
          // Proposed pole and building
          if (!updated.proposed_pole_bldg_height && polesData.length > 0) {
            const poleNumbers = polesData.map(p => p.pole_number).filter(Boolean).join(", ");
            if (poleNumbers) {
              updated.proposed_pole_bldg_height = `Poles: ${poleNumbers}`;
            }
          }
        }
        
        // Underground items - with photo attachment
        ugData.forEach(item => {
          // Get photos from item (handle both single photo and photos array)
          const itemPhotos = item.photos || (item.photo ? [item.photo] : []);
          
          if (item.type === 'FBT' || item.type === 'FBT/NTE') {
            if (!updated.fiber_terminal_lat_long && item.latitude && item.longitude) {
              updated.fiber_terminal_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            if (!updated.existing_fiber_terminal) updated.existing_fiber_terminal = "YES";
            // Attach FBT photos
            if (itemPhotos.length > 0 && (!updated.fbt_photos || updated.fbt_photos.length === 0)) {
              updated.fbt_photos = itemPhotos;
            }
          }
          if (item.type === 'NTE' || item.type === 'FBT/NTE') {
            if (!updated.nte_lat_long && item.latitude && item.longitude) {
              updated.nte_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            if (!updated.existing_nte) updated.existing_nte = "YES";
            // Attach NTE photos
            if (itemPhotos.length > 0 && (!updated.nte_photos || updated.nte_photos.length === 0)) {
              updated.nte_photos = itemPhotos;
            }
          }
          if (item.type === 'SOC Start') {
            if (!updated.soc_start_lat_long && item.latitude && item.longitude) {
              updated.soc_start_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            // Attach SOC Start photos
            if (itemPhotos.length > 0 && (!updated.soc_start_photos || updated.soc_start_photos.length === 0)) {
              updated.soc_start_photos = itemPhotos;
            }
          }
          if (item.type === 'SOC End') {
            if (!updated.soc_end_lat_long && item.latitude && item.longitude) {
              updated.soc_end_lat_long = `${item.latitude}, ${item.longitude}`;
            }
            // Attach SOC End photos
            if (itemPhotos.length > 0 && (!updated.soc_end_photos || updated.soc_end_photos.length === 0)) {
              updated.soc_end_photos = itemPhotos;
            }
          }
          if (item.type === 'MPOE') {
            if (!updated.mpoe_address && item.notes) {
              updated.mpoe_address = item.notes;
            }
            // Attach MPOE photos
            if (itemPhotos.length > 0 && (!updated.mpoe_photos || updated.mpoe_photos.length === 0)) {
              updated.mpoe_photos = itemPhotos;
            }
          }
          if (item.type === 'Hoffman Box' && !updated.need_hoffman_box) {
            updated.need_hoffman_box = "YES";
          }
          
          // Handhole - get tie-in measurements for "Starting FH/MH/Pole tie in measurements"
          if (item.type === 'Handhole' || item.type?.toLowerCase().includes('handhole')) {
            if (item.tie_in_measurements && !updated.starting_tie_in_measurements) {
              updated.starting_tie_in_measurements = item.tie_in_measurements;
            }
          }
        });
        
        // Attach pole photos to pole line start/end
        if (polesData.length > 0) {
          const firstPole = polesData[0];
          const lastPole = polesData[polesData.length - 1];
          
          // First pole photos for pole line start
          const firstPolePhotos = firstPole.photos || (firstPole.photo ? [firstPole.photo] : []);
          if (firstPolePhotos.length > 0 && (!updated.pole_line_start_photos || updated.pole_line_start_photos.length === 0)) {
            updated.pole_line_start_photos = firstPolePhotos;
          }
          
          // Last pole photos for pole line end
          const lastPolePhotos = lastPole.photos || (lastPole.photo ? [lastPole.photo] : []);
          if (lastPolePhotos.length > 0 && (!updated.pole_line_end_photos || updated.pole_line_end_photos.length === 0)) {
            updated.pole_line_end_photos = lastPolePhotos;
          }
        }
        
        // Path of approach
        if (!updated.path_of_approach && ugData.length > 0) {
          const pathItems = ugData.map(item => item.label ? `${item.type} (${item.label})` : item.type).join(" → ");
          if (pathItems) {
            updated.path_of_approach = `Underground path: ${pathItems}`;
          }
        }
        
        // Auto-calculate SVCL Output fields
        // Multi-tenant based on business units
        if (updated.number_of_business_units) {
          const units = parseInt(updated.number_of_business_units) || 0;
          updated.multi_tenant = units > 1 ? "YES" : "NO";
          updated.number_of_tenants = updated.number_of_business_units;
        }
        
        // Building demarcation
        if (updated.how_many_dmarcs) {
          const dmarcs = parseInt(updated.how_many_dmarcs) || 0;
          updated.building_demarcation = dmarcs === 1 ? "Single MPOE/Terminal" : "Multiple MPOE/Terminal";
        }
        
        // Building contact from access contact
        if (!updated.building_contact && updated.building_owner_contact) {
          updated.building_contact = updated.building_owner_contact;
        }
        
        // ========== COLLECT ALL JOB PHOTOS FOR MARK UPS GALLERY ==========
        // Only auto-populate if markup_photos is empty (don't overwrite user edits)
        if (!updated.markup_photos || updated.markup_photos.length === 0) {
          const allJobPhotos = [];
          
          // Collect photos from all poles
          polesData.forEach(pole => {
            // Main pole photo
            if (pole.photo) allJobPhotos.push(pole.photo);
            if (pole.photos && Array.isArray(pole.photos)) {
              allJobPhotos.push(...pole.photos);
            }
            // Birthmark photos
            if (pole.birthmark_photos && Array.isArray(pole.birthmark_photos)) {
              allJobPhotos.push(...pole.birthmark_photos);
            }
            // MGNV photos
            if (pole.mgnv_photos && Array.isArray(pole.mgnv_photos)) {
              allJobPhotos.push(...pole.mgnv_photos);
            }
            // Anchor photos
            if (pole.anchor_photos && Array.isArray(pole.anchor_photos)) {
              allJobPhotos.push(...pole.anchor_photos);
            }
            // HOA photos
            if (pole.hoa_photos && Array.isArray(pole.hoa_photos)) {
              allJobPhotos.push(...pole.hoa_photos);
            }
          });
          
          // Collect photos from all underground items
          ugData.forEach(item => {
            if (item.photo) allJobPhotos.push(item.photo);
            if (item.photos && Array.isArray(item.photos)) {
              allJobPhotos.push(...item.photos);
            }
          });
          
          // Remove duplicates and empty values
          const uniquePhotos = [...new Set(allJobPhotos.filter(p => p && typeof p === 'string'))];
          
          if (uniquePhotos.length > 0) {
            updated.markup_photos = uniquePhotos;
          }
        }
        
        return updated;
      });
      
    } catch (error) {
      toast.error("Failed to load job");
      navigate("/jobs");
    } finally {
      setLoading(false);
    }
  }, [jobId, navigate]);

  useEffect(() => {
    fetchJobAndASE();
  }, [fetchJobAndASE]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`/jobs/${jobId}/ase-data`, { ase_data: formData });
      toast.success("ASE data saved");
    } catch (error) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await axios.put(`/jobs/${jobId}/ase-data`, { ase_data: formData });
      const response = await axios.get(`/jobs/${jobId}/export/ase`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ASE_${job?.job_number || jobId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("ASE Excel exported");
    } catch (error) {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/jobs/${jobId}`} className="p-2 hover:bg-zinc-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-heading text-lg sm:text-xl font-bold">ASE SITE WALK SURVEY</h1>
              <p className="text-xs text-zinc-500 font-mono">{job?.job_number} • {job?.job_type}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/jobs/${jobId}/map`}>
              <Button variant="outline" size="sm" className="bg-green-50 border-green-300 hover:bg-green-100 text-green-700" data-testid="ase-map-btn">
                <Map className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">Map</span>
              </Button>
            </Link>
            <Button onClick={handleSave} disabled={saving} variant="outline" size="sm" data-testid="save-ase-btn">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="hidden sm:inline ml-1">Save</span>
            </Button>
            <Button onClick={handleExport} disabled={exporting} size="sm" data-testid="export-ase-btn">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              <span className="hidden sm:inline ml-1">Export</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-6" data-testid="ase-form">
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono bg-white p-3 rounded-lg border border-zinc-200">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            Filled
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-amber-400"></span>
            Not Filled
          </span>
        </div>
        
        {/* 3-Tab Structure - EXACT match to Excel */}
        <Tabs defaultValue="ase-cklist" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-zinc-100 p-1 rounded-lg h-auto">
            <TabsTrigger 
              value="ase-cklist" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-700 py-2"
              data-testid="tab-ase-cklist"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="text-xs sm:text-sm">ASE CKLIST</span>
            </TabsTrigger>
            <TabsTrigger 
              value="coordinator-input" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-green-700 py-2"
              data-testid="tab-coordinator-input"
            >
              <Users className="w-4 h-4" />
              <span className="text-xs sm:text-sm">Coordinator Input</span>
            </TabsTrigger>
            <TabsTrigger 
              value="svcl-output" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-purple-700 py-2"
              data-testid="tab-svcl-output"
            >
              <FileOutput className="w-4 h-4" />
              <span className="text-xs sm:text-sm">SVCL Output</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: ASE CKLIST */}
          <TabsContent value="ase-cklist">
            <ASEChecklistTab formData={formData} handleChange={handleChange} />
          </TabsContent>

          {/* Tab 2: Coordinator Input */}
          <TabsContent value="coordinator-input">
            <ASECoordinatorTab formData={formData} handleChange={handleChange} />
          </TabsContent>

          {/* Tab 3: SVCL Output */}
          <TabsContent value="svcl-output">
            <ASESVCLOutputTab formData={formData} handleChange={handleChange} />
          </TabsContent>
        </Tabs>

        {/* Save/Export buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving} variant="outline" className="h-11 px-6">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
          <Button onClick={handleExport} disabled={exporting} className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white">
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            ASE Export
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ASEForm;
