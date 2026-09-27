import type { PrintJob } from "../../lib/api";
import type { ShipmentV1 } from "../../types/warehouse";

type ShipmentPackage = ShipmentV1["packages"][number];

export const packageCarrierName = (shipmentPackage: ShipmentPackage) =>
  shipmentPackage.booking?.carrierCode || "Geliver";

export const shippingPrintJobFor = (jobs: PrintJob[], shipmentPackage: ShipmentPackage) =>
  jobs.find((job) => job.subject_id === shipmentPackage.id || job.subject_code === shipmentPackage.booking?.providerShipmentId);
