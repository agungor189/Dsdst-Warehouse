import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PickingPage } from "./pages/PickingPage";
import { SuccessPage } from "./pages/SuccessPage";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/orders/:id/pick" element={<PickingPage />} />
          <Route path="/orders/:id/success" element={<SuccessPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
