import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PickingPage } from "./pages/PickingPage";
import { SuccessPage } from "./pages/SuccessPage";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { PickHistoryPage } from "./pages/PickHistoryPage";
import {
  InboundPage, LabelingPage, LocationsPage, MoveStockPage, PlacementPage, PrintJobsPage,
  StockCountPage, WarehouseAdminPage, LabelTemplatesPage,
} from "./pages/WarehouseAdminPages";

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
        <Route path="/history" element={<PickHistoryPage />} />
        <Route path="/admin" element={<WarehouseAdminPage />} />
        <Route path="/admin/inbound" element={<InboundPage />} />
        <Route path="/admin/labeling" element={<LabelingPage />} />
        <Route path="/admin/placement" element={<PlacementPage />} />
        <Route path="/admin/move" element={<MoveStockPage />} />
        <Route path="/admin/locations" element={<LocationsPage />} />
        <Route path="/admin/count" element={<StockCountPage />} />
        <Route path="/admin/prints" element={<PrintJobsPage />} />
        <Route path="/admin/templates" element={<LabelTemplatesPage />} />
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
