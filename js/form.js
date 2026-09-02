/*
  form.js
  역할: add.html(추가/수정 화면)의 동작을 담당합니다.
        - 주소창의 ?id=값 을 확인해서 추가 모드/수정 모드를 구분
        - +3일/+7일/+14일/+30일 버튼 동작
        - 저장 버튼, 삭제 버튼 동작
*/

// 주소창의 쿼리스트링(예: add.html?id=123)에서 id 값을 읽어옵니다.
// URLSearchParams는 브라우저가 기본 제공하는, 쿼리스트링을 쉽게 읽는 도구입니다.
const params = new URLSearchParams(window.location.search);
const editId = params.get("id"); // id가 없으면 null -> 추가 모드로 동작

// 화면의 입력 요소들을 미리 찾아둡니다.
const nameInput = document.getElementById("name");
const purchaseDateInput = document.getElementById("purchaseDate");
const expiryDateInput = document.getElementById("expiryDate");
const alertDaysInput = document.getElementById("alertDays");
const memoInput = document.getElementById("memo");
const deleteBtn = document.getElementById("delete-btn");
const formTitle = document.getElementById("form-title");
const form = document.getElementById("item-form");

// 구매일 입력칸의 기본값을 오늘 날짜로 채워둡니다. (요구사항: 구매일 기본값 오늘)
purchaseDateInput.value = getTodayString();

if (editId) {
  // ---- 수정 모드 ----
  // localStorage에서 해당 id의 기존 데이터를 찾아 입력칸을 채웁니다.
  const item = getItemById(editId);
  if (item) {
    formTitle.textContent = "항목 수정";
    nameInput.value = item.name;
    purchaseDateInput.value = item.purchaseDate;
    expiryDateInput.value = item.expiryDate;
    alertDaysInput.value = item.alertDays;
    memoInput.value = item.memo;

    // 카테고리 라디오 버튼 중 이 항목의 카테고리와 같은 것을 선택 상태로 만듭니다.
    const categoryRadio = document.querySelector(`input[name="category"][value="${item.category}"]`);
    if (categoryRadio) {
      categoryRadio.checked = true;
    }

    deleteBtn.style.display = "inline-block"; // 수정 모드에서만 삭제 버튼 표시
  }
}
// editId가 없으면 그냥 "항목 추가" 상태(HTML 기본값) 그대로 둡니다.

// +3일/+7일/+14일/+30일 버튼: 구매일 기준으로 유통기한을 자동 계산해서 채워줍니다.
document.querySelectorAll(".quick-btn:not(.alert-day-btn)").forEach((btn) => {
  btn.addEventListener("click", () => {
    const days = Number(btn.dataset.days); // data-days="7" -> 7
    const baseDate = purchaseDateInput.value || getTodayString();
    expiryDateInput.value = addDays(baseDate, days);
  });
});

/*
  알림일수 버튼(3일/7일/14일/30일)과 숫자 입력칸(#alertDays)을 서로 맞춰줍니다.
  - 버튼을 누르면 그 값을 입력칸에 채우고, 그 버튼을 "선택된 상태"로 표시합니다.
  - 입력칸에 직접 값을 입력하면(버튼에 없는 값 포함), 그 값과 같은 버튼이 있으면
    그 버튼만 선택된 상태로 표시하고, 없으면(예: 5일) 어떤 버튼도 선택 표시하지 않습니다.
  최종적으로 저장될 때는 항상 #alertDays의 값을 사용하므로, 버튼은 이 칸을 빠르게
  채워주는 역할만 합니다.
*/
const alertDayButtons = document.querySelectorAll(".alert-day-btn");

function syncAlertDayButtons() {
  alertDayButtons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.days) === Number(alertDaysInput.value));
  });
}

alertDayButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    alertDaysInput.value = btn.dataset.days;
    syncAlertDayButtons();
  });
});

alertDaysInput.addEventListener("input", syncAlertDayButtons);
syncAlertDayButtons(); // 페이지를 열었을 때(기본값 3일, 또는 수정 모드로 불러온 값) 바로 반영

// 폼 제출(저장 버튼 클릭) 처리
// 카테고리(required 라디오)와 알림일수(required, min/max 숫자)는
// 브라우저가 기본 제공하는 폼 검사(native validation)로 미리 걸러지기 때문에,
// 여기서는 카테고리/알림일수 값이 이미 올바르다고 보고 그대로 읽어옵니다.
form.addEventListener("submit", (event) => {
  event.preventDefault(); // 기본 동작(새로고침)을 막고 우리가 직접 저장 처리

  const name = nameInput.value.trim();
  const purchaseDate = purchaseDateInput.value;
  const expiryDate = expiryDateInput.value;

  if (!name || !purchaseDate || !expiryDate) {
    alert("모든 항목을 입력해주세요.");
    return;
  }

  const categoryRadio = document.querySelector('input[name="category"]:checked');
  const category = categoryRadio.value;
  const alertDays = Number(alertDaysInput.value);
  const memo = memoInput.value.trim();

  if (editId) {
    updateItem({ id: editId, name, category, purchaseDate, expiryDate, alertDays, memo });
  } else {
    addItem({ name, category, purchaseDate, expiryDate, alertDays, memo });
  }

  // 저장이 끝나면 목록 화면으로 돌아갑니다.
  window.location.href = "index.html";
});

// 삭제 버튼 클릭 처리 (수정 모드일 때만 화면에 보이는 버튼)
deleteBtn.addEventListener("click", () => {
  const confirmed = confirm("이 항목을 삭제하시겠습니까?");
  if (confirmed) {
    deleteItem(editId);
    window.location.href = "index.html";
  }
});
