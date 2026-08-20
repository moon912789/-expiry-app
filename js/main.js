/*
  main.js
  역할: index.html(메인 화면)에서 다음 세 가지를 그리고 처리합니다.
        1) "지금 알림 받아야 할 항목" 강조 섹션
        2) 카테고리 필터 탭 + 항목 목록
        3) 브라우저 알림(Notification API) 요청 및 발송

  storage.js의 함수로 데이터를 가져오고, dateUtils.js의 함수로
  남은 일수/색상을 계산합니다.
*/

// 지금 선택된 카테고리 탭 ("all"이면 전체 보기)
let currentCategoryFilter = "all";

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

  const ddaySpan = document.createElement("span");
  ddaySpan.className = "item-dday";
  ddaySpan.textContent = ddayText;

  link.appendChild(nameSpan);
  link.appendChild(ddaySpan);
  li.appendChild(link);
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
  ---- 브라우저 알림(Notification API) ----
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

// 알림 받아야 할 항목 중, 오늘 아직 알림을 보내지 않은 항목에게만 실제 시스템 알림을 띄웁니다.
function sendDueNotifications(alertItems) {
  const log = getNotifiedLog();
  const today = getTodayString();

  alertItems.forEach((item) => {
    if (log[item.id] === today) return; // 오늘 이미 알림을 보냈으면 건너뜀

    const remainingDays = getRemainingDays(item.expiryDate);
    try {
      new Notification("유통기한 알림", {
        body: `${item.name} - ${formatDday(remainingDays)}`,
      });
    } catch (error) {
      // 일부 브라우저(특히 모바일)는 이 방식의 알림을 지원하지 않을 수 있어
      // 에러가 나더라도 화면 전체가 멈추지 않도록 여기서 잡아줍니다.
      console.error("알림을 띄우지 못했습니다.", error);
    }
    markNotifiedToday(item.id);
  });
}

// 페이지를 열 때 알림 권한을 확인/요청하고, 필요하면 알림을 보냅니다.
function initNotifications(alertItems) {
  if (alertItems.length === 0) return;
  if (!("Notification" in window)) return; // 알림 API를 지원하지 않는 브라우저는 그냥 넘어감

  if (Notification.permission === "granted") {
    sendDueNotifications(alertItems);
  } else if (Notification.permission === "default") {
    // 아직 사용자에게 물어본 적이 없을 때만 권한을 요청합니다.
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        sendDueNotifications(alertItems);
      }
    });
  }
  // "denied"(거부됨)면 아무것도 하지 않습니다.
}

// 페이지가 열리자마자 목록을 그리고, 알림이 필요한 항목이 있으면 알림을 시도합니다.
renderList();
initNotifications(computeAlertItems(getItems()));
