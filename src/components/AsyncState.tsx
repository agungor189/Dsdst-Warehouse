import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";

export function LoadingState({ label = "Yükleniyor" }: { label?: string }) {
  return (
    <div className="state-card" role="status">
      <LoaderCircle className="animate-spin text-moss" size={30} />
      <p className="font-bold">{label}</p>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-card border-danger/20 bg-red-50" role="alert">
      <AlertTriangle className="text-danger" size={32} />
      <div className="text-center">
        <p className="font-black">İşlem tamamlanamadı</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
      {retry && (
        <button className="secondary-button mt-2" onClick={retry}>
          <RefreshCw size={18} /> Tekrar dene
        </button>
      )}
    </div>
  );
}
