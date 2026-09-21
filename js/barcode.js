/*
  barcode.js
  역할: add.html의 "바코드로 자동 입력" 버튼을 눌렀을 때
        1) 카메라를 켜서 바코드/QR코드를 인식하고
        2) 인식된 번호로 제품 정보를 찾아서(1순위: 식약처 푸드QR, 2순위: Open Food Facts)
        3) 품목명(nameInput), 가능하면 유통기한(expiryDateInput), 알레르기 정보까지
           자동으로 채워줍니다.

  이름/유통기한과 알레르기 정보는 서로 다른 API를 따로 조회합니다.
  - 이름/유통기한: 1순위 lookupFoodQr(푸드QR 목록정보) -> 2순위 lookupOpenFoodFacts
  - 알레르기 정보: 1순위 lookupFoodQrAllergy(푸드QR 알레르기정보) -> 2순위 lookupOpenFoodFacts(allergens)
  그래서 이름을 1순위(푸드QR)로 이미 찾았더라도, 알레르기 정보가 1순위에 없으면
  Open Food Facts를 알레르기 정보만을 위해 추가로 한 번 더 호출할 수 있습니다.

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
// allergyInfoInput, allergyInfoDisplay는 js/form.js에서 이미 선언해 둔 전역 변수를
// 그대로 재사용합니다(nameInput, expiryDateInput 등과 같은 방식). add.html에서
// form.js를 barcode.js보다 먼저 불러오기 때문에 이 시점엔 이미 선언되어 있습니다.

/*
  아래 매핑 테이블은 2순위(Open Food Facts)에서만 씁니다. Open Food Facts는
  알레르기 성분을 "en:milk", "en:eggs"처럼 영어 태그로 주기 때문입니다.
  (1순위인 푸드QR 알레르기정보는 ALG_CSG_MTR_NM 값이 이미 한국어라 번역이 필요 없습니다)
  한국 식품표시 기준상 주요 알레르기 유발 성분(22종) 위주로 자연스러운 한국어
  이름을 매핑해둡니다. 매핑에 없는 태그가 오면(흔치 않은 성분) 원문을 최대한
  읽기 쉬운 형태로만 다듬어서(en: 접두어 제거, 하이픈을 공백으로) 보여줍니다.
*/
const ALLERGEN_KO_MAP = {
  milk: "우유",
  eggs: "계란",
  peanuts: "땅콩",
  soybeans: "대두",
  wheat: "밀",
  buckwheat: "메밀",
  gluten: "글루텐(밀 등 곡류)",
  nuts: "견과류",
  "tree-nuts": "견과류",
  "pine-nuts": "잣",
  walnuts: "호두",
  fish: "생선",
  crustaceans: "갑각류",
  shrimps: "새우",
  crabs: "게",
  molluscs: "연체동물(조개류)",
  squid: "오징어",
  celery: "셀러리",
  mustard: "겨자",
  "sesame-seeds": "참깨",
  "sulphur-dioxide-and-sulphites": "아황산류",
  lupin: "루핀",
  pork: "돼지고기",
  beef: "소고기",
  chicken: "닭고기",
  tomatoes: "토마토",
  peaches: "복숭아",
};

// "en:milk" -> "milk" -> "우유" 처럼 태그 하나를 한국어로 바꿉니다.
// 매핑에 없으면 접두어만 떼고 하이픈을 공백으로 바꿔서 최대한 읽기 쉽게 돌려줍니다.
function translateAllergenTag(tag) {
  const key = tag.replace(/^en:/i, "").trim().toLowerCase();
  if (!key) return null;
  return ALLERGEN_KO_MAP[key] || key.replace(/-/g, " ");
}

// Open Food Facts 응답에서 온 알레르기 태그들(배열 또는 콤마로 구분된 문자열)을
// 한국어 이름들을 콤마로 이어붙인 문자열로 바꿉니다. (예: "우유, 계란")
// 태그가 없거나 전부 빈 값이면 빈 문자열을 돌려줍니다.
function translateAllergens(tagsOrString) {
  const tags = Array.isArray(tagsOrString) ? tagsOrString : String(tagsOrString || "").split(",");

  const names = tags
    .map((tag) => (tag ? translateAllergenTag(tag) : null))
    .filter(Boolean)
    .filter((name, index, all) => all.indexOf(name) === index); // 중복 제거

  return names.join(", ");
}

// 알레르기 정보 표시 영역을 비웁니다. (새 스캔을 시작할 때, 이전 스캔의 정보가
// 남아있지 않도록 초기화하는 용도로 씁니다)
function clearAllergyInfoDisplay() {
  allergyInfoInput.value = "";
  allergyInfoDisplay.textContent = "";
  allergyInfoDisplay.hidden = true;
}

// 알레르기 정보를 화면에 보여주고, 저장용 hidden input에도 값을 채웁니다.
function showAllergyInfo(allergyInfoText) {
  allergyInfoInput.value = allergyInfoText;
  allergyInfoDisplay.textContent = `⚠️ 알레르기 정보: ${allergyInfoText}`;
  allergyInfoDisplay.hidden = false;
}

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
    // 이전(1280x720)보다 더 높게 요청하고, 지원하는 기기에서는 자동 초점이 계속
    // 맞춰지도록 focusMode도 함께 요청합니다. 다만 "ideal"은 강제가 아니라
    // 희망사항이라 기기가 이 해상도를 지원하지 않으면 브라우저가 알아서 가능한
    // 값으로 낮춰서 동작하므로, 저사양 기기에서도 에러 없이 그대로 동작합니다.
    // (실제로 어떤 해상도가 적용됐는지는 카메라 시작 후 logActualCameraSettings()에서
    // 콘솔에 로그로 남깁니다)
    videoConstraints: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
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
      logActualCameraSettings();
      applyZoomIfSupported();
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

// 카메라가 실제로 어떤 해상도로 스트림을 보내주고 있는지 콘솔에 로그로 남깁니다.
// videoConstraints의 width/height는 "ideal"(희망사항)이라 기기가 그 값을 그대로
// 안 줄 수도 있어서, getRunningTrackSettings()로 브라우저가 실제로 적용한 값을
// 확인해야 확실합니다. (개발자도구/eruda 콘솔에서 이 로그로 실제 해상도를 볼 수 있습니다)
function logActualCameraSettings() {
  try {
    const settings = html5QrCode.getRunningTrackSettings();
    console.log(
      `[barcode] 실제 적용된 카메라 해상도: ${settings.width}x${settings.height} (요청한 값: 1920x1080)`
    );
  } catch (error) {
    console.warn("[barcode] 실제 카메라 해상도를 확인하지 못했어요:", error);
  }
}

// 기기가 카메라 확대(zoom)를 지원하면 살짝 확대해서 바코드가 화면에 더 크게(=더
// 선명하게 보이는 효과) 잡히도록 합니다. 지원하지 않는 기기(대부분의 구형 기기,
// 일부 iOS 브라우저)에서는 isSupported()가 false를 반환해서 아무 것도 하지 않고
// 조용히 넘어가며, 확인 과정 자체가 실패하는 경우까지 대비해 try/catch로 감쌉니다.
function applyZoomIfSupported() {
  try {
    const zoomCapability = html5QrCode.getRunningTrackCameraCapabilities().zoomFeature();
    if (!zoomCapability.isSupported()) {
      console.log("[barcode] 이 기기/브라우저는 카메라 확대(zoom)를 지원하지 않아요.");
      return;
    }

    const min = zoomCapability.min();
    const max = zoomCapability.max();
    // 범위의 25% 지점 정도로만 살짝 확대합니다. 너무 확대하면 오히려 흔들림에
    // 민감해지고 초점 맞추기가 더 어려워질 수 있어서 과하지 않게 잡았습니다.
    const target = Math.min(max, Math.max(min, min + (max - min) * 0.25));

    zoomCapability
      .apply(target)
      .then(() => {
        console.log(`[barcode] 카메라 확대(zoom) 적용됨: ${target} (지원 범위 ${min}~${max})`);
      })
      .catch((error) => {
        console.warn("[barcode] 카메라 확대(zoom) 적용 실패(무시하고 진행):", error);
      });
  } catch (error) {
    console.warn("[barcode] 카메라 확대(zoom) 지원 여부 확인 실패(무시하고 진행):", error);
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

// "20261231"(YYYYMMDD) 또는 "202512110000"(YYYYMMDDHHmm, 최근 API가 주는 형식)처럼
// 앞 8자리가 날짜인 숫자 문자열이면 "2026-12-31"로 바꿔서 돌려주고, 그 형태가
// 아니면 null을 돌려줍니다. (날짜 입력칸에는 "YYYY-MM-DD" 형식만 넣을 수 있습니다)
// 앞 8자리만 보고 뒤에 시:분 같은 부분은 무시하기 때문에, 나중에 API가 형식을
// 또 바꾸더라도(날짜 뒤에 다른 값이 더 붙는 정도라면) 계속 잘 동작합니다.
function parseYmdDate(text) {
  if (!text) return null;
  const match = String(text).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

// 1순위: 식약처 푸드QR 정보서비스(getFoodQrIndctInfo01)는 호출 오류가 잦아서
// getFoodQrProdList01(푸드QR 목록정보)로 대신 조회합니다.
// 제품명(PRDCT_NM)과 유효종료일자(VLD_END_YMD)를 갖고 있으면 그 값을 돌려주고,
// 못 찾았거나 요청 자체가 실패하면 null을 돌려줍니다. (에러를 던지지 않고 null로 알려줌)
//
// 주의: 이 API 응답 필드명은 문서(Swagger)와 실제 값이 다를 수 있습니다(정부 쪽
// 데이터 스키마가 시간이 지나며 바뀐 것으로 보입니다). 실제로 확인해보니 제품명은
// "PRDT_NM"이 아니라 "PRDCT_NM" 필드로 오고 있어서 그 이름으로 읽습니다. 콘솔의
// "[barcode] 푸드QR API 응답:" 로그로 실제 필드명이 또 바뀌었는지 언제든 확인할 수 있습니다.
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
  if (!item || !item.PRDCT_NM) return null;

  return { name: item.PRDCT_NM, validEndYmd: item.VLD_END_YMD || "" };
}

// 1순위(알레르기 정보): 식약처 푸드QR 알레르기정보(getFoodQrAllrgyInfo02)로 조회합니다.
//
// 주의: 다른 푸드QR API들(getFoodQrProdList01 등)과 오퍼레이션 버전이 다릅니다.
// 이 오퍼레이션만 "01"이 아니라 "02"이고, 호스트도 FoodQrInfoService01이 아니라
// FoodQrInfoService02입니다. (공공데이터포털의 15143798 데이터 Swagger 문서에서
// 실제 오퍼레이션 이름과 host가 getFoodQrAllrgyInfo02 / FoodQrInfoService02로
// 정의되어 있는 것을 확인했습니다) 서비스키는 다른 푸드QR API들과 동일하게 재사용합니다.
//
// 응답은 제품 하나에 알레르기 성분이 여러 개면 같은 바코드로 item이 여러 줄(row)
// 나뉘어 옵니다. 그래서 numOfRows를 넉넉히(20) 요청해서 전부 모아 콤마로 이어붙입니다.
// ALG_CSG_MTR_NM(알레르기유발물질) 값이 이미 한국어라 번역 없이 그대로 씁니다.
//
// 성분이 하나도 등록되어 있지 않거나 조회 자체가 실패하면 빈 문자열을 돌려주고,
// (다른 조회 함수들처럼) 에러를 던지지 않습니다 - 호출한 쪽에서 그대로 2순위로 넘어갑니다.
async function lookupFoodQrAllergy(barcode) {
  console.log("[barcode] 푸드QR 알레르기정보 호출 시작, 바코드:", barcode);

  const params = new URLSearchParams({ type: "json", numOfRows: "20", pageNo: "1", brcd_no: barcode });
  const url = `https://apis.data.go.kr/1471000/FoodQrInfoService02/getFoodQrAllrgyInfo02?serviceKey=${FOOD_QR_SERVICE_KEY}&${params.toString()}`;
  console.log("[barcode] 푸드QR 알레르기정보 요청 URL:", url);

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error("[barcode] 푸드QR 알레르기정보 호출 자체가 실패했어요(네트워크/CORS 등):", error);
    return "";
  }

  if (!response.ok) {
    console.warn("[barcode] 푸드QR 알레르기정보 응답 실패(HTTP 상태 오류):", response.status);
    return "";
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error("[barcode] 푸드QR 알레르기정보 응답을 JSON으로 해석하는 데 실패했어요:", error);
    return "";
  }
  console.log("[barcode] 푸드QR 알레르기정보 API 응답:", data); // 디버깅용: resultCode와 알레르기 성분 목록을 바로 확인 가능

  if (!data.header || data.header.resultCode !== "00") {
    console.warn(
      "[barcode] 푸드QR 알레르기정보 API 에러 응답 - resultCode:",
      data.header && data.header.resultCode,
      "/ resultMsg:",
      data.header && data.header.resultMsg
    );
    return "";
  }

  // 다른 푸드QR API들과 마찬가지로 items가 배열로 바로 오는 경우와 items.item(단일
  // 객체 또는 배열)으로 오는 경우를 모두 처리합니다.
  const rawItems = data.body && data.body.items;
  let items = [];
  if (Array.isArray(rawItems)) {
    items = rawItems;
  } else if (rawItems && rawItems.item) {
    items = Array.isArray(rawItems.item) ? rawItems.item : [rawItems.item];
  }
  if (items.length === 0) return ""; // 이 바코드로 등록된 알레르기 성분이 없음

  const names = items
    .map((item) => item && item.ALG_CSG_MTR_NM)
    .filter(Boolean)
    .filter((name, index, all) => all.indexOf(name) === index); // 중복 제거

  return names.join(", ");
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

  // 알레르기 정보: allergens_tags(배열, 예: ["en:milk","en:eggs"])가 더 정형화된
  // 형식이라 우선 사용하고, 없으면 allergens(콤마로 구분된 문자열)를 대신 씁니다.
  // 둘 다 없거나 조회에 실패해도 이 함수 자체가 실패하지 않고 그냥 빈 문자열을 돌려줍니다.
  const allergensTags = data.product && data.product.allergens_tags;
  const allergensRaw = data.product && data.product.allergens;
  let allergyInfo = "";
  if (Array.isArray(allergensTags) && allergensTags.length > 0) {
    allergyInfo = translateAllergens(allergensTags);
  } else if (allergensRaw) {
    allergyInfo = translateAllergens(allergensRaw);
  }

  return { name: productName, allergyInfo };
}

// 바코드로 제품 정보를 조회합니다. 이름/유통기한과 알레르기 정보를 각각 따로
// 1순위 -> 2순위 순서로 시도하고, 팝업 없이 안내 문구만 보여줍니다.
// 둘 다 실패하면 사용자가 직접 입력하도록 그대로 둡니다.
async function lookupProduct(barcode) {
  barcodeMessage.textContent = "제품 정보를 찾는 중...";
  expiryAutoNotice.textContent = ""; // 이전 스캔에서 남은 주의 문구를 지웁니다.
  clearAllergyInfoDisplay(); // 이전 스캔에서 남은 알레르기 정보도 지웁니다.

  // ---- 1) 제품명 + 유통기한 참고값: 1순위 푸드QR 목록정보, 실패 시 2순위 Open Food Facts ----
  let productName = null;
  let productMessage = "";
  // Open Food Facts 응답을 한 번만 요청해서 재사용합니다. undefined면 "아직 시도 안 함",
  // null이면 "시도했지만 실패/없음"이라는 뜻입니다. (아래 알레르기 조회 단계에서 다시 씁니다)
  let offResult;

  try {
    const foodQrResult = await lookupFoodQr(barcode);
    if (foodQrResult) {
      productName = foodQrResult.name;

      const parsedDate = parseYmdDate(foodQrResult.validEndYmd);
      if (parsedDate) {
        // 유통기한 칸을 채우되, 사용자가 보고 직접 고칠 수 있도록 평범한 입력값으로 넣습니다.
        expiryDateInput.value = parsedDate;
        productMessage = "푸드QR에서 제품명과 참고 날짜를 불러왔어요.";
        // VLD_END_YMD는 실제로는 "QR 데이터 유효기간"에 가까워서 소비기한과 다를 수 있습니다.
        // 그래서 채워진 날짜 바로 아래에 반드시 이 주의 문구를 같이 보여줍니다.
        expiryAutoNotice.textContent =
          "⚠️ 자동 입력된 날짜예요. 제품 포장에 적힌 실제 유통기한과 다를 수 있으니 확인 후 저장해주세요.";
      } else {
        productMessage = "푸드QR에서 제품명을 불러왔어요. 필요하면 수정해도 돼요.";
      }
    }
  } catch (error) {
    console.error("[barcode] 푸드QR 조회 중 오류:", error);
    // 여기서 안내 문구를 띄우지 않고 조용히 2순위로 넘어갑니다.
  }

  if (!productName) {
    try {
      offResult = await lookupOpenFoodFacts(barcode);
    } catch (error) {
      console.error("[barcode] Open Food Facts 조회 중 오류:", error);
      offResult = null;
    }
    if (offResult) {
      productName = offResult.name;
      productMessage = "제품 정보를 불러왔어요. 필요하면 이름을 수정해도 돼요.";
    }
  }

  if (!productName) {
    // 두 조회가 모두 실패한 경우 (알레르기 정보 조회는 시도할 필요도 없이 바로 종료)
    barcodeMessage.textContent = "제품을 찾지 못했어요. 직접 입력해주세요.";
    return;
  }

  nameInput.value = productName;
  barcodeMessage.textContent = productMessage;

  // ---- 2) 알레르기 정보: 1순위 푸드QR 알레르기정보, 실패/없음 시 2순위 Open Food Facts ----
  let allergyInfo = "";
  try {
    allergyInfo = await lookupFoodQrAllergy(barcode);
  } catch (error) {
    console.error("[barcode] 푸드QR 알레르기정보 조회 중 오류:", error);
  }

  if (!allergyInfo) {
    // 위에서 이름을 이미 Open Food Facts로 찾았다면(offResult가 정의됨) 그 응답을
    // 그대로 재사용하고, 아니라면(이름을 푸드QR로 찾은 경우) 알레르기 정보만을 위해
    // Open Food Facts를 한 번 더 호출합니다.
    if (offResult === undefined) {
      try {
        offResult = await lookupOpenFoodFacts(barcode);
      } catch (error) {
        console.error("[barcode] Open Food Facts 조회 중 오류(알레르기 정보):", error);
        offResult = null;
      }
    }
    if (offResult && offResult.allergyInfo) {
      allergyInfo = offResult.allergyInfo;
    }
  }

  if (allergyInfo) {
    showAllergyInfo(allergyInfo);
  }
}

scanBtn.addEventListener("click", openScanner);
scannerCloseBtn.addEventListener("click", closeScanner);
