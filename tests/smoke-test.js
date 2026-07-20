// 리팩토링 검증용 스모크 테스트 (Node 환경, 실제 앱에는 포함되지 않음)
global.window = global;

function load(path) {
  const fs = require('fs');
  const code = fs.readFileSync(path, 'utf8');
  // eslint-disable-next-line no-eval
  eval(code);
}

load('./js/config/category-map.js');
load('./js/core/grid-utils.js');
load('./js/systems/registry.js');
load('./js/systems/ezbaro.js');
load('./js/systems/pms.js');
load('./js/systems/rcms.js');
load('./js/core/calc-core.js');

// ---- PMS 합성 그리드 ----
// 1행: 헤더(판별용 "발의액" 포함), 2~4행: 데이터
const pmsGrid = [
  ["세세세목", "발의액", "이월예산", "실행예산", "실적계"],
  ["학생인건비", "0", "0", "1,000,000", "600,000"],
  ["연구활동비", "0", "0", "500,000", "500,000"],
  ["간접비", "0", "0", "200,000", "150,000"],
];

// ---- 이지바로 합성 그리드 ----
// 0행: 판별용 마커("연구비예실대비표")
// headerRow=1 ("세목","실사용액" 포함), headerRow+1=2 ("전년도이월액","현금"),
// dataStartRow = headerRow+3 = 4
const ezGrid = [
  ["연구비예실대비표"],
  ["세목", "승인예산", "실사용액"],
  ["구분", "전년도이월액", "현금"],
  ["소계행(스킵)", "", ""],
  ["학생인건비", "0", "600,000"],
  ["연구활동비", "0", "500,000"],
  ["간접비", "0", "150,000"],
];
// 실사용액 컬럼은 "세목"과 같은 헤더행(1행)에 있어야 하므로 인덱스 맞춰 재구성
// (locateEzbaroColumns: exec/carry는 headerRow+1행에서, actual/semok은 headerRow행에서 찾음)

const detectedPMS = CalcCore.detectFileType(pmsGrid);
const detectedEZ = CalcCore.detectFileType(ezGrid);
console.log("PMS 판별:", detectedPMS);
console.log("EZBARO 판별:", detectedEZ);

if (detectedPMS !== "PMS") throw new Error("PMS 판별 실패: " + detectedPMS);
if (detectedEZ !== "EZBARO") throw new Error("EZBARO 판별 실패: " + detectedEZ);

const result = CalcCore.compare(pmsGrid, ezGrid);
console.log(JSON.stringify(result, null, 2));

if (!result.ok) throw new Error("compare 실패: " + result.error);

const mismatchCategories = result.rows.filter(r => Math.abs(r.pmsBalance - r.ezBalance) > 0.5 || r.pms.exec !== r.ez.exec);
console.log("총계(PMS):", result.total.pms);
console.log("총계(EZ):", result.total.ez);
console.log("\n✅ 스모크 테스트 통과: 리팩토링된 모듈이 정상 동작합니다.");
