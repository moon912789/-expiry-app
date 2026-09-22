/*
  icons.js
  역할: 카테고리별로 쓰는 커스텀 SVG 아이콘을 한 곳에 모아둡니다.
        (이모지 대신 사용하는 선 스타일 아이콘입니다)

  모든 아이콘은 24x24 기준, 선 색상은 SVG 안에 직접 넣지 않고
  CSS의 "stroke: currentColor" 규칙(css/style.css의 .cat-icon)을 따르도록
  비워둡니다. 그래서 같은 아이콘이라도 쓰이는 자리(탭/목록/폼)의 글자색에
  맞춰 자동으로 색이 바뀝니다.

  이 파일은 js/main.js, js/calendar.js, js/form.js에서 카테고리 아이콘이
  필요한 자리(목록 카드, 카테고리 필터 탭, 추가/수정 화면의 카테고리 선택)에
  똑같이 가져다 씁니다. 한 군데만 고치면 모든 화면에 동일하게 반영됩니다.
*/

const CATEGORY_ICONS_SVG = {
  // 상온: 찬장/보관 상자 느낌 (상자 뚜껑 + 손잡이)
  상온: `<svg viewBox="0 0 24 24" class="cat-icon" aria-hidden="true" focusable="false">
    <rect x="3" y="7" width="18" height="4" rx="1"></rect>
    <path d="M4 11v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path>
    <line x1="10" y1="15" x2="14" y2="15"></line>
  </svg>`,

  // 냉장: 냉장고 느낌 (몸통 + 냉동칸 구분선 + 손잡이 두 개)
  냉장: `<svg viewBox="0 0 24 24" class="cat-icon" aria-hidden="true" focusable="false">
    <rect x="5" y="2" width="14" height="20" rx="2"></rect>
    <line x1="5" y1="9" x2="19" y2="9"></line>
    <line x1="8" y1="5" x2="8" y2="7"></line>
    <line x1="8" y1="12" x2="8" y2="14"></line>
  </svg>`,

  // 냉동: 눈송이(서리) 느낌
  냉동: `<svg viewBox="0 0 24 24" class="cat-icon" aria-hidden="true" focusable="false">
    <line x1="12" y1="4" x2="12" y2="20"></line>
    <line x1="4" y1="12" x2="20" y2="12"></line>
    <line x1="6.3" y1="6.3" x2="17.7" y2="17.7"></line>
    <line x1="17.7" y1="6.3" x2="6.3" y2="17.7"></line>
    <polyline points="10.3,5.7 12,4 13.7,5.7"></polyline>
    <polyline points="10.3,18.3 12,20 13.7,18.3"></polyline>
    <polyline points="18.3,10.3 20,12 18.3,13.7"></polyline>
    <polyline points="5.7,10.3 4,12 5.7,13.7"></polyline>
  </svg>`,

  // 화장품: 펌프형 병/튜브 느낌
  화장품: `<svg viewBox="0 0 24 24" class="cat-icon" aria-hidden="true" focusable="false">
    <rect x="6" y="10" width="12" height="11" rx="2.5"></rect>
    <rect x="9" y="6" width="6" height="4" rx="1"></rect>
    <path d="M12 6V4"></path>
    <path d="M12 4h3"></path>
  </svg>`,
};

// 카테고리 필터 탭의 "전체" 탭에 쓰는 아이콘 (2x2 격자 = 전체를 의미)
const ALL_CATEGORIES_ICON_SVG = `<svg viewBox="0 0 24 24" class="cat-icon" aria-hidden="true" focusable="false">
  <rect x="4" y="4" width="7" height="7" rx="1.5"></rect>
  <rect x="13" y="4" width="7" height="7" rx="1.5"></rect>
  <rect x="4" y="13" width="7" height="7" rx="1.5"></rect>
  <rect x="13" y="13" width="7" height="7" rx="1.5"></rect>
</svg>`;

// 메인 화면 헤더의 "캘린더 보기" 버튼에 쓰는 아이콘 (이모지 📅 대신 사용)
const CALENDAR_ICON_SVG = `<svg viewBox="0 0 24 24" class="cat-icon" aria-hidden="true" focusable="false">
  <rect x="3" y="5" width="18" height="16" rx="2"></rect>
  <line x1="3" y1="10" x2="21" y2="10"></line>
  <line x1="8" y1="3" x2="8" y2="7"></line>
  <line x1="16" y1="3" x2="16" y2="7"></line>
</svg>`;
