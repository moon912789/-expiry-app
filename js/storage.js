/*
  storage.js
  역할: 브라우저의 localStorage에 항목 데이터를 저장하고 꺼내오는 역할만 담당합니다.
        (화면을 그리거나 날짜를 계산하는 코드는 여기에 없습니다)

  데이터 형태 (항목 하나):
  {
    id: "1699999999999",   // 항목을 구분하는 고유 번호 (문자열)
    name: "우유",           // 품목명
    category: "냉장",       // 카테고리: 상온/냉장/냉동/화장품 중 하나
    purchaseDate: "2026-08-19", // 구매일 (YYYY-MM-DD)
    expiryDate: "2026-08-26",   // 유통기한 (YYYY-MM-DD)
    alertDays: 3,           // 유통기한 며칠 전부터 알림을 받을지
    memo: "냉장고 안쪽 칸"    // 메모 (선택 입력)
  }
*/

// localStorage에 저장할 때 사용할 키 이름
const STORAGE_KEY = "expiryItems";

// 카테고리 종류와 카테고리별 이모지 아이콘
const CATEGORIES = ["상온", "냉장", "냉동", "화장품"];
const CATEGORY_ICONS = {
  상온: "🥫",
  냉장: "🧊",
  냉동: "❄️",
  화장품: "🧴",
};

// 카테고리/알림일수가 없는 경우(예전에 저장된 데이터)에 사용할 기본값
const DEFAULT_CATEGORY = "상온";
const DEFAULT_ALERT_DAYS = 3;

// 예전 버전에서 저장된 항목(카테고리/알림일수/메모가 없음)도 문제없이 쓸 수 있도록
// 빠진 값에 기본값을 채워서 돌려줍니다.
function normalizeItem(item) {
  return {
    ...item,
    category: item.category || DEFAULT_CATEGORY,
    alertDays: item.alertDays || DEFAULT_ALERT_DAYS,
    memo: item.memo || "",
  };
}

// 저장된 모든 항목을 배열로 가져옵니다. 저장된 게 없으면 빈 배열을 반환합니다.
function getItems() {
  const json = localStorage.getItem(STORAGE_KEY);
  const items = json ? JSON.parse(json) : [];
  return items.map(normalizeItem);
}

// 항목 배열 전체를 localStorage에 저장합니다.
// localStorage에는 문자열만 저장할 수 있어서 JSON.stringify로 변환합니다.
function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// id로 항목 하나를 찾습니다. (수정 화면에서 기존 데이터를 불러올 때 사용)
function getItemById(id) {
  return getItems().find((item) => item.id === id);
}

// 새 항목을 추가합니다.
// item에는 id가 없는 상태로 들어오고, 여기서 고유 id를 만들어 붙여줍니다.
function addItem(item) {
  const items = getItems();
  item.id = Date.now().toString(); // 현재 시각(밀리초)을 id로 사용 -> 겹칠 일이 거의 없음
  items.push(item);
  saveItems(items);
}

// 기존 항목을 수정합니다. updatedItem.id와 같은 항목을 찾아서 통째로 교체합니다.
function updateItem(updatedItem) {
  const items = getItems();
  const index = items.findIndex((item) => item.id === updatedItem.id);
  if (index !== -1) {
    items[index] = updatedItem;
    saveItems(items);
  }
}

// id에 해당하는 항목을 삭제합니다.
function deleteItem(id) {
  const items = getItems().filter((item) => item.id !== id);
  saveItems(items);
}
