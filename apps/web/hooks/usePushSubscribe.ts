"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

/**
 * Web Push 구독 관리 훅.
 *
 * 흐름:
 *  1) 서버에서 VAPID 공개키 가져오기
 *  2) 서비스워커 등록 (/sw.js)
 *  3) PushManager.subscribe → endpoint + p256dh + auth 추출
 *  4) 서버 /notifications/push/subscribe 에 POST
 *
 * 브라우저 미지원 / 권한 거부는 명시적 상태로 노출 (껍데기 0)
 */
export function usePushSubscribe() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    // 현재 구독 상태 조회
    navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        if (!reg) return setSubscribed(false);
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      })
      .catch(() => setSubscribed(false));
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("이 브라우저는 ServiceWorker를 지원하지 않습니다");
      }
      // 1) VAPID 키
      const { data: vapid } = await apiClient.get("/notifications/push/vapid-key");
      if (!vapid?.publicKey) {
        throw new Error("서버에 VAPID 공개키가 설정되지 않았습니다");
      }

      // 2) 권한 요청
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        throw new Error("알림 권한이 거부되었습니다");
      }

      // 3) SW 등록
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 4) 구독 — Uint8Array 캐스팅 (lib.dom 타입 호환)
      const appServerKey = urlBase64ToUint8Array(vapid.publicKey) as BufferSource;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
      const json = sub.toJSON() as any;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!p256dh || !auth) {
        throw new Error("Push 구독 정보 추출 실패");
      }

      // 5) 서버 등록
      await apiClient.post("/notifications/push/subscribe", {
        type: "webpush",
        endpoint: sub.endpoint,
        keys: { p256dh, auth },
        userAgent: navigator.userAgent,
      });
      setSubscribed(true);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "구독 실패";
      setError(msg);
      throw new Error(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await apiClient.delete("/notifications/push/subscribe", {
          data: { endpoint: sub.endpoint },
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "구독 해제 실패";
      setError(msg);
      throw new Error(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    const { data } = await apiClient.post("/notifications/push/test");
    return data as { sent: number; failed: number; channels: string[] };
  }, []);

  return {
    supported,
    permission,
    subscribed,
    busy,
    error,
    subscribe,
    unsubscribe,
    sendTest,
  };
}

// VAPID 공개키(base64url) → Uint8Array (Push API 표준 변환)
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window !== "undefined" ? window.atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
