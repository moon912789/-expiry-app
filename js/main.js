/*
  main.js
  역할: index.html(메인 화면)에서 다음 세 가지를 그리고 처리합니다.
        1) "지금 알림 받아야 할 항목" 강조 섹션
        2) 카테고리 필터 탭 + 항목 목록
        3) 서비스 워커 등록 + 브라우저 알림 요청 및 발송

  storage.js의 함수로 데이터를 가져오고, dateUtils.js의 함수로
  남은 일수/색상을 계산합니다.
*/

// 지금 선택된 카테고리 탭 ("all"이면 전체 보기)
let currentCategoryFilter = "all";

// 화장품이 아닌(음식) 카테고리 목록. 레시피 찾기 링크는 이 카테고리에서만 보여줍니다.
const FOOD_CATEGORIES = ["상온", "냉장", "냉동"];

// 항목 하나를 나타내는 <li> 카드를 만듭니다.
// 목록(item-list)과 알림 섹션(alert-section) 양쪽에서 똑같은 모양으로 재사용합니다.
function createItemCard(item) {
  const remainingDays = getRemainingDays(item.expiryDate);
  const statusClass = getStatusClass(remainingDays);
  const ddayText = formatDday(remainingDays);
  const categoryIcon = CATEGORY_ICONS[item.category] || "";

  const li = document.createElement("li");
  li.className = `item ${statusClass}`;

  const link = document.createElement("a");
  link.className = "item-link";
  link.href = `add.html?id=${encodeURIComponent(item.id)}`; // 클릭하면 수정 화면으로 이동

  const nameSpan = document.createElement("span");
  nameSpan.className = "item-name";
  // 카테고리 이모지 + 이름 순서로 표시 (예: "🧊 우유")
  nameSpan.textContent = `${categoryIcon} ${item.name}`;

  // 메모가 있는 항목에만 📝 표시를 덧붙입니다.
  if (item.memo) {
    const memoBadge = document.createElement("span");
    memoBadge.className = "memo-badge";
    memoBadge.textContent = " 📝";
    memoBadge.title = "메모 있음";
    nameSpan.appendChild(memoBadge);
  }

  // 알레르기 정보가 있는 항목(바코드 스캔으로 조회된 경우만)에는 경고 아이콘을 덧붙입니다.
  // 마우스를 올리면(title) 전체 성분도 미리 볼 수 있고, 자세히 보려면 항목을 클릭해서
  // 수정 화면으로 들어가면 됩니다.
  if (item.allergyInfo) {
    const allergyBadge = document.createElement("span");
    allergyBadge.className = "allergy-badge";
    allergyBadge.textContent = " ⚠️";
    allergyBadge.title = `알레르기 정보: ${item.allergyInfo}`;
    nameSpan.appendChild(allergyBadge);
  }

  const ddaySpan = document.createElement("span");
  ddaySpan.className = "item-dday";
  ddaySpan.textContent = ddayText;

  link.appendChild(nameSpan);
  link.appendChild(ddaySpan);
  li.appendChild(link);

  // 레시피 찾기 링크는 item-link(수정 화면으로 이동하는 링크) 안이 아니라 밖에,
  // <li>의 형제 요소로 따로 둡니다. <a> 안에 또 다른 <a>를 중첩할 수 없기 때문입니다.
  // 화장품 카테고리는 레시피와 관계가 없으므로 음식 카테고리에서만 보여줍니다.
  if (FOOD_CATEGORIES.includes(item.category)) {
    const recipeLink = document.createElement("a");
    recipeLink.className = "recipe-link";
    recipeLink.href = `https://www.10000recipe.com/recipe/list.html?q=${encodeURIComponent(item.name)}`;
    recipeLink.target = "_blank";
    recipeLink.rel = "noopener noreferrer"; // 새 탭이 원래 페이지(window.opener)를 조작하지 못하도록 막는 보안 관례
    recipeLink.textContent = "🍳 레시피 찾기";
    li.appendChild(recipeLink);
  }

  return li;
}

// 남은 일수가 alertDays 이하인(=지금 알림을 받아야 하는) 항목만 골라
// 유통기한이 임박한 순서로 정렬해서 반환합니다.
function computeAlertItems(items) {
  return items
    .filter((item) => getRemainingDays(item.expiryDate) <= item.alertDays)
    .sort((a, b) => getRemainingDays(a.expiryDate) - getRemainingDays(b.expiryDate));
}

// "지금 알림 받아야 할 항목" 섹션을 그립니다. 해당하는 항목이 없으면 비워둡니다.
function renderAlertSection(alertItems) {
  const sectionEl = document.getElementById("alert-section");
  sectionEl.innerHTML = "";

  if (alertItems.length === 0) return;

  const heading = document.createElement("h2");
  heading.className = "alert-heading";
  heading.textContent = `⏰ 지금 알림 받아야 할 항목 (${alertItems.length})`;
  sectionEl.appendChild(heading);

  const listEl = document.createElement("ul");
  listEl.className = "item-list";
  alertItems.forEach((item) => listEl.appendChild(createItemCard(item)));
  sectionEl.appendChild(listEl);
}

// 카테고리 탭 + 항목 목록을 그립니다.
function renderList() {
  const items = getItems();

  // 알림 섹션은 카테고리 필터와 상관없이 전체 항목 기준으로 보여줍니다.
  renderAlertSection(computeAlertItems(items));

  // 선택된 탭에 맞는 항목만 걸러냅니다.
  const filteredItems =
    currentCategoryFilter === "all"
      ? items
      : items.filter((item) => item.category === currentCategoryFilter);

  // 유통기한이 임박한 순서(남은 일수가 적은 순서)로 정렬합니다.
  filteredItems.sort((a, b) => getRemainingDays(a.expiryDate) - getRemainingDays(b.expiryDate));

  const listEl = document.getElementById("item-list");
  listEl.innerHTML = ""; // 기존 목록을 비우고 새로 그립니다.

  if (filteredItems.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty";
    emptyLi.textContent =
      currentCategoryFilter === "all"
        ? "등록된 항목이 없습니다. 추가 버튼을 눌러 등록해보세요."
        : "이 카테고리에는 등록된 항목이 없습니다.";
    listEl.appendChild(emptyLi);
    return;
  }

  filteredItems.forEach((item) => listEl.appendChild(createItemCard(item)));
}

// 카테고리 탭 클릭 처리: 탭 선택 표시를 바꾸고 목록을 다시 그립니다.
document.querySelectorAll(".category-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".category-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentCategoryFilter = tab.dataset.category;
    renderList();
  });
});

/*
  ---- 서비스 워커 등록 ----
  안드로이드 크롬 같은 모바일 브라우저는 `new Notification()`을 지원하지 않고,
  서비스 워커(sw.js)에 등록된 `registration.showNotification()`만 지원합니다.
  그래서 알림을 보내기 전에 먼저 서비스 워커를 등록해야 합니다.

  navigator.serviceWorker.ready는 "등록된 서비스 워커가 실제로 활성화될 때까지" 기다리는
  Promise입니다. register()가 끝났다고 바로 알림을 보낼 준비가 된 게 아니라서 이 단계가 필요합니다.

  주의: 크롬은 sw.js가 바뀌었는지 보통 "마지막 확인 후 24시간이 지났을 때"만 자동으로
  다시 확인합니다. 그래서 새로고침만으로는 앱을 수정해도 예전 캐시가 계속 보일 수 있습니다.
  registration.update()를 직접 호출하면 이 24시간 제한과 상관없이 즉시 새 버전이 있는지
  확인하기 때문에, 페이지를 열 때마다 호출해서 항상 최신 버전을 받도록 합니다.

  그런데 여기서 끝이 아닙니다: update()가 새 버전을 찾아서 설치를 시작해도, 그 설치가
  끝나서 "새 서비스 워커가 실제로 화면을 넘겨받는 시점"은 페이지가 이미 로드된 뒤,
  백그라운드에서 비동기로 일어납니다. 그래서 사용자가 새로고침을 여러 번 반복해도
  타이밍에 따라 계속 예전 화면만 보이는 경우가 있었습니다.
  아래 controllerchange 이벤트는 "새 서비스 워커가 화면을 넘겨받은 바로 그 순간"에
  발생하므로, 그 시점에 페이지를 자동으로 한 번 새로고침해서 최신 화면이 확실히
  보이도록 합니다.

  중요(이전 버전의 버그): 서비스 워커를 "맨 처음 설치"할 때도 이 이벤트가 한 번
  발생합니다. 예전 코드는 이 경우까지 구분 없이 새로고침을 해버려서, 사용자가
  폼에 한창 입력하고 있는 도중에도 화면이 갑자기 리셋되는 문제가 있었습니다.
  그래서 "이 페이지를 열었을 때 이미 다른 곳에서 서비스 워커가 활성화되어 있었는지"를
  먼저 기록해두고, 그게 true일 때(=새 버전으로 "교체"된 경우)만 새로고침하고,
  false일 때(=지금이 첫 설치인 경우, 지금 로드된 페이지가 이미 최신 내용)는
  새로고침하지 않습니다.
*/
if ("serviceWorker" in navigator) {
  const hadControllerBeforeRegister = !!navigator.serviceWorker.controller;
  let hasReloadedForNewServiceWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadControllerBeforeRegister) return; // 첫 설치라서 새로고침이 필요 없는 경우
    if (hasReloadedForNewServiceWorker) return;
    hasReloadedForNewServiceWorker = true;
    window.location.reload();
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);

  return navigator.serviceWorker
    .register("sw.js")
    .then((registration) => {
      registration.update(); // 새 버전이 있는지 즉시 확인 (결과를 기다리지 않고 백그라운드로 진행)
      return navigator.serviceWorker.ready;
    })
    .catch((error) => {
      console.error("서비스 워커 등록 실패:", error);
      return null;
    });
}

// 페이지를 열자마자 서비스 워커 등록을 시작합니다. (알림 여부와 상관없이 항상 등록)
const swRegistrationReady = registerServiceWorker();

/*
  ---- 브라우저 알림 ----
  같은 항목으로 하루에 여러 번 알림이 뜨지 않도록, "이 항목에게 마지막으로
  알림을 보낸 날짜"를 localStorage에 따로 기록해둡니다.
  예: { "1699999999999": "2026-08-20" }
*/
const NOTIFIED_LOG_KEY = "expiryNotifiedLog";

function getNotifiedLog() {
  const json = localStorage.getItem(NOTIFIED_LOG_KEY);
  return json ? JSON.parse(json) : {};
}

function markNotifiedToday(itemId) {
  const log = getNotifiedLog();
  log[itemId] = getTodayString();
  localStorage.setItem(NOTIFIED_LOG_KEY, JSON.stringify(log));
}

// 알림 받아야 할 항목 중, 오늘 아직 알림을 보내지 않은 항목에게만
// 서비스 워커를 통해 실제 시스템 알림을 띄웁니다.
function sendDueNotifications(registration, alertItems) {
  const log = getNotifiedLog();
  const today = getTodayString();

  alertItems.forEach((item) => {
    if (log[item.id] === today) return; // 오늘 이미 알림을 보냈으면 건너뜀

    const remainingDays = getRemainingDays(item.expiryDate);
    registration
      .showNotification("유통기한 알림", {
        body: `${item.name} - ${formatDday(remainingDays)}`,
        icon: "icon-192.png",
      })
      .catch((error) => {
        // 알림 권한이 없거나 브라우저가 막은 경우 등, 실패해도 화면이 멈추지 않게 잡아줍니다.
        console.error("알림을 띄우지 못했습니다.", error);
      });
    markNotifiedToday(item.id);
  });
}

// 페이지를 열 때 알림 권한을 확인/요청하고, 서비스 워커 준비가 끝나면 알림을 보냅니다.
function initNotifications(alertItems) {
  if (alertItems.length === 0) return;
  if (!("Notification" in window)) return; // 알림 API를 지원하지 않는 브라우저는 그냥 넘어감

  swRegistrationReady.then((registration) => {
    if (!registration) return; // 서비스 워커 등록이 안 됐으면 알림도 보낼 수 없음

    if (Notification.permission === "granted") {
      sendDueNotifications(registration, alertItems);
    } else if (Notification.permission === "default") {
      // 아직 사용자에게 물어본 적이 없을 때만 권한을 요청합니다.
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          sendDueNotifications(registration, alertItems);
        }
      });
    }
    // "denied"(거부됨)면 아무것도 하지 않습니다.
  });
}

// 목록을 다시 그리고, 알림이 필요한 항목이 있으면 알림을 시도합니다.
// (페이지를 처음 열 때는 물론, 아래 visibilitychange에서도 이 함수를 다시 호출합니다)
function refreshListAndNotifications() {
  renderList();
  initNotifications(computeAlertItems(getItems()));
}

/*
  PWA(홈 화면에 추가해서 쓰는 앱)는 다음 날 다시 열어도 브라우저가 페이지를
  완전히 새로고침하지 않고, 어제 백그라운드에 있던 화면을 그대로 다시 보여주기만
  하는 경우가 많습니다. 이때는 위의 renderList()/initNotifications() 호출이
  다시 실행되지 않아서 "오늘 날짜"가 갱신되지 않고, 그날의 알림도 확인하지 않습니다.
  (그래서 앱을 켠 첫날만 알림이 오고 그 다음부터는 안 오는 문제가 생겼습니다)

  visibilitychange 이벤트는 화면이 다시 보이는(포그라운드로 돌아오는) 시점에
  항상 발생하므로, 이때마다 목록/알림을 다시 확인하도록 합니다.
*/
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshListAndNotifications();
  }
});

// 페이지가 열리자마자 목록을 그리고, 알림이 필요한 항목이 있으면 알림을 시도합니다.
refreshListAndNotifications();
