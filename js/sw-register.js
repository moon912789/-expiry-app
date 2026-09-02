/*
  sw-register.js
  역할: index.html이 아닌 화면(add.html, calendar.html)에서도 서비스 워커를 등록/최신화합니다.
        (알림 기능은 index.html의 js/main.js에서만 필요해서, 여기서는 등록/업데이트만 다룹니다)

  controllerchange 이벤트는 "새 서비스 워커가 화면을 실제로 넘겨받은 순간"에 발생합니다.
  이 순간 페이지를 한 번 자동으로 새로고침해서, 새로 배포한 내용이 바로 보이도록 합니다.
  (처음 설치되는 첫 방문에서도 한 번 발생할 수 있는데, 그때는 어차피 최신 내용이라
  화면이 살짝 깜빡이는 정도로 무해합니다)
*/
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("sw.js")
    .then((registration) => {
      registration.update();
    })
    .catch((error) => {
      console.error("서비스 워커 등록 실패:", error);
    });

  let hasReloadedForNewServiceWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForNewServiceWorker) return;
    hasReloadedForNewServiceWorker = true;
    window.location.reload();
  });
}
