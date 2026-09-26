import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, LoadingState } from "./ui";

export { LoadingState };

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-card border-danger/20 bg-red-50" role="alert">
      <AlertTriangle className="text-danger" size={32} />
      <div className="text-center">
        <p className="font-black">İşlem tamamlanamadı</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
      {retry && (
        <Button variant="secondary" className="mt-2" onClick={retry}>
          <RefreshCw size={18} /> Tekrar dene
        </Button>
      )}
    </div>
  );
}
