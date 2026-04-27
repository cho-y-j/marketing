/**
 * 텍스트 클립보드 복사 — 모바일 WebView/비HTTPS 환경 폴백 포함.
 *
 * 동작 우선순위:
 *  1. `navigator.clipboard.writeText` (HTTPS + 권한 OK 일 때)
 *  2. 보이지 않는 textarea + `document.execCommand("copy")` (구형/WebView)
 *
 * 반환: 성공/실패 boolean. UI 가 토스트로 분기 가능.
 *
 * 왜 이 헬퍼가 필요한가:
 *  - `navigator.clipboard` 가 비밀스럽게 reject 되면 호출자가 알 길이 없어 false positive 발생
 *  - 모바일 앱 WebView 는 권한 정책이 다양 — execCommand 폴백이 더 잘 먹는 경우 많음
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof window !== "undefined" &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // clipboard API 가 reject — execCommand 폴백으로
  }

  if (typeof document === "undefined") return false;

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  const prevSelection = document.getSelection()?.rangeCount
    ? document.getSelection()!.getRangeAt(0)
    : null;

  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  if (prevSelection) {
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(prevSelection);
  }
  return ok;
}
