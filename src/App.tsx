import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { CapacityPage, DashboardPage, LocationsDesktopPage, MovementsPage, PackagesPage, PickingManagementPage, StockPage, UserActivityPage } from "./pages/WmsDesktopPages";
import WarehouseLayoutPage from "./pages/WarehouseLayoutPage";

const WarehouseMapPage = lazy(() => import("./pages/WarehouseMapPage"));

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-dvh place-items-center bg-canvas font-black text-forest">Warehouse yükleniyor...</div>;
  if (!user) return <LoginPage />;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
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
        <Route path="/warehouse-map" element={<Suspense fallback={<div className="state-card mt-6 font-black">3D depo haritası yükleniyor…</div>}><WarehouseMapPage /></Suspense>} />
        <Route path="/warehouse-layout" element={<WarehouseLayoutPage />} />
        <Route path="/packages" element={<PackagesPage />} />
        <Route path="/locations" element={<LocationsDesktopPage />} />
        <Route path="/movements" element={<MovementsPage />} />
        <Route path="/user-activity" element={<UserActivityPage />} />
        <Route path="/capacity" element={<CapacityPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/picking-management" element={<PickingManagementPage />} />
        <Route path="/picking" element={<Navigate to="/orders" replace />} />
        <Route path="/receiving" element={<Navigate to="/admin/inbound" replace />} />
        <Route path="/move" element={<Navigate to="/admin/move" replace />} />
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
