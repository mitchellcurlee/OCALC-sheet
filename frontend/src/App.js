import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import JobsList from "@/pages/JobsList";
import JobDetail from "@/pages/JobDetail";
import AddPole from "@/pages/AddPole";
import EditPole from "@/pages/EditPole";
import ViewPole from "@/pages/ViewPole";
import JobMap from "@/pages/JobMap";
import UndergroundForm from "@/pages/UndergroundForm";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import InstallPrompt from "@/components/InstallPrompt";

function App() {
  return (
    <div className="min-h-screen bg-industrial-bg">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Protected Routes */}
            <Route path="/" element={<ProtectedRoute><JobsList /></ProtectedRoute>} />
            <Route path="/jobs/:jobId" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/add" element={<ProtectedRoute><AddPole /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/edit/:id" element={<ProtectedRoute><EditPole /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/view/:id" element={<ProtectedRoute><ViewPole /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/map" element={<ProtectedRoute><JobMap /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/underground/add" element={<ProtectedRoute><UndergroundForm /></ProtectedRoute>} />
            <Route path="/jobs/:jobId/underground/edit/:id" element={<ProtectedRoute><UndergroundForm /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      <Toaster position="top-right" theme="dark" />
      <InstallPrompt />
    </div>
  );
}

export default App;
