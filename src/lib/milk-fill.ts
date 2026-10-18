export function milkFill(morning: number, noon: number, evening: number, capacity = 100) {
  const morningLitres = Number.isFinite(morning) ? Math.max(0, morning) : 0;
  const noonLitres = Number.isFinite(noon) ? Math.max(0, noon) : 0;
  const eveningLitres = Number.isFinite(evening) ? Math.max(0, evening) : 0;
  const total = morningLitres + noonLitres + eveningLitres;
  const visibleCapacity = Math.max(capacity > 0 ? capacity : 100, total);
  const morningShare = total > 0 ? (morningLitres / total) * 100 : 0;

  return {
    fillPercent: (total / visibleCapacity) * 100,
    morningSharePercent: morningShare,
    noonSharePercent: total > 0 ? (noonLitres / total) * 100 : 0,
    eveningSharePercent: total > 0 ? (eveningLitres / total) * 100 : 0,
  };
}
