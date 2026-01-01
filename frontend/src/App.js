import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Dashboard from "@/pages/Dashboard";
import AddPole from "@/pages/AddPole";
import EditPole from "@/pages/EditPole";
import ViewPole from "@/pages/ViewPole";

function App() {
  return (
    <div className="min-h-screen bg-industrial-bg">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/add" element={<AddPole />} />
          <Route path="/edit/:id" element={<EditPole />} />
          <Route path="/view/:id" element={<ViewPole />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" theme="dark" />
    </div>
  );
}

export default App;
