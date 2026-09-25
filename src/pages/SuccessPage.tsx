import { Check, ClipboardList, Home, PackageCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getErrorMessage, inventoryApi, shipmentApi, warehouseApi } from "../lib/api";
import type { InventoryFulfillmentV1 } from "../types/warehouse";

type ReservationSummary = {
  id: string;
  orderId: string;
  status: InventoryFulfillmentV1["status"];
  shipmentId: string | null;
};

export function SuccessPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const orderCode = (location.state as { orderCode?: string } | null)?.orderCode;
  const allWaitingComplete = (location.state as { allWaitingComplete?: boolean } | null)?.allWaitingComplete;

  const [reservation, setReservation] = useState<ReservationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    warehouseApi.getOrderReservation(id)
      .then(setReservation)
      .catch((reason) => setError(getErrorMessage(reason)));
  }, [id]);

  const goToPacking = async () => {
    if (!reservation) return;

    setBusy(true);
    setError("");

    try {
      let shipmentId = reservation.shipmentId;

      if (reservation.status === "PICKED") {
        const packed = await inventoryApi.markPacked(reservation.id);
        shipmentId = packed.shipment.id;

        setReservation({
          id: packed.reservation.id,
          orderId: packed.reservation.orderId,
          status: packed.reservation.status,
          shipmentId: packed.shipment.id,
        });
      }

      if (!shipmentId) {
        const shipment = await shipmentApi.getForReservation(reservation.id);
        shipmentId = shipment.id;
      }

      navigate(`/shipments?shipmentId=${encodeURIComponent(shipmentId)}`);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const canContinue =
    reservation?.status === "PICKED" ||
    reservation?.status === "PACKED";

  return (
    <div className="grid min-h-[75dvh] place-items-center py-8 text-center">
      <div className="w-full">
        <div className="mx-auto grid size-28 place-items-center rounded-full bg-success text-white shadow-xl shadow-success/20">
          <Check size={58} strokeWidth={3}/>
        </div>

        <p className="mt-8 text-xs font-black uppercase tracking-[0.2em] text-moss">
          {orderCode || "Sipariş"}
        </p>

        <h1 className="mt-2 text-4xl font-black tracking-tight">
          Sipariş Toplandı
        </h1>

        <p className="mx-auto mt-3 max-w-xs text-muted">
          {allWaitingComplete
            ? "Tüm bekleyen siparişler tamamlandı."
            : "Sipariş toplama işlemi tamamlandı."}
        </p>

        <div className="mt-8 space-y-3">
          {canContinue && (
            <button
              className="primary-button w-full"
              disabled={busy}
              onClick={() => void goToPacking()}
            >
              <PackageCheck/>
              {busy
                ? "Hazırlanıyor..."
                : reservation?.status === "PACKED"
                  ? "Sevkiyata Geç"
                  : "Paketlemeye Geç"}
            </button>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-danger">
              {error}
            </p>
          )}

          <Link to="/orders" className="secondary-button w-full">
            <ClipboardList/> Sıradaki Sipariş
          </Link>

          <Link to="/" className="secondary-button w-full">
            <Home/> Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  );
}
