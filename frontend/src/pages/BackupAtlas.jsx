import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/useGoBack";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ArrowLeft, DatabaseBackup, Loader2, CheckCircle2, ShieldAlert, Clock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { HomeButton } from "@/components/HomeButton";

export default function BackupAtlas() {
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState(null);
  const [uri, setUri] = useState("");
  const [savingCfg, setSavingCfg] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get("/admin/backup");
      setStatus(res.data);
    } catch (e) {
      if (e.response?.status === 403) toast.error("Admin access required");
      setStatus({ configured: false, forbidden: e.response?.status === 403 });
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const saveConfig = async () => {
    if (!uri.trim()) { toast.error("Paste your Atlas connection string first"); return; }
    setSavingCfg(true);
    try {
      await axios.put("/admin/backup/config", { atlas_uri: uri.trim() }, { timeout: 30000 });
      toast.success("Atlas connection verified and saved");
      setUri("");
      await fetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save Atlas connection");
    } finally {
      setSavingCfg(false);
    }
  };

  const runBackup = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await axios.post("/admin/backup/run", {}, { timeout: 600000 });
      setResult(res.data);
      toast.success(`Backup complete — ${res.data.total_documents} documents copied`);
      await fetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Backup failed");
    } finally {
      setRunning(false);
    }
  };

  const saveSchedule = async (enabled, hourUtc) => {
    try {
      await axios.put("/admin/backup/schedule", { enabled, hour_utc: hourUtc });
      toast.success(enabled ? "Nightly backup enabled" : "Nightly backup disabled");
      await fetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update schedule");
    }
  };

  const hourLabel = (h) => {
    const d = new Date();
    d.setUTCHours(h, 0, 0, 0);
    return `${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} local (${String(h).padStart(2, "0")}:00 UTC)`;
  };

  if (!isAdmin || status?.forbidden) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-400 font-mono">
        <ShieldAlert className="w-10 h-10 text-amber-500" />
        <p data-testid="backup-forbidden-msg">Admin access required</p>
        <Button variant="outline" onClick={() => navigate("/")} data-testid="backup-back-home-btn">Back to Jobs</Button>
      </div>
    );
  }

  const summary = result || status?.last_backup_summary;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={goBack} className="text-zinc-400 hover:text-white" data-testid="backup-back-btn">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <HomeButton className="text-zinc-400 hover:text-white" />
          <div className="w-9 h-9 bg-emerald-600 flex items-center justify-center">
            <DatabaseBackup className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-black tracking-tight uppercase">Backup to Atlas</h1>
            <p className="text-xs text-zinc-500 font-mono">COPY ALL APP DATA TO YOUR MONGODB ATLAS CLUSTER</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Config */}
        <div className="border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-sm font-bold font-mono uppercase text-zinc-300">1. Atlas Connection</h2>
          {status?.configured ? (
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400" data-testid="backup-configured-status">
              <CheckCircle2 className="w-4 h-4" />
              <span className="break-all">{status.uri_masked}</span>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 font-mono" data-testid="backup-not-configured-status">Not configured yet</p>
          )}
          <Input
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/?appName=Cluster0"
            className="bg-zinc-950 border-zinc-700 text-zinc-100 font-mono text-xs"
            data-testid="backup-uri-input"
          />
          <p className="text-[11px] text-zinc-500">
            Paste the full connection string with your real password (replace &lt;db_password&gt;). If the password has special characters (@ : / #), URL-encode them. In Atlas, Network Access must allow 0.0.0.0/0.
          </p>
          <Button onClick={saveConfig} disabled={savingCfg} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-300" data-testid="backup-save-config-btn">
            {savingCfg ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying connection…</>) : (status?.configured ? "Update Connection" : "Verify & Save Connection")}
          </Button>
        </div>

        {/* Run */}
        <div className="border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-sm font-bold font-mono uppercase text-zinc-300">2. Run Backup</h2>
          <p className="text-xs text-zinc-500">
            Copies every collection (jobs, poles, attributes, ASE forms, users, routes, connections, trash…) into database <span className="text-zinc-300 font-mono">{summary?.target_db || "app DB"}</span> on your Atlas cluster. Each run is a full snapshot that replaces the previous backup. Photos stored in cloud file storage are referenced by URL and are not copied into Atlas.
          </p>
          <Button onClick={runBackup} disabled={running || !status?.configured} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="backup-run-btn">
            {running ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Backing up… this can take a minute</>) : "Backup Now"}
          </Button>
          {status?.last_backup_at && (
            <p className="text-xs font-mono text-zinc-400" data-testid="backup-last-run">
              Last backup: {new Date(status.last_backup_at).toLocaleString()}
            </p>
          )}
        </div>

        {/* Nightly schedule */}
        <div className="border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-sm font-bold font-mono uppercase text-zinc-300 flex items-center gap-2"><Clock className="w-4 h-4" />3. Nightly Auto-Backup</h2>
          <div className="flex items-center gap-3">
            <Switch
              checked={!!status?.auto_enabled}
              onCheckedChange={(v) => saveSchedule(v, status?.auto_hour_utc ?? 7)}
              disabled={!status?.configured}
              data-testid="backup-auto-toggle"
            />
            <span className="text-xs font-mono text-zinc-400">{status?.auto_enabled ? "ENABLED — runs every night" : "Disabled"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Run at:</span>
            <Select
              value={String(status?.auto_hour_utc ?? 7)}
              onValueChange={(v) => saveSchedule(!!status?.auto_enabled, parseInt(v, 10))}
              disabled={!status?.configured}
            >
              <SelectTrigger className="w-64 h-8 bg-zinc-950 border-zinc-700 text-zinc-100 text-xs font-mono" data-testid="backup-auto-hour-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-h-64">
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)} className="text-xs font-mono">{hourLabel(h)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {status?.last_auto_status && (
            <p className={`text-xs font-mono ${status.last_auto_status.startsWith("failed") ? "text-red-400" : "text-emerald-400"}`} data-testid="backup-auto-status">
              Last nightly run: {status.last_auto_status}
            </p>
          )}
        </div>

        {/* Results */}
        {summary?.collections && (
          <div className="border border-zinc-800 bg-zinc-900 p-4 space-y-3" data-testid="backup-summary">
            <h2 className="text-sm font-bold font-mono uppercase text-zinc-300">
              Last Backup Result — {summary.total_documents} documents in {summary.duration_seconds}s
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {summary.collections.map((c) => (
                <div key={c.collection} className="border border-zinc-800 bg-zinc-950 px-3 py-2" data-testid={`backup-coll-${c.collection}`}>
                  <div className="text-[11px] font-mono text-zinc-500 uppercase truncate">{c.collection}</div>
                  <div className="text-sm font-bold text-zinc-100">{c.documents}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
