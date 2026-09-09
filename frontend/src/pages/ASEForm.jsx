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
import { ArrowLeft, Save, FileSpreadsheet, Loader2, ClipboardList, Users, FileOutput, Map, FileDown } from "lucide-react";

// Import ASE sub-components
import { INITIAL_FORM_DATA } from "@/components/ase";
import { ExportDestinationDialog } from "@/components/ExportDestinationDialog";
import { CLOUD_EXPORT_LABELS, uploadExportToCloud, saveBlobToDevice, formExportFilename } from "@/lib/cloudExports";
import { buildSpanMeasurementTexts } from "@/lib/poleMapImage";
import ASEChecklistTab from "@/components/ase/ASEChecklistTab";
import ASECoordinatorTab from "@/components/ase/ASECoordinatorTab";
import ASESVCLOutputTab from "@/components/ase/ASESVCLOutputTab";
import ASESOWNotesTab, { buildSowNotesText } from "@/components/ase/ASESOWNotesTab";

const ASEForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [poles, setPoles] = useState([]);
  const [underground, setUnderground] = useState([]);
  const [mapConnections, setMapConnections] = useState([]);
  const [mapRoutes, setMapRoutes] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const regeneratePathOfApproach = (format) => {
    const texts = buildSpanMeasurementTexts({
      poles,
      underground,
      connections: mapConnections,
      routes: mapRoutes,
      spanNotes: job?.span_notes || [],
      includeStations: format === "stations",
      stationsOnly: format === "stations",
    });
    setFormData(prev => ({ ...prev, path_of_approach: texts.join(", "), path_of_approach_format: format }));
    toast.success(format === "stations" ? "Path of approach set to station numbers" : "Path of approach set to footage");
  };

  // Live: extract an email from the Building Owner Contact text into the SVCL email box
  useEffect(() => {
    const m = String(formData.building_owner_contact || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (m && !formData.building_contact_email) {
      setFormData((prev) => (prev.building_contact_email ? prev : { ...prev, building_contact_email: m[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.building_owner_contact]);

  // Live: Nearest Fiber FID from the checklist fills Coordinator "Nearest Fiber FID if Missing" when empty
  useEffect(() => {
    if (formData.nearest_fiber_fid && !formData.nearest_fiber_fid_missing) {
      setFormData((prev) => (prev.nearest_fiber_fid_missing ? prev : { ...prev, nearest_fiber_fid_missing: prev.nearest_fiber_fid }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.nearest_fiber_fid]);

  const fetchJobAndASE = useCallback(async () => {
    try {
      const [jobRes, aseRes, polesRes, undergroundRes, connectionsRes, routesRes] = await Promise.all([
        axios.get(`/jobs/${jobId}`),
        axios.get(`/jobs/${jobId}/ase-data`),
        axios.get(`/jobs/${jobId}/poles`),
        axios.get(`/jobs/${jobId}/underground`),
        axios.get(`/jobs/${jobId}/connections`),
        axios.get(`/jobs/${jobId}/routes`).catch(() => ({ data: [] }))
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
      const connectionsData = connectionsRes.data || [];
      const routesLookup = {};
      (routesRes.data || []).forEach((r) => { routesLookup[`${r.from_pole_id}-${r.to_pole_id}`] = r.waypoints || []; });
      setMapConnections(connectionsData);
      setMapRoutes(routesLookup);
      
      setFormData(prev => {
        const updated = { ...prev };
        
        // Address from job
        if (!updated.address && jobData.location) {
          updated.address = jobData.location;
        }
        // Site ID + Employee Info from job
        if (!updated.site_id && jobData.site_id) {
          updated.site_id = jobData.site_id;
        }
        if (!updated.employee_info && jobData.employee_info) {
          updated.employee_info = jobData.employee_info;
        }
        // Building contact email extracted from the building owner contact text
        if (!updated.building_contact_email && updated.building_owner_contact) {
          const m = String(updated.building_owner_contact).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
          if (m) updated.building_contact_email = m[0];
        }
        // Coordinator "Nearest Fiber FID if Missing" from the checklist Nearest Fiber FID
        if (!updated.nearest_fiber_fid_missing && updated.nearest_fiber_fid) {
          updated.nearest_fiber_fid_missing = updated.nearest_fiber_fid;
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
          
          // Proposed pole and building height - from HOA data
          if (!updated.proposed_pole_bldg_height && polesData.length > 0) {
            const hoaData = [];
            polesData.forEach(pole => {
              const poleId = pole.pole_number || pole.pole_tag || `Pole ${polesData.indexOf(pole) + 1}`;
              // Get HOA heights from pole data
              if (pole.hoa_measurements) {
                hoaData.push(`${poleId}: ${pole.hoa_measurements}`);
              } else {
                // Try to build from individual HOA fields
                const heights = [];
                if (pole.hoa_power) heights.push(`Power: ${pole.hoa_power}`);
                if (pole.hoa_telco) heights.push(`Telco: ${pole.hoa_telco}`);
                if (pole.hoa_proposed) heights.push(`Proposed: ${pole.hoa_proposed}`);
                if (heights.length > 0) {
                  hoaData.push(`${poleId}: ${heights.join(', ')}`);
                }
              }
            });
            if (hoaData.length > 0) {
              updated.proposed_pole_bldg_height = hoaData.join('; ');
            } else {
              // Fallback: just list pole numbers
              const poleNumbers = polesData.map(p => p.pole_number || p.pole_tag).filter(Boolean).join(", ");
              if (poleNumbers) {
                updated.proposed_pole_bldg_height = `Poles: ${poleNumbers}`;
              }
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
          
          // Handhole or Manhole - get tie-in measurements for "Starting FH/MH/Pole tie in measurements"
          if (item.type === 'Handhole' || item.type?.toLowerCase().includes('handhole') ||
              item.type === 'Manhole' || item.type?.toLowerCase().includes('manhole')) {
            if (item.tie_in_measurements && !updated.starting_tie_in_measurements) {
              updated.starting_tie_in_measurements = item.tie_in_measurements;
            }
          }
        });
        
        // If no handhole/manhole tie-in, check first pole for starting tie-in measurements
        if (!updated.starting_tie_in_measurements && polesData.length > 0) {
          const sortedPoles = [...polesData].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const firstPole = sortedPoles[0];
          // Check if first pole has any tie-in or measurement notes
          if (firstPole.notes && firstPole.notes.toLowerCase().includes('tie')) {
            updated.starting_tie_in_measurements = firstPole.notes;
          }
        }
        
        // Also collect all tie-in measurements from underground items for starting measurements
        if (!updated.starting_tie_in_measurements) {
          const allTieIns = ugData
            .filter(item => item.tie_in_measurements)
            .map(item => `${item.label || item.type}: ${item.tie_in_measurements}`)
            .join('; ');
          if (allTieIns) {
            updated.starting_tie_in_measurements = allTieIns;
          }
        }
        
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
        
        // Path of approach — mirrors the interactive map's Span Measurements list
        // (station numbers included only when the map's Sta #'s toggle is on)
        if (!updated.path_of_approach) {
          const includeStations = localStorage.getItem(`staToggle:${jobId}`) === '1';
          const texts = buildSpanMeasurementTexts({ poles: polesData, underground: ugData, connections: connectionsData, includeStations, routes: routesLookup, spanNotes: jobRes.data?.span_notes || [] });
          if (texts.length > 0) {
            updated.path_of_approach = texts.join(', ');
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
      // Save current form data first and wait for confirmation
      const saveResponse = await axios.put(`/jobs/${jobId}/ase-data`, { ase_data: formData });
      if (saveResponse.status !== 200) {
        throw new Error("Failed to save data before export");
      }
      
      // Small delay to ensure data is persisted
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await axios.get(`/jobs/${jobId}/export/ase`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', formExportFilename(job, "ASE Checklist", "xlsx"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("ASE Excel exported");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Export failed - " + (error.message || "Please try again"));
    } finally {
      setExporting(false);
    }
  };

  const handleWordExport = async () => {
    setExportingWord(true);
    try {
      const text = formData.sow_notes_override || buildSowNotesText(formData);
      const response = await axios.post(`/jobs/${jobId}/export/sow-docx`, { text }, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', formExportFilename(job, "SOW Notes", "docx"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("SOW Notes Word file downloaded");
    } catch (error) {
      toast.error("Word download failed");
    } finally {
      setExportingWord(false);
    }
  };

  const [pendingExport, setPendingExport] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);

  const getAseExportBlob = async (type) => {
    await axios.put(`/jobs/${jobId}/ase-data`, { ase_data: formData });
    const jobName = job?.name || job?.job_number || jobId;
    if (type === "ase_excel") {
      const r = await axios.get(`/jobs/${jobId}/export/ase`, { responseType: "blob" });
      return { blob: new Blob([r.data]), filename: formExportFilename(job, "ASE Checklist", "xlsx") };
    }
    const text = formData.sow_notes_override || buildSowNotesText(formData);
    const r = await axios.post(`/jobs/${jobId}/export/sow-docx`, { text }, { responseType: "blob" });
    return { blob: new Blob([r.data]), filename: formExportFilename(job, "SOW Notes", "docx") };
  };

  const runPendingExport = async (dest) => {
    const type = pendingExport;
    setExportBusy(true);
    try {
      const res = await getAseExportBlob(type);
      if (dest === "device") {
        saveBlobToDevice(res.blob, res.filename);
        toast.success("Downloaded to device");
      } else {
        await uploadExportToCloud(jobId, type, res.filename, res.blob);
        toast.success("Saved to app cloud — see Cloud Exports on the job page");
      }
      setPendingExport(null);
    } catch (e) {
      toast.error(dest === "cloud" ? "Cloud save failed" : "Export failed");
    } finally {
      setExportBusy(false);
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
              <p className="text-xs text-zinc-500 font-mono" data-testid="ase-header-job-type">{job?.job_type || "OCALC"}{job?.site_id ? ` • ${job.site_id}` : ""}</p>
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
            <Button onClick={() => setPendingExport("sow_docx")} disabled={exportBusy || exportingWord} variant="outline" size="sm" className="text-blue-700 border-blue-300 hover:bg-blue-50" data-testid="export-sow-word-btn">
              {exportBusy || exportingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              <span className="hidden sm:inline ml-1">Word</span>
            </Button>
            <Button onClick={() => setPendingExport("ase_excel")} disabled={exporting || exportBusy} size="sm" data-testid="export-ase-btn">
              {exporting || exportBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
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
          <TabsList className="grid w-full grid-cols-4 mb-6 bg-zinc-100 p-1 rounded-lg h-auto">
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
            <TabsTrigger 
              value="sow-notes" 
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-amber-700 py-2"
              data-testid="tab-sow-notes"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="text-xs sm:text-sm">SOW Notes</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: ASE CKLIST */}
          <TabsContent value="ase-cklist">
            <ASEChecklistTab formData={formData} handleChange={handleChange} poles={poles} underground={underground} onRegeneratePath={regeneratePathOfApproach} />
          </TabsContent>

          {/* Tab 2: Coordinator Input */}
          <TabsContent value="coordinator-input">
            <ASECoordinatorTab formData={formData} handleChange={handleChange} />
          </TabsContent>

          {/* Tab 3: SVCL Output */}
          <TabsContent value="svcl-output">
            <ASESVCLOutputTab formData={formData} handleChange={handleChange} />
          </TabsContent>

          {/* Tab 4: SOW Notes (auto-generated, user-editable) */}
          <TabsContent value="sow-notes">
            <ASESOWNotesTab formData={formData} handleChange={handleChange} />
          </TabsContent>
        </Tabs>

        {/* Save/Export buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving} variant="outline" className="h-11 px-6">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
          <Button onClick={() => setPendingExport("ase_excel")} disabled={exporting || exportBusy} className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white">
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            ASE Export
          </Button>
        </div>
      </main>
      <ExportDestinationDialog
        open={!!pendingExport}
        onOpenChange={(v) => { if (!v) setPendingExport(null); }}
        label={CLOUD_EXPORT_LABELS[pendingExport] || ""}
        busy={exportBusy}
        onDevice={() => runPendingExport("device")}
        onCloud={() => runPendingExport("cloud")}
      />
    </div>
  );
};

export default ASEForm;
