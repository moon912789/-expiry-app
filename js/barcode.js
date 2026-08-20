/*
  barcode.js
  역할: add.html의 "바코드로 자동 입력" 버튼을 눌렀을 때
        1) 카메라를 켜서 바코드/QR코드를 인식하고
        2) 인식된 번호로 Open Food Facts에서 제품 정보를 찾아
        3) 품목명(nameInput) 입력칸에 자동으로 채워줍니다.

  이 파일은 두 가지를 그대로 재사용합니다.
  - CDN으로 불러온 html5-qrcode 라이브러리의 Html5Qrcode 클래스 (카메라/인식 담당)
  - form.js에서 이미 만들어 둔 nameInput 변수 (같은 화면의 스크립트라 따로 안 만들고 그대로 씁니다)

  카메라가 없거나 권한을 거부한 경우에도 이 파일의 코드는 실패를 조용히 처리할 뿐,
  나머지 폼(직접 입력)은 원래대로 문제없이 동작합니다.
*/

const scanBtn = document.getElementById("barcode-scan-btn");
const scannerOverlay = document.getElementById("barcode-scanner-overlay");
const scannerCloseBtn = document.getElementById("scanner-close-btn");
const scannerStatus = document.getElementById("scanner-status");
const barcodeMessage = document.getElementById("barcode-message");

// CDN 스크립트가 어떤 이유로든 로드되지 않았을 수 있어서, 있는지부터 확인합니다.
const html5QrCode = "Html5Qrcode" in window ? new Html5Qrcode("barcode-reader") : null;

let isScanning = false; // 지금 카메라가 켜져서 인식 중인지 여부

// "바코드로 자동 입력" 버튼을 누르면 카메라 화면을 엽니다.
function openScanner() {
  if (!html5QrCode) {
    barcodeMessage.textContent = "이 브라우저에서는 바코드 스캔을 쓸 수 없어요. 직접 입력해주세요.";
    return;
  }

  barcodeMessage.textContent = "";
  scannerStatus.textContent = "카메라를 켜는 중...";
  scannerOverlay.hidden = false;

  const config = {
    fps: 10,
    // 인식 영역을 고정 크기(250x250)로 두면 카메라 화면보다 커서 인식이 안 되는
    // 경우가 있어서, 실제 카메라 화면 크기에 비례해서 계산하도록 바꿨습니다.
    // 바코드는 가로로 긴 모양이라 세로보다 가로를 더 넓게 잡습니다.
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      const boxWidth = Math.floor(minEdge * 0.85);
      const boxHeight = Math.floor(boxWidth * 0.55);
      return { width: boxWidth, height: boxHeight };
    },
  };

  html5QrCode
    // facingMode: "environment" -> 스마트폰의 후면(바깥쪽) 카메라를 우선 사용합니다.
    .start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
    .then(() => {
      isScanning = true;
      scannerStatus.textContent = "바코드를 카메라에 비춰주세요";
    })
    .catch(() => {
      // 카메라 권한을 거부했거나, PC처럼 카메라가 없는 환경인 경우
      closeScanner();
      barcodeMessage.textContent = "카메라를 사용할 수 없어요. 직접 입력해주세요.";
    });
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

// 한 프레임에서 바코드/QR코드를 못 찾았을 때마다 계속 호출되는 콜백이라,
// 실제 "에러"가 아니라 "아직 못 찾음"에 가깝습니다. 그래서 아무것도 하지 않습니다.
function onScanFailure() {}

// 바코드/QR코드 인식에 성공했을 때 호출됩니다. decodedText가 인식된 번호(문자열)입니다.
function onScanSuccess(decodedText) {
  // 디버깅용: 인식 자체가 되는지(카메라 문제) vs 조회가 안 되는지(API 문제) 구분하기 위한 로그
  console.log("[barcode] 스캔된 값:", decodedText);

  // 화면을 먼저 닫고(사용자 경험), 카메라 정지는 실패해도 무시되도록 분리해서 처리합니다.
  scannerOverlay.hidden = true;
  stopCamera();

  // 카메라 정지가 어떻게 되든 상관없이 조회는 항상 진행되어야 합니다.
  lookupProduct(decodedText);
}

// Open Food Facts API로 제품 정보를 조회합니다.
// 찾으면 품목명 입력칸을 채우고, 못 찾거나 요청 자체가 실패하면
// 팝업 없이 안내 문구만 보여주고 사용자가 직접 입력하도록 그대로 둡니다.
async function lookupProduct(barcode) {
  barcodeMessage.textContent = "제품 정보를 찾는 중...";

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
    const response = await fetch(url);

    // 응답 자체가 200번대가 아니면(서버 오류 등) 바로 실패로 처리합니다.
    if (!response.ok) {
      console.warn("[barcode] API 응답 실패:", response.status);
      barcodeMessage.textContent = "제품을 찾지 못했어요. 직접 입력해주세요.";
      return;
    }

    const data = await response.json();
    console.log("[barcode] API 응답:", data); // 디버깅용: status 값과 product 유무를 바로 확인할 수 있음

    // status === 1 이면 제품을 찾았다는 뜻이고, status === 0 이면 DB에 없다는 뜻입니다.
    // (Open Food Facts API 규칙 - 둘 다 정상 응답이라 catch로는 안 걸러지고 여기서 직접 구분해야 합니다)
    const productName = data.product && (data.product.product_name_ko || data.product.product_name);

    if (data.status === 1 && productName) {
      nameInput.value = productName;
      barcodeMessage.textContent = "제품 정보를 불러왔어요. 필요하면 이름을 수정해도 돼요.";
    } else {
      barcodeMessage.textContent = "제품을 찾지 못했어요. 직접 입력해주세요.";
    }
  } catch (error) {
    // 네트워크 오류, JSON 파싱 실패 등 요청 자체가 실패한 경우도 조용히 같은 안내만 보여줍니다.
    console.error("[barcode] 조회 중 오류:", error);
    barcodeMessage.textContent = "제품을 찾지 못했어요. 직접 입력해주세요.";
  }
}

scanBtn.addEventListener("click", openScanner);
scannerCloseBtn.addEventListener("click", closeScanner);
