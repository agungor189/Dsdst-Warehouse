import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PickingPage } from "./pages/PickingPage";
import { SuccessPage } from "./pages/SuccessPage";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-dvh place-items-center bg-canvas font-black text-forest">Warehouse yükleniyor...</div>;
  if (!user) return <LoginPage />;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/orders/:id/pick" element={<PickingPage />} />
        <Route path="/orders/:id/success" element={<SuccessPage />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider><AuthenticatedApp /></AuthProvider>
    </BrowserRouter>
  );
}
