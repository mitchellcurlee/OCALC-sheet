import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import AddPole from "@/pages/AddPole";
import EditPole from "@/pages/EditPole";
import ViewPole from "@/pages/ViewPole";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

function App() {
  return (
    <div className="min-h-screen bg-industrial-bg">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/add" element={<ProtectedRoute><AddPole /></ProtectedRoute>} />
            <Route path="/edit/:id" element={<ProtectedRoute><EditPole /></ProtectedRoute>} />
            <Route path="/view/:id" element={<ProtectedRoute><ViewPole /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      <Toaster position="top-right" theme="dark" />
    </div>
  );
}

export default App;
