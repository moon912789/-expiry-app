/*
  sw.js (서비스 워커)
  역할:
  1) 핵심 파일들을 캐시해둬서, 네트워크가 불안정할 때도 앱이 잘 열리게 도와줍니다.
     (복잡한 오프라인 전략은 아니고, 캐시에 있으면 캐시를 먼저 보여주는 정도의 최소한의 캐싱입니다)
  2) 안드로이드 크롬 같은 모바일 브라우저는 `new Notification()`을 지원하지 않고
     서비스 워커의 `registration.showNotification()`만 지원합니다.
     알림을 띄우려면 이 파일이 등록되어 있어야 하고, 실제 알림 호출은 js/main.js에서 합니다.

  주의: 나중에 index.html/css/js 파일 내용을 바꿨는데 화면에 예전 내용이 계속 보인다면,
  브라우저가 이 캐시를 계속 쓰고 있기 때문일 수 있습니다. 그럴 땐 아래 CACHE_NAME의
  버전(v1)을 v2처럼 올려주세요. 그러면 예전 캐시는 activate 단계에서 자동으로 정리됩니다.
*/

const CACHE_NAME = "expiry-app-cache-v5";

// 앱이 열릴 때 최소한으로 필요한 파일들만 캐시해둡니다.
// (바코드 스캔에 쓰는 CDN 라이브러리는 우리 사이트와 다른 서버 파일이라 여기 목록에는 넣지 않습니다.
//  바코드 스캔은 어차피 Open Food Facts 조회에 네트워크가 필요해서 오프라인 지원 대상이 아닙니다)
const CORE_ASSETS = [
  "index.html",
  "add.html",
  "calendar.html",
  "css/style.css",
  "js/storage.js",
  "js/dateUtils.js",
  "js/main.js",
  "js/form.js",
  "js/calendar.js",
  "js/barcode.js",
  "manifest.json",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
];

// 설치될 때 핵심 파일들을 캐시에 담아둡니다.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting(); // 새 서비스 워커를 대기 없이 바로 활성화
});

// 활성화될 때 이전 버전의 캐시를 정리합니다.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim(); // 이미 열려 있는 페이지들도 바로 이 서비스 워커의 제어를 받게 함
});

// 요청이 오면 캐시에 있는 파일을 우선 보여주고, 캐시에 없으면 네트워크로 요청합니다.
self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

// 알림을 클릭하면 앱 창을 열거나, 이미 열려 있는 창이 있으면 그 창에 초점을 맞춥니다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsArr) => {
      const existing = clientsArr.find((client) => client.url.includes("index.html"));
      if (existing) return existing.focus();
      return self.clients.openWindow("index.html");
    })
  );
});
