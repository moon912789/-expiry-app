/*
  sw.js (서비스 워커)
  역할:
  1) 핵심 파일들을 캐시해둬서, 네트워크가 불안정할 때도 앱이 잘 열리게 도와줍니다.
  2) 안드로이드 크롬 같은 모바일 브라우저는 `new Notification()`을 지원하지 않고
     서비스 워커의 `registration.showNotification()`만 지원합니다.
     알림을 띄우려면 이 파일이 등록되어 있어야 하고, 실제 알림 호출은 js/main.js에서 합니다.

  캐싱 전략(중요): "캐시 우선"이 아니라 "네트워크 우선"으로 동작합니다.
  요청이 오면 먼저 네트워크로 최신 파일을 받아오려고 시도하고, 성공하면 그 응답을
  화면에 보여주는 동시에 캐시도 최신 내용으로 갱신합니다. 네트워크가 안 되는(오프라인)
  경우에만 캐시에 있던 예전 파일을 대신 보여줍니다.

  예전에는 "캐시 우선" 방식이라, 앱을 새로 배포해도 새 서비스 워커가 실제로
  활성화되기 전까지는(보통 새로고침을 1~2번 더 해야 함) 화면에 예전 내용이 계속
  보이는 문제가 있었습니다. 네트워크 우선 방식으로 바꾸면 배포 직후 새로고침
  한 번만으로도 항상 최신 내용을 받아오기 때문에 이 문제가 근본적으로 해결됩니다.
*/

const CACHE_NAME = "expiry-app-cache-v23";

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
  "js/sw-register.js",
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

// 요청이 오면 먼저 네트워크로 최신 파일을 받아오고, 성공하면 캐시도 그 내용으로
// 갱신합니다. 네트워크 요청이 실패했을 때만(오프라인 등) 캐시에 있던 예전 파일로
// 대신 응답합니다. (GET 요청만 캐시 대상으로 삼습니다 - POST 등은 캐시에 넣을 수 없습니다)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
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
