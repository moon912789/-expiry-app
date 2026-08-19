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
    deleteBtn.style.display = "inline-block"; // 수정 모드에서만 삭제 버튼 표시
  }
}
// editId가 없으면 그냥 "항목 추가" 상태(HTML 기본값) 그대로 둡니다.

// +3일/+7일/+14일/+30일 버튼: 구매일 기준으로 유통기한을 자동 계산해서 채워줍니다.
document.querySelectorAll(".quick-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const days = Number(btn.dataset.days); // data-days="7" -> 7
    const baseDate = purchaseDateInput.value || getTodayString();
    expiryDateInput.value = addDays(baseDate, days);
  });
});

// 폼 제출(저장 버튼 클릭) 처리
form.addEventListener("submit", (event) => {
  event.preventDefault(); // 기본 동작(새로고침)을 막고 우리가 직접 저장 처리

  const name = nameInput.value.trim();
  const purchaseDate = purchaseDateInput.value;
  const expiryDate = expiryDateInput.value;

  if (!name || !purchaseDate || !expiryDate) {
    alert("모든 항목을 입력해주세요.");
    return;
  }

  if (editId) {
    updateItem({ id: editId, name, purchaseDate, expiryDate });
  } else {
    addItem({ name, purchaseDate, expiryDate });
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
