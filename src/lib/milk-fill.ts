export function milkFill(morning: number, evening: number, capacity = 100) {
  const morningLitres = Number.isFinite(morning) ? Math.max(0, morning) : 0;
  const eveningLitres = Number.isFinite(evening) ? Math.max(0, evening) : 0;
  const total = morningLitres + eveningLitres;
  const visibleCapacity = Math.max(capacity > 0 ? capacity : 100, total);
  const morningShare = total > 0 ? (morningLitres / total) * 100 : 0;

  return {
    fillPercent: (total / visibleCapacity) * 100,
    morningSharePercent: morningShare,
    eveningSharePercent: total > 0 ? 100 - morningShare : 0,
  };
}
