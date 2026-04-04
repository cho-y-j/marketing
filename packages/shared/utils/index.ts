// 네이버 플레이스 URL에서 ID 추출
export function extractPlaceIdFromUrl(url: string): string | null {
  // https://map.naver.com/v5/entry/place/1234567890
  // https://naver.me/xxxxx
  // https://m.place.naver.com/restaurant/1234567890
  const patterns = [
    /place\/(\d+)/,
    /restaurant\/(\d+)/,
    /cafe\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// 날짜 포맷 (YYYY-MM-DD)
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// 숫자 포맷 (1,234)
export function formatNumber(num: number): string {
  return num.toLocaleString("ko-KR");
}

// 퍼센트 변동 표시 (+45%, -12%)
export function formatChange(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value}%`;
}
