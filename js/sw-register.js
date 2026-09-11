/*
  sw-register.js
  역할: index.html이 아닌 화면(add.html, calendar.html)에서도 서비스 워커를 등록/최신화합니다.
        (알림 기능은 index.html의 js/main.js에서만 필요해서, 여기서는 등록/업데이트만 다룹니다)

  controllerchange 이벤트는 "새 서비스 워커가 화면을 실제로 넘겨받은 순간"에 발생합니다.
  이 순간 페이지를 한 번 자동으로 새로고침해서, 새로 배포한 내용이 바로 보이도록 합니다.

  중요(이전 버전의 버그): 서비스 워커를 "맨 처음 설치"할 때도 이 이벤트가 한 번
  발생합니다. 예전 코드는 이 경우까지 구분 없이 새로고침을 해버려서, 이 화면(특히
  입력 폼이 있는 add.html)에서 사용자가 한창 입력하고 있는 도중에도 화면이 갑자기
  리셋되는 문제가 있었습니다. 그래서 "이 페이지를 열었을 때 이미 다른 곳에서
  서비스 워커가 활성화되어 있었는지"를 먼저 기록해두고, 그게 true일 때(=새 버전으로
  "교체"된 경우)만 새로고침하고, false일 때(=지금이 첫 설치인 경우, 지금 로드된
  페이지가 이미 최신 내용)는 새로고침하지 않습니다.
*/
if ("serviceWorker" in navigator) {
  const hadControllerBeforeRegister = !!navigator.serviceWorker.controller;

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
    if (!hadControllerBeforeRegister) return; // 첫 설치라서 새로고침이 필요 없는 경우
    if (hasReloadedForNewServiceWorker) return;
    hasReloadedForNewServiceWorker = true;
    window.location.reload();
  });
}
