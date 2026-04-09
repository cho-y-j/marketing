/**
 * Web Push 서비스워커.
 * - push 이벤트: 서버가 보낸 JSON 페이로드를 알림으로 표시
 * - notificationclick: 알림 클릭 시 url 로 포커스/오픈
 *
 * 페이로드 예시 (PushService.sendToUser 에서 전송):
 *   { title, body, data: { url, ...rest } }
 */

self.addEventListener("install", (event) => {
  // 즉시 활성화 (구버전 SW 대체)
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "마케팅 AI", body: "새 알림", data: {} };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }
  const title = payload.title || "마케팅 AI";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {},
    tag: payload.data?.storeId || "default",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
