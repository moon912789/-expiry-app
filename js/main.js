/*
  main.js
  역할: index.html(메인 화면)에서 항목 목록을 화면에 그리는 코드입니다.
        storage.js의 함수로 데이터를 가져오고, dateUtils.js의 함수로
        남은 일수/색상을 계산한 뒤, 화면에 <li> 태그로 하나씩 추가합니다.
*/

function renderList() {
  const items = getItems();

  // 유통기한이 임박한 순서(남은 일수가 적은 순서)로 정렬합니다.
  // 지난 항목(음수)은 더 작은 값이라 자연스럽게 위쪽에 표시됩니다.
  items.sort((a, b) => getRemainingDays(a.expiryDate) - getRemainingDays(b.expiryDate));

  const listEl = document.getElementById("item-list");
  listEl.innerHTML = ""; // 기존 목록을 비우고 새로 그립니다.

  // 등록된 항목이 없을 때 안내 문구를 보여줍니다.
  if (items.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty";
    emptyLi.textContent = "등록된 항목이 없습니다. 추가 버튼을 눌러 등록해보세요.";
    listEl.appendChild(emptyLi);
    return;
  }

  items.forEach((item) => {
    const remainingDays = getRemainingDays(item.expiryDate);
    const statusClass = getStatusClass(remainingDays);
    const ddayText = formatDday(remainingDays);

    // <li class="item green"><a href="add.html?id=...">이름 D-3</a></li> 형태로 만듭니다.
    const li = document.createElement("li");
    li.className = `item ${statusClass}`;

    const link = document.createElement("a");
    link.className = "item-link";
    link.href = `add.html?id=${encodeURIComponent(item.id)}`; // 클릭하면 수정 화면으로 이동

    const nameSpan = document.createElement("span");
    nameSpan.className = "item-name";
    nameSpan.textContent = item.name; // textContent 사용: 사용자가 입력한 이름을 안전하게 표시

    const ddaySpan = document.createElement("span");
    ddaySpan.className = "item-dday";
    ddaySpan.textContent = ddayText;

    link.appendChild(nameSpan);
    link.appendChild(ddaySpan);
    li.appendChild(link);
    listEl.appendChild(li);
  });
}

// 페이지가 열리자마자 목록을 그립니다.
renderList();
