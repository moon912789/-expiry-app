/*
  calendar.js
  역할: calendar.html에서 월별 달력을 그리고, 날짜를 클릭하면 그 날이
        유통기한인 항목을 보여주는 코드입니다.

  주의: 데이터를 가져오는 건 storage.js(getItems), 날짜 계산은
        dateUtils.js(getTodayString, getRemainingDays, getStatusClass,
        formatDday, formatDateForInput)를 그대로 사용합니다.
        이 파일에서는 새로운 날짜 계산 함수를 만들지 않습니다.
*/

// 지금 화면에 보여줄 연도/월 (기본값: 오늘이 속한 달)
const today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth(); // 0 = 1월, 11 = 12월

// 사용자가 클릭해서 선택한 날짜 ("YYYY-MM-DD" 문자열, 처음엔 선택 없음)
let selectedDate = null;

const titleEl = document.getElementById("calendar-title");
const gridEl = document.getElementById("calendar-grid");
const selectedItemsEl = document.getElementById("selected-day-items");

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 등록된 모든 항목을 유통기한(expiryDate) 기준으로 묶습니다.
// 예: { "2026-08-22": [항목1, 항목2], "2026-08-25": [항목3] }
// -> 달력 칸을 하나씩 그릴 때마다 매번 전체 항목을 뒤지지 않도록 미리 정리해두는 것입니다.
function groupItemsByExpiryDate() {
  const items = getItems();
  const grouped = {};
  items.forEach((item) => {
    if (!grouped[item.expiryDate]) {
      grouped[item.expiryDate] = [];
    }
    grouped[item.expiryDate].push(item);
  });
  return grouped;
}

// 달력 전체를 다시 그립니다. (처음 열었을 때 / 이전·다음 달 버튼을 눌렀을 때 호출)
function renderCalendar() {
  titleEl.textContent = `${currentYear}년 ${currentMonth + 1}월`;

  const itemsByDate = groupItemsByExpiryDate();

  gridEl.innerHTML = "";

  // 요일 헤더(일~토)를 먼저 채웁니다.
  WEEKDAY_LABELS.forEach((label) => {
    const weekdayEl = document.createElement("div");
    weekdayEl.className = "calendar-weekday";
    weekdayEl.textContent = label;
    gridEl.appendChild(weekdayEl);
  });

  // 이번 달 1일이 무슨 요일인지 (0=일요일 ~ 6=토요일)
  const firstWeekday = new Date(currentYear, currentMonth, 1).getDay();
  // 이번 달의 마지막 날짜 (다음 달 0번째 날 = 이번 달 마지막 날이 되는 성질을 이용)
  const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();

  // 1일 앞에 빈 칸을 넣어서 요일 위치를 맞춥니다.
  for (let i = 0; i < firstWeekday; i++) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "calendar-day empty";
    gridEl.appendChild(emptyEl);
  }

  // 1일부터 마지막 날까지 날짜 칸을 하나씩 만듭니다.
  for (let day = 1; day <= lastDate; day++) {
    const dateStr = formatDateForInput(new Date(currentYear, currentMonth, day));

    const dayEl = document.createElement("div");
    dayEl.className = "calendar-day";

    if (dateStr === getTodayString()) {
      dayEl.classList.add("today");
    }
    if (dateStr === selectedDate) {
      dayEl.classList.add("selected");
    }

    const numberEl = document.createElement("span");
    numberEl.className = "day-number";
    numberEl.textContent = String(day);
    dayEl.appendChild(numberEl);

    // 이 날짜가 유통기한인 항목이 있으면 개수 배지를 붙입니다.
    const itemsOnThisDay = itemsByDate[dateStr];
    if (itemsOnThisDay && itemsOnThisDay.length > 0) {
      // 메인 화면과 똑같은 기준(green/yellow/red)을 그대로 사용합니다.
      const statusClass = getStatusClass(getRemainingDays(dateStr));

      const badgeEl = document.createElement("span");
      badgeEl.className = `day-badge ${statusClass}`;
      badgeEl.textContent = String(itemsOnThisDay.length);
      dayEl.appendChild(badgeEl);
    }

    // 날짜 칸을 클릭하면 해당 날짜를 선택하고, 아래에 항목 목록을 보여줍니다.
    dayEl.addEventListener("click", () => {
      selectedDate = dateStr;
      renderCalendar();
      renderSelectedDayItems(itemsOnThisDay || []);
    });

    gridEl.appendChild(dayEl);
  }
}

// 선택된 날짜의 항목 목록을 달력 아래 영역에 그립니다.
function renderSelectedDayItems(items) {
  selectedItemsEl.innerHTML = "";

  const heading = document.createElement("h2");
  heading.className = "selected-day-heading";
  heading.textContent = `${selectedDate} 유통기한 항목`;
  selectedItemsEl.appendChild(heading);

  if (items.length === 0) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "empty";
    emptyEl.textContent = "이 날짜가 유통기한인 항목이 없습니다.";
    selectedItemsEl.appendChild(emptyEl);
    return;
  }

  // 메인 화면(main.js)과 같은 모양의 카드로 보여줘서 두 화면이 통일감 있게 보이도록 합니다.
  const listEl = document.createElement("ul");
  listEl.className = "item-list";

  items.forEach((item) => {
    const remainingDays = getRemainingDays(item.expiryDate);
    const statusClass = getStatusClass(remainingDays);

    const li = document.createElement("li");
    li.className = `item ${statusClass}`;

    const link = document.createElement("a");
    link.className = "item-link";
    link.href = `add.html?id=${encodeURIComponent(item.id)}`; // 클릭하면 수정 화면으로 이동

    const nameSpan = document.createElement("span");
    nameSpan.className = "item-name";
    nameSpan.textContent = item.name;

    const ddaySpan = document.createElement("span");
    ddaySpan.className = "item-dday";
    ddaySpan.textContent = formatDday(remainingDays);

    link.appendChild(nameSpan);
    link.appendChild(ddaySpan);
    li.appendChild(link);
    listEl.appendChild(li);
  });

  selectedItemsEl.appendChild(listEl);
}

// 이전 달 버튼: 1월에서 한 칸 더 가면 작년 12월로 넘어가야 합니다.
document.getElementById("prev-month-btn").addEventListener("click", () => {
  currentMonth -= 1;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear -= 1;
  }
  selectedDate = null; // 달이 바뀌면 이전에 선택했던 날짜 목록은 지웁니다.
  selectedItemsEl.innerHTML = "";
  renderCalendar();
});

// 다음 달 버튼: 12월에서 한 칸 더 가면 내년 1월로 넘어가야 합니다.
document.getElementById("next-month-btn").addEventListener("click", () => {
  currentMonth += 1;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear += 1;
  }
  selectedDate = null;
  selectedItemsEl.innerHTML = "";
  renderCalendar();
});

// 화면을 열자마자 이번 달 달력을 그립니다.
renderCalendar();
