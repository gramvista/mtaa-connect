import type { Location } from "@/types/domain";

export function baloziOptionLabel(area: Pick<Location, "name" | "balozi_name">) {
  const leader = area.balozi_name?.trim();
  return `${area.name} — Jina la Balozi: ${leader || "Hajatajwa"}`;
}
