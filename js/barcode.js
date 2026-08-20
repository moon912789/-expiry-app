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

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

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

// 카메라를 끄고 스캐너 화면을 닫습니다. (✕ 버튼, 스캔 성공, 스캔 실패 모두 여기를 거칩니다)
function closeScanner() {
  scannerOverlay.hidden = true;

  if (!isScanning) return;
  isScanning = false;

  html5QrCode.stop().catch(() => {
    // 이미 멈춰 있는 상태 등은 그냥 무시합니다.
  });
}

// 한 프레임에서 바코드/QR코드를 못 찾았을 때마다 계속 호출되는 콜백이라,
// 실제 "에러"가 아니라 "아직 못 찾음"에 가깝습니다. 그래서 아무것도 하지 않습니다.
function onScanFailure() {}

// 바코드/QR코드 인식에 성공했을 때 호출됩니다. decodedText가 인식된 번호(문자열)입니다.
function onScanSuccess(decodedText) {
  closeScanner();
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
    const data = await response.json();

    // status === 1 이면 제품을 찾았다는 뜻입니다. (Open Food Facts API 규칙)
    const productName = data.product && (data.product.product_name_ko || data.product.product_name);

    if (data.status === 1 && productName) {
      nameInput.value = productName;
      barcodeMessage.textContent = "제품 정보를 불러왔어요. 필요하면 이름을 수정해도 돼요.";
    } else {
      barcodeMessage.textContent = "제품을 찾지 못했어요. 직접 입력해주세요.";
    }
  } catch (error) {
    // 네트워크 오류 등으로 조회 자체가 실패한 경우도 조용히 같은 안내만 보여줍니다.
    barcodeMessage.textContent = "제품을 찾지 못했어요. 직접 입력해주세요.";
  }
}

scanBtn.addEventListener("click", openScanner);
scannerCloseBtn.addEventListener("click", closeScanner);
