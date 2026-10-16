import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getReceiptLabelOverview: vi.fn(), queueReceiptSkuPrint: vi.fn(), confirmPrinted: vi.fn(), reprint: vi.fn(), acknowledgeReplacement: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Hata",
  warehouseAdminApi: api,
}));

import { DesktopReceiptLabelsGate } from "./DesktopReceiptLabels";

const matchMedia = (matches: boolean) => vi.fn().mockReturnValue({
  matches, media: "(min-width: 1024px)", addEventListener: vi.fn(), removeEventListener: vi.fn(),
});

describe("masaüstü mal kabul etiket paneli", () => {
  beforeEach(() => {
    api.queueReceiptSkuPrint.mockReset().mockResolvedValue({ jobs: [{ id: "queued" }], blockedPackageNumbers: [], remainingUnprintedCount: 1 });
    api.confirmPrinted.mockReset().mockResolvedValue({});
    api.reprint.mockReset().mockResolvedValue({});
    api.acknowledgeReplacement.mockReset().mockResolvedValue({});
    api.getReceiptLabelOverview.mockReset().mockResolvedValue({
      purchaseOrderId: "po-1", purchaseNumber: "PO-1", supplierName: "Supplier", observedAt: "2026-10-16T10:00:00Z", live: true,
      skus: [{ productId: "product-1", sku: "SKU-1", productTitle: "Product", material: "Çelik", profileType: "Kare", size: "40 mm", totalPackageCount: 4, printedCount: 1, nextPackageNumber: 2, packages: [] }],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("mobil görünümde paneli kurmaz ve backend isteği yapmaz", async () => {
    vi.stubGlobal("matchMedia", matchMedia(false));
    render(<DesktopReceiptLabelsGate purchaseOrderId="po-1" supplierLotCode=""/>);
    expect(screen.queryByLabelText("Mal kabul etiket yönetimi")).not.toBeInTheDocument();
    await waitFor(() => expect(api.getReceiptLabelOverview).not.toHaveBeenCalled());
  });

  it("masaüstünde tarama ve lot girişi olmadan SKU listesini gösterir", async () => {
    vi.stubGlobal("matchMedia", matchMedia(true));
    const Harness = () => {
      const [lot, setLot] = useState("");
      return <DesktopReceiptLabelsGate purchaseOrderId="po-1" supplierLotCode={lot} onSupplierLotCodeChange={setLot}/>;
    };
    const user = userEvent.setup();
    render(<Harness/>);
    expect(await screen.findByText("SKU-1")).toBeInTheDocument();
    expect(screen.getByText("1/4")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tek Baskı/ })).toBeDisabled();
    await user.type(screen.getByLabelText("Masaüstü tedarikçi lotu"), "LOT-1");
    expect(screen.getByLabelText("Masaüstü tedarikçi lotu")).toHaveValue("LOT-1");
    expect(screen.getByRole("button", { name: /Tek Baskı/ })).toBeEnabled();
    expect(api.getReceiptLabelOverview).toHaveBeenCalledWith("po-1");
  });

  it("yalnız seçilen paketleri fiziksel onaylar ve yeniden baskıyı ayrı gönderir", async () => {
    api.getReceiptLabelOverview.mockResolvedValue({
      purchaseOrderId: "po-1", purchaseNumber: "PO-1", supplierName: "Supplier", observedAt: "2026-10-16T10:00:00Z", live: true,
      skus: [{ productId: "product-1", sku: "SKU-1", productTitle: "Product", material: "Çelik", profileType: "Kare", size: "40 mm", totalPackageCount: 4, printedCount: 1, nextPackageNumber: 2, packages: [
        { id: "pkg-1", code: "PKG-1", packageNumber: 1, totalPackages: 4, quantityBaseInt: 1, planVersion: "v1", normalPrinted: true, currentJobId: "job-1", currentJobStatus: "PRINTED_CONFIRMED", revisionAmbiguous: false, replacementRequired: false, replacementBlocked: false, confirmationAvailable: false, canReprint: true },
        { id: "pkg-2", code: "PKG-2", packageNumber: 2, totalPackages: 4, quantityBaseInt: 1, planVersion: "v1", normalPrinted: false, currentJobId: "job-2", currentJobStatus: "ACKNOWLEDGED", revisionAmbiguous: false, replacementRequired: false, replacementBlocked: false, confirmationAvailable: true, canReprint: false },
        { id: "pkg-3", code: "PKG-3", packageNumber: 3, totalPackages: 4, quantityBaseInt: 1, planVersion: "v1", normalPrinted: false, currentJobId: "job-3", currentJobStatus: "ACKNOWLEDGED", revisionAmbiguous: false, replacementRequired: false, replacementBlocked: false, confirmationAvailable: true, canReprint: false },
        { id: "pkg-4", code: "PKG-4", packageNumber: 4, totalPackages: 4, quantityBaseInt: 1, planVersion: "v1", normalPrinted: false, currentJobId: "job-4", currentJobStatus: "DELIVERY_UNKNOWN", revisionAmbiguous: false, replacementRequired: false, replacementBlocked: false, confirmationAvailable: true, canReprint: false },
      ] }],
    });
    vi.stubGlobal("matchMedia", matchMedia(true));
    const user = userEvent.setup();
    render(<DesktopReceiptLabelsGate purchaseOrderId="po-1" supplierLotCode="LOT-1"/>);
    await user.click(await screen.findByRole("button", { name: /Toplu Baskı/ }));
    expect(api.queueReceiptSkuPrint).toHaveBeenCalledWith("po-1", "product-1", "ALL", "LOT-1");
    await user.click(screen.getByRole("checkbox", { name: "2/4 etiketini doğrula" }));
    await user.click(screen.getByRole("checkbox", { name: "3/4 etiketini doğrula" }));
    await user.click(screen.getByRole("button", { name: "Seçilenleri doğrula (2)" }));
    expect(api.confirmPrinted.mock.calls).toEqual([["job-2"], ["job-3"]]);
    expect(api.confirmPrinted).not.toHaveBeenCalledWith("job-4");
    await user.click(screen.getByRole("button", { name: /Yeniden Baskı/ }));
    await user.selectOptions(screen.getByLabelText("Neden"), "LOST");
    await user.click(screen.getByRole("button", { name: "Yeniden Yazdır" }));
    expect(api.reprint).toHaveBeenCalledWith("job-1", "LOST", undefined);
  });

  it("replacement engelini gösterir ve mevcut onay mekanizmasını çağırır", async () => {
    api.getReceiptLabelOverview.mockResolvedValue({
      purchaseOrderId: "po-1", purchaseNumber: "PO-1", supplierName: "Supplier", observedAt: "2026-10-16T10:00:00Z", live: true,
      skus: [{ productId: "product-1", sku: "SKU-1", productTitle: "Product", material: "Çelik", profileType: "Kare", size: "40 mm", totalPackageCount: 1, printedCount: 0, nextPackageNumber: 1, packages: [
        { id: "pkg-1", code: "PKG-1", packageNumber: 1, totalPackages: 1, quantityBaseInt: 1, planVersion: "v1", normalPrinted: false, currentJobId: "job-1", currentJobStatus: "QUEUED", revisionAmbiguous: false, replacementRequired: true, replacementBlocked: true, confirmationAvailable: false, canReprint: false },
      ] }],
    });
    vi.stubGlobal("matchMedia", matchMedia(true));
    const user = userEvent.setup();
    render(<DesktopReceiptLabelsGate purchaseOrderId="po-1" supplierLotCode="LOT-1" onSupplierLotCodeChange={vi.fn()}/>);
    expect(await screen.findByText(/Eski etiketin kaldırıldığı/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Eski etiketi kaldırdım/ }));
    expect(api.acknowledgeReplacement).toHaveBeenCalledWith("job-1");
  });
});
