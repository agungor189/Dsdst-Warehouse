export const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const platformLabel = (value: string | null) => value?.trim() || "Diğer";

export const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const formatWeight = (grams: number) => {
  const safeGrams = Number.isFinite(grams) ? grams : 0;
  if (Math.abs(safeGrams) < 1000) return `${safeGrams.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} g`;
  return `${(safeGrams / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg`;
};

export const formatQuantity = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export const formatDuration = (startedAt: string, completedAt: string) => {
  const milliseconds = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours} sa ${remainingMinutes} dk` : `${Math.max(1, minutes)} dk`;
};
