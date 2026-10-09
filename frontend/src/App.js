import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { OfflineProvider } from "@/lib/OfflineContext";
import { OfflineBanner } from "@/components/OfflineIndicator";
import "@/lib/offlineWrites";
import "@/lib/offlinePhotos";
import ProtectedRoute from "@/components/ProtectedRoute";
import JobsList from "@/pages/JobsList";
import JobDetail from "@/pages/JobDetail";
import PoleEditor from "@/pages/PoleEditor";
import ViewPole from "@/pages/ViewPole";
import JobMap from "@/pages/JobMap";
import UndergroundForm from "@/pages/UndergroundForm";
import ASEForm from "@/pages/ASEForm";
import DataRecovery from "@/pages/DataRecovery";
import Trash from "@/pages/Trash";
import ASEPhotoGallery from "@/pages/ASEPhotoGallery";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminUsers from "@/pages/AdminUsers";
import AdminCostRates from "@/pages/AdminCostRates";
import TeamReports from "@/pages/TeamReports";
import JobTiles from "@/pages/JobTiles";
import Home from "@/pages/Home";
import ASEForm2 from "@/pages/ASEForm2";
import SPFForm from "@/pages/SPFForm";
import DailyFieldReport from "@/pages/DailyFieldReport";
import BackupAtlas from "@/pages/BackupAtlas";
import InstallPrompt from "@/components/InstallPrompt";

function App() {
  return (
    <div className="min-h-screen bg-industrial-bg">
      <OfflineProvider>
      <AuthProvider>
        <OfflineBanner />
        <BrowserRouter>
          <Routes>
            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Public Routes - no auth required */}
            <Route path="/ase-gallery/:jobId" element={<ASEPhotoGallery />} />
            
            {/* Protected Routes */}
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/jobs" element={<ProtectedRoute><JobsList /></ProtectedRoute>} />
            <Route path="/jobs/:jobId" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/add" element={<ProtectedRoute><PoleEditor /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/edit/:id" element={<ProtectedRoute><PoleEditor /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/view/:id" element={<ProtectedRoute><ViewPole /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/map" element={<ProtectedRoute><JobMap /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/underground/add" element={<ProtectedRoute><UndergroundForm /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/underground/edit/:id" element={<ProtectedRoute><UndergroundForm /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/ase" element={<ProtectedRoute><ASEForm /></ProtectedRoute>} />
            <Route path="/recovery" element={<ProtectedRoute><DataRecovery /></ProtectedRoute>} />
            <Route path="/trash" element={<ProtectedRoute><Trash /></ProtectedRoute>} />
            <Route path="/tiles" element={<ProtectedRoute><JobTiles /></ProtectedRoute>} />
            <Route path="/backup" element={<ProtectedRoute><BackupAtlas /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/cost-rates" element={<ProtectedRoute><AdminCostRates /></ProtectedRoute>} />
            <Route path="/admin/team-reports" element={<ProtectedRoute><TeamReports /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/ase2" element={<ProtectedRoute><ASEForm2 /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/spf" element={<ProtectedRoute><SPFForm /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/field-report" element={<ProtectedRoute><DailyFieldReport /></ProtectedRoute>} />
            <Route path="/field-report" element={<ProtectedRoute><DailyFieldReport /></ProtectedRoute>} />
            {/* Unknown paths land on the true Home page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </OfflineProvider>
      <Toaster position="top-right" theme="dark" />
      <InstallPrompt />
    </div>
  );
}

export default App;
