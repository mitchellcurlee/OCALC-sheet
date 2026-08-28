import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, CloudUpload, Loader2 } from "lucide-react";

export const ExportDestinationDialog = ({ open, onOpenChange, label, busy, onDevice, onCloud }) => (
  <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
    <DialogContent className="bg-white sm:max-w-sm" data-testid="export-destination-dialog">
      <DialogHeader>
        <DialogTitle className="font-heading">EXPORT {label ? `— ${label}` : ""}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-zinc-600">Where do you want to send this export?</p>
      <div className="space-y-2">
        <Button
          onClick={onDevice}
          disabled={busy}
          className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white justify-start"
          data-testid="export-device-btn"
        >
          {busy ? <Loader2 className="w-5 h-5 mr-3 animate-spin" /> : <Download className="w-5 h-5 mr-3" />}
          Download to Device
        </Button>
        <Button
          onClick={onCloud}
          disabled={busy}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white justify-start"
          data-testid="export-cloud-btn"
        >
          {busy ? <Loader2 className="w-5 h-5 mr-3 animate-spin" /> : <CloudUpload className="w-5 h-5 mr-3" />}
          Save to App Cloud
        </Button>
      </div>
      <p className="text-xs text-zinc-400">Cloud saves are kept in the app (latest version per export type) — view or re-download them anytime from the Cloud Exports section on the job page.</p>
    </DialogContent>
  </Dialog>
);

export default ExportDestinationDialog;
