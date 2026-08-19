/*
  scripts/generate-icons.js
  역할: icon.svg를 안드로이드 크롬이 요구하는 PNG 아이콘(192x192, 512x512)으로 변환합니다.

  안드로이드 크롬은 "홈 화면에 추가" 아이콘으로 SVG를 인식하지 못하고
  PNG만 인식하기 때문에, PWA 아이콘은 SVG가 아니라 PNG로도 만들어둬야 합니다.
  디자인 자체는 icon.svg 하나에만 두고, 이 스크립트를 실행할 때마다
  그 디자인을 바탕으로 PNG를 다시 생성합니다. (아이콘을 고치고 싶으면
  icon.svg만 수정한 뒤 `npm run generate-icons`를 다시 실행하면 됩니다)

  실행: npm run generate-icons  (또는 node scripts/generate-icons.js)
*/

const path = require("path");
const sharp = require("sharp");

const ROOT_DIR = path.join(__dirname, "..");
const SVG_PATH = path.join(ROOT_DIR, "icon.svg");

// 만들 PNG 크기 목록: [파일명, 한 변의 픽셀 크기]
const TARGETS = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
];

async function main() {
  for (const [fileName, size] of TARGETS) {
    const outputPath = path.join(ROOT_DIR, fileName);
    await sharp(SVG_PATH, { density: 384 }) // density를 높여서 축소해도 선명하게 렌더링
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`생성됨: ${fileName} (${size}x${size})`);
  }
}

main().catch((err) => {
  console.error("아이콘 생성 실패:", err);
  process.exit(1);
});
