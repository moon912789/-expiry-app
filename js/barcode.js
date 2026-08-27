/*
  barcode.js
  역할: add.html의 "바코드로 자동 입력" 버튼을 눌렀을 때
        1) 카메라를 켜서 바코드/QR코드를 인식하고
        2) 인식된 번호로 제품 정보를 찾아서(1순위: 식약처 푸드QR, 2순위: Open Food Facts)
        3) 품목명(nameInput), 가능하면 유통기한(expiryDateInput)까지 자동으로 채워줍니다.

  이 파일은 세 가지를 그대로 재사용합니다.
  - CDN으로 불러온 html5-qrcode 라이브러리의 Html5Qrcode 클래스 (카메라/인식 담당)
  - form.js에서 이미 만들어 둔 nameInput, expiryDateInput 변수 (같은 화면의 스크립트라 따로 안 만들고 그대로 씁니다)

  카메라가 없거나 권한을 거부한 경우, 두 조회가 모두 실패한 경우에도
  이 파일의 코드는 실패를 조용히 처리할 뿐, 나머지 폼(직접 입력)은 원래대로 문제없이 동작합니다.

  주의(보안): 아래 FOOD_QR_SERVICE_KEY는 공공데이터포털에서 발급받은 개인 인증키입니다.
  이 앱은 서버 없이 브라우저에서 직접 API를 호출하는 구조라, 배포된 사이트의 소스코드를 보면
  누구나 이 키를 볼 수 있습니다(GitHub 저장소가 공개 저장소라면 거기서도 보입니다).
  결제 정보 같은 민감한 키는 아니지만, 이 점은 참고해주세요.
*/

// 공공데이터포털에서 발급받은 서비스키 (이미 URL 인코딩된 형태입니다.
// 여기에 encodeURIComponent를 한 번 더 씌우면 이중 인코딩되어 인증 오류가 나므로 그대로 붙여씁니다)
const FOOD_QR_SERVICE_KEY =
  "RiZLaYF814L7u0rY7EYTJAJEh%2Bi14AvxitftTLtSLYik%2FbhZSFjbTeuMBw9MhO33GCv%2FownnYqrRKNI6o5Cevg%3D%3D";

const scanBtn = document.getElementById("barcode-scan-btn");
const scannerOverlay = document.getElementById("barcode-scanner-overlay");
const scannerCloseBtn = document.getElementById("scanner-close-btn");
const scannerStatus = document.getElementById("scanner-status");
const barcodeMessage = document.getElementById("barcode-message");
const expiryAutoNotice = document.getElementById("expiry-auto-notice");

// CDN 스크립트가 어떤 이유로든 로드되지 않았을 수 있어서, 있는지부터 확인합니다.
const html5QrCode = "Html5Qrcode" in window ? new Html5Qrcode("barcode-reader") : null;

let isScanning = false; // 지금 카메라가 켜져서 인식 중인지 여부
let hasLoggedScanAttempt = false; // "인식 시도 중" 로그를 스캔 세션당 한 번만 남기기 위한 플래그

// ---- 연속 인식 검증(오인식 방지) ----
// 화면이 흔들리거나 다른 텍스트/패턴이 순간적으로 바코드처럼 잘못 인식될 수 있어서,
// "같은 값이 2번 연속으로 인식됐을 때"만 진짜 결과로 확정합니다. 값이 중간에
// 바뀌면(예: 처음 값은 A, 두 번째는 B) 카운트를 1부터 다시 셉니다.
// (원래 3번이었는데, 정확도는 크게 떨어뜨리지 않으면서 스캔 속도를 조금 더 빠르게
//  하기 위해 2번으로 완화했습니다)
const REQUIRED_CONSECUTIVE_MATCHES = 2;
let lastDecodedValue = null;
let consecutiveMatchCount = 0;

// "바코드로 자동 입력" 버튼을 누르면 카메라 화면을 엽니다.
function openScanner() {
  console.log("[barcode] 바코드 스캔 버튼 클릭됨, 카메라 시작 시도");

  if (!html5QrCode) {
    // CDN에서 html5-qrcode 스크립트 자체가 안 불러와진 경우입니다. (예: CDN 접속 실패)
    // 이 경로에서는 원래 콘솔에 아무 로그도 안 남아서 "왜 아무 반응이 없지?"를
    // 알 수 없었던 문제가 있었습니다.
    console.error("[barcode] html5-qrcode 라이브러리가 로드되지 않았어요. (CDN 스크립트 로드 실패 가능성)");
    barcodeMessage.textContent = "이 브라우저에서는 바코드 스캔을 쓸 수 없어요. 직접 입력해주세요.";
    return;
  }

  barcodeMessage.textContent = "";
  expiryAutoNotice.textContent = "";
  scannerStatus.textContent = "카메라를 켜는 중...";
  scannerOverlay.hidden = false;

  // 새로 스캔을 시작할 때마다 연속 인식 카운트를 초기화합니다.
  lastDecodedValue = null;
  consecutiveMatchCount = 0;

  const config = {
    // 초당 인식 시도 횟수. 너무 높으면 흔들림(모션 블러)에 더 취약해질 수 있어서
    // 15 정도로 적당한 값을 유지합니다.
    fps: 15,
    // 인식 영역을 고정 크기(250x250)로 두면 카메라 화면보다 커서 인식이 안 되는
    // 경우가 있어서, 실제 카메라 화면 크기에 비례해서 계산하도록 했습니다.
    // 일반 바코드(EAN/UPC 등)는 가로로 긴 모양이라 세로 폭을 좁혀서 직사각형으로
    // 잡습니다. 너비 비율 0.7/최대 280px는 실제로는 바코드가 영역 안에 잘 안
    // 들어와서 계속 실패하는 경우가 있었던 것으로 확인되어, 주변 텍스트가 같이
    // 잡히는 것을 어느 정도 막으면서도 바코드가 충분히 들어올 수 있도록 다시
    // 넓혔습니다(0.85배, 최대 300px).
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      const boxWidth = Math.min(Math.floor(minEdge * 0.85), 300);
      const boxHeight = Math.floor(boxWidth * 0.4);
      return { width: boxWidth, height: boxHeight };
    },
    // 인식할 형식을 명시적으로 지정합니다. 지정하지 않으면 라이브러리가 지원하는
    // 모든 형식을 다 시도하느라 한 프레임을 처리하는 데 시간이 더 걸릴 수 있어서,
    // 실제로 쓸 QR코드 + 일반 상품 바코드 형식만 골라서 인식 속도와 정확도를 높였습니다.
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128,
    ],
    // videoConstraints를 지정하면 다른 카메라 설정(첫 번째 인자로 넘긴 facingMode 등)보다
    // 이 값이 우선 적용됩니다. 화면이 뿌옇게 나오는 문제를 줄이기 위해 해상도를
    // 명시적으로 높게 요청하고, 지원하는 기기에서는 자동 초점이 계속 맞춰지도록
    // focusMode도 함께 요청합니다. (요청한 해상도/초점 모드를 기기가 지원하지 않으면
    // 브라우저가 알아서 무시하고 기본값으로 동작하므로, 안 되는 기기에서도 에러는 나지 않습니다)
    videoConstraints: {
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 },
      focusMode: "continuous",
    },
  };

  html5QrCode
    // facingMode: "environment" -> 스마트폰의 후면(바깥쪽) 카메라를 우선 사용합니다.
    // (위 config.videoConstraints가 있으면 이 값보다 그쪽이 우선 적용되지만,
    //  videoConstraints를 지원하지 않는 옛날 버전 라이브러리를 위한 대비용으로 남겨둡니다)
    .start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
    .then(() => {
      console.log("[barcode] 카메라 활성화 성공, 스캔 대기 중");
      isScanning = true;
      scannerStatus.textContent = "바코드를 카메라에 비춰주세요";
      hasLoggedScanAttempt = false; // 이번 스캔 세션에서 "인식 시도 중" 로그를 다시 한 번 남길 수 있게 초기화
      applyContinuousFocus();
    })
    .catch((error) => {
      // 카메라 권한을 거부했거나, PC처럼 카메라가 없는 환경인 경우입니다.
      // 예전에는 이 상황에서 화면에는 안내 문구가 떴지만 콘솔에는 아무 로그도 안 남아서,
      // "콘솔에 로그가 아예 안 보인다"는 문제의 실제 원인이 대부분 여기였습니다.
      console.error("[barcode] 카메라 시작 실패:", error);
      closeScanner();
      barcodeMessage.textContent = "카메라를 사용할 수 없어요. 직접 입력해주세요.";
    });
}

// 카메라가 켜진 뒤(start() 성공 이후), 이미 실행 중인 영상 트랙에 "연속 자동초점"을
// 한 번 더 명시적으로 요청합니다. config.videoConstraints.focusMode로도 이미 요청은
// 했지만, 일부 기기/브라우저는 카메라를 처음 열 때 넘긴 constraints의 focusMode는
// 무시하면서도 실행 중에 applyConstraints()로 다시 요청하면 받아들이는 경우가 있어
// 이중으로 시도합니다. advanced 배열 안에 넣으면, 그 항목을 지원하지 않는 기기는
// (에러 없이) 그냥 무시하고 넘어가므로 더 안전합니다. 그래도 혹시 이 메서드 자체가
// 없거나 Promise가 reject되는 경우까지 대비해 try/catch로 감쌉니다.
function applyContinuousFocus() {
  try {
    html5QrCode
      .applyVideoConstraints({ advanced: [{ focusMode: "continuous" }] })
      .then(() => {
        console.log("[barcode] 연속 자동초점(advanced constraint) 적용 시도 완료");
      })
      .catch((error) => {
        // 기기가 이 옵션을 지원하지 않는 경우입니다. 스캔 자체에는 지장이 없으므로
        // 조용히 로그만 남기고 넘어갑니다.
        console.warn("[barcode] 연속 자동초점 적용 실패(이 기기는 지원 안 할 수 있음):", error);
      });
  } catch (error) {
    console.warn("[barcode] 연속 자동초점 적용 시도 자체가 실패(무시하고 진행):", error);
  }
}

// 카메라를 끄고 스캐너 화면을 닫습니다. (✕ 버튼을 눌렀을 때 사용)
function closeScanner() {
  scannerOverlay.hidden = true;
  stopCamera();
}

// 카메라만 멈춥니다. html5-qrcode는 "스캔 성공 콜백 안에서 곧바로 stop()을 호출하면
// 내부 상태 전환 중이라 에러를 던지는" 경우가 있어서, try/catch로 반드시 감싸야 합니다.
// (이 에러를 못 잡으면 뒤에 있는 lookupProduct() 호출까지 통째로 멈춰버립니다 -
//  실패 안내 문구가 안 뜨던 원인이 바로 이것이었습니다)
function stopCamera() {
  if (!isScanning) return;
  isScanning = false;

  try {
    html5QrCode.stop().catch((error) => {
      console.error("[barcode] 카메라 정지 중 오류(무시하고 진행):", error);
    });
  } catch (error) {
    console.error("[barcode] 카메라 정지 호출 자체가 실패(무시하고 진행):", error);
  }
}

// 한 프레임에서 바코드/QR코드를 못 찾았을 때마다 계속(초당 여러 번) 호출되는
// 콜백이라, 실제 "에러"가 아니라 "아직 못 찾음"에 가깝습니다. 매 프레임마다 로그를
// 남기면 콘솔이 순식간에 도배되어 정작 필요한 로그를 찾기 어려워지므로, 카메라가
// 켜진 뒤 한 번만("인식을 계속 시도하고 있다"는 확인용으로) 로그를 남깁니다.
function onScanFailure() {
  if (hasLoggedScanAttempt) return;
  hasLoggedScanAttempt = true;
  console.log("[barcode] 카메라가 바코드 인식을 계속 시도하고 있어요. (아직 인식 안 됨)");
}

// 바코드/QR코드가 "한 프레임에서" 인식됐을 때 호출됩니다. decodedText가 인식된 번호(문자열)입니다.
// 흔들림이나 주변 텍스트 때문에 순간적으로 엉뚱한 값이 인식될 수 있어서, 여기서는
// 바로 확정하지 않고 같은 값이 REQUIRED_CONSECUTIVE_MATCHES(2)번 연속으로 나와야만
// 진짜 결과로 받아들입니다.
function onScanSuccess(decodedText) {
  if (decodedText === lastDecodedValue) {
    consecutiveMatchCount += 1;
  } else {
    // 이전과 다른 값이 나왔다는 건 둘 중 하나(또는 둘 다)가 오인식이었다는 뜻이라,
    // 카운트를 이 값 기준으로 1부터 다시 셉니다.
    lastDecodedValue = decodedText;
    consecutiveMatchCount = 1;
  }

  console.log(
    `[barcode] 스캔된 값: ${decodedText} (연속 ${consecutiveMatchCount}/${REQUIRED_CONSECUTIVE_MATCHES}회 일치)`
  );
  scannerStatus.textContent = `인식 확인 중... (${consecutiveMatchCount}/${REQUIRED_CONSECUTIVE_MATCHES})`;

  if (consecutiveMatchCount < REQUIRED_CONSECUTIVE_MATCHES) {
    return; // 아직 확정할 만큼 충분히 반복되지 않았으므로 스캔을 계속 이어갑니다.
  }

  console.log("[barcode] 연속 인식 확인 완료, 최종 값으로 확정:", decodedText);

  // 화면을 먼저 닫고(사용자 경험), 카메라 정지는 실패해도 무시되도록 분리해서 처리합니다.
  scannerOverlay.hidden = true;
  stopCamera();

  // 카메라 정지가 어떻게 되든 상관없이 조회는 항상 진행되어야 합니다.
  lookupProduct(decodedText);
}

// "20261231" 같은 8자리 숫자(YYYYMMDD)면 "2026-12-31"로 바꿔서 돌려주고,
// 그 형태가 아니면 null을 돌려줍니다. (날짜 입력칸에는 이 형식만 넣을 수 있습니다)
function parseYmdDate(text) {
  if (!text || !/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

// 1순위: 식약처 푸드QR 정보서비스(getFoodQrIndctInfo01)는 호출 오류가 잦아서
// getFoodQrProdList01(푸드QR 목록정보)로 대신 조회합니다.
// 제품명(PRDT_NM)과 유효종료일자(VLD_END_YMD)를 갖고 있으면 그 값을 돌려주고,
// 못 찾았거나 요청 자체가 실패하면 null을 돌려줍니다. (에러를 던지지 않고 null로 알려줌)
//
// 주의: VLD_END_YMD는 이름과 달리 "식품의 실제 소비기한"이 아니라
// "이 QR 데이터(라벨 정보)가 유효한 기간"에 가깝습니다. 실제로 조회해보면 이미 지난 날짜이거나
// "99991231"(무기한) 같은 값이 도시락, 샌드위치 같은 신선식품에도 붙어있어서, 실제 소비기한과는
// 다른 값일 가능성이 높습니다. 그래서 자동으로 채우되 반드시 사용자에게 경고 문구를 보여줍니다.
async function lookupFoodQr(barcode) {
  console.log("[barcode] 푸드QR 호출 시작, 바코드:", barcode);

  const params = new URLSearchParams({ type: "json", numOfRows: "1", pageNo: "1", brcd_no: barcode });
  // serviceKey는 이미 인코딩되어 있어서 URLSearchParams로 만들지 않고 문자열로 직접 붙입니다.
  // (여기에 넣지 않고 URLSearchParams({ serviceKey: ... })로 만들면 %2B 같은 문자가 %252B로
  //  다시 인코딩되어 인증 오류가 납니다 - 아래 로그로 실제 전송되는 URL을 눈으로 확인할 수 있습니다)
  const url = `https://apis.data.go.kr/1471000/FoodQrInfoService01/getFoodQrProdList01?serviceKey=${FOOD_QR_SERVICE_KEY}&${params.toString()}`;
  console.log("[barcode] 푸드QR 요청 URL:", url); // 디버깅용: serviceKey가 이중 인코딩됐는지(%25가 있는지) 여기서 확인 가능

  // fetch 자체를 try/catch로 감쌉니다. 네트워크가 끊겼거나(오프라인), CORS 정책에
  // 막혔거나 하면 fetch()가 응답 대신 예외를 던지는데, 이 경우까지 놓치지 않고
  // 반드시 콘솔에 에러를 남기기 위해서입니다. (HTTP 200/404 같은 "정상 응답"과는
  // 다른 종류의 실패라서 분리해서 로그를 남깁니다)
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error("[barcode] 푸드QR 호출 자체가 실패했어요(네트워크/CORS 등):", error);
    return null;
  }

  if (!response.ok) {
    console.warn("[barcode] 푸드QR API 응답 실패(HTTP 상태 오류):", response.status);
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error("[barcode] 푸드QR 응답을 JSON으로 해석하는 데 실패했어요:", error);
    return null;
  }
  console.log("[barcode] 푸드QR API 응답:", data); // 디버깅용: resultCode/resultMsg로 인증키 오류 여부 확인 가능

  if (!data.header || data.header.resultCode !== "00") {
    console.warn(
      "[barcode] 푸드QR API 에러 응답 - resultCode:",
      data.header && data.header.resultCode,
      "/ resultMsg:",
      data.header && data.header.resultMsg
    );
    return null;
  }

  // 실제 응답에서는 items가 배열로 바로 오지만(items: [...]), 문서상 모델은 items.item 형태라
  // 두 경우를 모두 처리합니다.
  const rawItems = data.body && data.body.items;
  const items = Array.isArray(rawItems) ? rawItems : rawItems && rawItems.item;
  if (!items) return null; // 등록된 제품이 없음

  const item = Array.isArray(items) ? items[0] : items;
  if (!item || !item.PRDT_NM) return null;

  return { name: item.PRDT_NM, validEndYmd: item.VLD_END_YMD || "" };
}

// 2순위: Open Food Facts API로 조회합니다. 제품명만 제공하고 유통기한 정보는 없습니다.
async function lookupOpenFoodFacts(barcode) {
  console.log("[barcode] Open Food Facts 호출 시작, 바코드:", barcode);

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  console.log("[barcode] Open Food Facts 요청 URL:", url);

  // 푸드QR과 마찬가지로, fetch 자체의 실패(네트워크/CORS 등)를 놓치지 않도록 별도로 감쌉니다.
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error("[barcode] Open Food Facts 호출 자체가 실패했어요(네트워크/CORS 등):", error);
    return null;
  }

  if (!response.ok) {
    console.warn("[barcode] Open Food Facts 응답 실패(HTTP 상태 오류):", response.status);
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error("[barcode] Open Food Facts 응답을 JSON으로 해석하는 데 실패했어요:", error);
    return null;
  }
  console.log("[barcode] Open Food Facts 응답:", data); // 디버깅용

  // status === 1 이면 제품을 찾았다는 뜻이고, status === 0 이면 DB에 없다는 뜻입니다.
  // (둘 다 정상 응답이라 catch로는 안 걸러지고 여기서 직접 구분해야 합니다)
  const productName = data.product && (data.product.product_name_ko || data.product.product_name);
  if (data.status !== 1 || !productName) return null;

  return { name: productName };
}

// 바코드로 제품 정보를 조회합니다. 1순위(푸드QR) -> 2순위(Open Food Facts) 순서로 시도하고,
// 팝업 없이 안내 문구만 보여줍니다. 둘 다 실패하면 사용자가 직접 입력하도록 그대로 둡니다.
async function lookupProduct(barcode) {
  barcodeMessage.textContent = "제품 정보를 찾는 중...";
  expiryAutoNotice.textContent = ""; // 이전 스캔에서 남은 주의 문구를 지웁니다.

  try {
    const foodQrResult = await lookupFoodQr(barcode);
    if (foodQrResult) {
      nameInput.value = foodQrResult.name;

      const parsedDate = parseYmdDate(foodQrResult.validEndYmd);
      if (parsedDate) {
        // 유통기한 칸을 채우되, 사용자가 보고 직접 고칠 수 있도록 평범한 입력값으로 넣습니다.
        expiryDateInput.value = parsedDate;
        barcodeMessage.textContent = "푸드QR에서 제품명과 참고 날짜를 불러왔어요.";
        // VLD_END_YMD는 실제로는 "QR 데이터 유효기간"에 가까워서 소비기한과 다를 수 있습니다.
        // 그래서 채워진 날짜 바로 아래에 반드시 이 주의 문구를 같이 보여줍니다.
        expiryAutoNotice.textContent =
          "⚠️ 자동 입력된 날짜예요. 제품 포장에 적힌 실제 유통기한과 다를 수 있으니 확인 후 저장해주세요.";
      } else {
        barcodeMessage.textContent = "푸드QR에서 제품명을 불러왔어요. 필요하면 수정해도 돼요.";
      }
      return;
    }
  } catch (error) {
    console.error("[barcode] 푸드QR 조회 중 오류:", error);
    // 여기서 안내 문구를 띄우지 않고 조용히 2순위로 넘어갑니다.
  }

  try {
    const offResult = await lookupOpenFoodFacts(barcode);
    if (offResult) {
      nameInput.value = offResult.name;
      barcodeMessage.textContent = "제품 정보를 불러왔어요. 필요하면 이름을 수정해도 돼요.";
      return;
    }
  } catch (error) {
    console.error("[barcode] Open Food Facts 조회 중 오류:", error);
  }

  // 두 조회가 모두 실패한 경우
  barcodeMessage.textContent = "제품을 찾지 못했어요. 직접 입력해주세요.";
}

scanBtn.addEventListener("click", openScanner);
scannerCloseBtn.addEventListener("click", closeScanner);
