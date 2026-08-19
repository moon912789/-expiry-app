/*
  dateUtils.js
  역할: 날짜와 관련된 계산만 모아둔 파일입니다.
        (남은 일수 계산, D-day 문자열 만들기, 날짜 더하기 등)
*/

// Date 객체를 "YYYY-MM-DD" 형식 문자열로 바꿉니다.
// <input type="date">는 이 형식의 문자열을 사용해야 하기 때문에 필요합니다.
function formatDateForInput(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0"); // month는 0부터 시작해서 +1
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 오늘 날짜를 "YYYY-MM-DD" 문자열로 반환합니다.
function getTodayString() {
  return formatDateForInput(new Date());
}

// 유통기한(expiryDateStr)까지 남은 일수를 계산합니다.
// 오늘보다 미래면 양수, 오늘이면 0, 지났으면 음수가 나옵니다.
// 시/분/초는 무시하고 "날짜"만 비교하기 위해 0시 0분으로 맞춥니다.
function getRemainingDays(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDateStr);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry - today; // 밀리초 단위 차이
  const oneDayMs = 1000 * 60 * 60 * 24;
  return Math.round(diffMs / oneDayMs);
}

// 남은 일수를 "D-3", "D-day", "D+2" 같은 표시 문자열로 바꿉니다.
function formatDday(remainingDays) {
  if (remainingDays === 0) return "D-day";
  if (remainingDays > 0) return `D-${remainingDays}`;
  return `D+${Math.abs(remainingDays)}`;
}

// 남은 일수에 따라 어떤 색상을 쓸지 클래스 이름으로 반환합니다.
// 3일 이상 = green, 1~2일 = yellow, 오늘이거나 지남(0 이하) = red
function getStatusClass(remainingDays) {
  if (remainingDays >= 3) return "green";
  if (remainingDays >= 1) return "yellow";
  return "red";
}

// 기준 날짜(dateStr)에 days일을 더한 날짜를 "YYYY-MM-DD" 문자열로 반환합니다.
// 추가 화면의 +3일/+7일/+14일/+30일 버튼에서 사용합니다.
function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}
