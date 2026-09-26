import { Badge } from "./ui";

export function StatusBadge({ status }: { status: string }) {
  const isPicking = status === "Toplanıyor";
  return (
    <Badge variant={isPicking ? "warning" : "success"}>
      {status}
    </Badge>
  );
}
