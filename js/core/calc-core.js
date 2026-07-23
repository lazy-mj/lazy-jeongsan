// ============================================================
// core/calc-core.js
// 전체 비교 계산의 진입점(오케스트레이션).
//
// 리팩토링 전에는 이 파일이 PMS/이지바로/RCMS의 파싱·집계 로직을 전부
// 알고 있어야 했지만, 이제는 SystemRegistry에서 어댑터를 꺼내 쓰기만
// 하므로 새 외부시스템이 추가되어도 이 파일은 수정할 필요가 없다.
//
// 로드 순서 의존성: grid-utils.js, config/category-map.js,
// systems/registry.js, systems/pms.js, systems/ezbaro.js, systems/rcms.js
// 가 이 파일보다 먼저 로드되어 있어야 한다 (index.html의 <script> 순서 참고).
// ============================================================

window.CalcCore = (() => {
  const { findHeaderRow, findColumnInRow, parseAmount } = window.GridUtils;
  const { STANDARD_CATEGORIES, UNCLASSIFIED } = window.CategoryMap;
  const Registry = window.SystemRegistry;

  // 워크시트 내용을 보고 PMS/이지바로/RCMS 파일 종류를 자동 판별.
  // 실제 판별 로직은 각 어댑터(systems/*.js)의 detect()에 있고, 여기서는
  // 레지스트리에 등록된 순서대로 detect를 시도할 뿐이다.
  function detectFileType(grid) {
    return Registry.detectType(grid);
  }

  function sumTriple(a, b) {
    return { carry: a.carry + b.carry, exec: a.exec + b.exec, actual: a.actual + b.actual };
  }
  function balance(t) {
    return t.carry + t.exec - t.actual;
  }

  // 짝짓기가 잘못됐을 수도 있다는 신호를 잡아내는 휴리스틱.
  // 실행예산(배정 예산)은 원래 PMS·외부시스템 양쪽에 거의 동일하게 등록되므로,
  // 이게 크게 어긋나면 회계상의 사소한 차이라기보다 아예 다른 과제를 짝지었을 가능성이 높다.
  // (집행실적은 시점/처리속도 차이로 원래도 다를 수 있어 판정 기준에서 제외한다.)
  function detectPairingMismatch(rows, totalPMS, totalExt) {
    const largerExec = Math.max(totalPMS.exec, totalExt.exec, 1);
    const execDiffRatio = Math.abs(totalPMS.exec - totalExt.exec) / largerExec;

    let overlapCategories = 0;
    let nonOverlapCategories = 0;
    rows.forEach((r) => {
      const pmsHas = r.pms.exec > 0 || r.pms.actual > 0;
      const ezHas = r.ez.exec > 0 || r.ez.actual > 0;
      if (pmsHas && ezHas) overlapCategories += 1;
      else if (pmsHas || ezHas) nonOverlapCategories += 1;
    });
    const noOverlap = nonOverlapCategories > 0 && overlapCategories === 0;

    const suspicious = execDiffRatio > 0.2 || noOverlap;
    return { suspicious, diffRatio: execDiffRatio, noOverlap };
  }

  // 전체 비교 실행: 두 워크북(1시트씩)의 grid를 받아 결과 구조를 반환.
  // 한쪽은 반드시 PMS, 다른 한쪽은 등록된 외부시스템(이지바로/RCMS 등) 중 하나여야 한다.
  function compare(gridA, gridB) {
    const typeA = detectFileType(gridA);
    const typeB = detectFileType(gridB);
    const externalSystems = Registry.externalSystems();

    let pmsGrid, extGrid, extType;
    if (typeA === "PMS" && externalSystems[typeB]) {
      pmsGrid = gridA; extGrid = gridB; extType = typeB;
    } else if (typeB === "PMS" && externalSystems[typeA]) {
      pmsGrid = gridB; extGrid = gridA; extType = typeA;
    } else {
      return {
        ok: false,
        error: `파일 종류를 자동으로 식별하지 못했습니다. (파일1: ${typeA}, 파일2: ${typeB}) ` +
               `PMS와 외부시스템(이지바로/RCMS) 파일이 하나씩 맞는지, 다운로드 양식이 바뀌지 않았는지 확인해주세요.`
      };
    }

    const pmsAdapter = Registry.get("PMS");
    const extAdapter = externalSystems[extType];

    const pmsLoc = pmsAdapter.locate(pmsGrid);
    if (!pmsLoc.ok) return { ok: false, error: pmsLoc.error };
    const extLoc = extAdapter.locate(extGrid);
    if (!extLoc.ok) return { ok: false, error: extLoc.error };

    const pmsAgg = pmsAdapter.aggregate(pmsGrid, pmsLoc);
    const extAgg = extAdapter.aggregate(extGrid, extLoc);

    const rows = STANDARD_CATEGORIES.map((cat) => ({
      category: cat,
      pms: pmsAgg.sums[cat],
      ez: extAgg.sums[cat],
      pmsBalance: balance(pmsAgg.sums[cat]),
      ezBalance: balance(extAgg.sums[cat]),
    }));

    const unclassifiedRow = {
      category: "기타(미분류)",
      pms: pmsAgg.sums[UNCLASSIFIED],
      ez: extAgg.sums[UNCLASSIFIED],
      pmsBalance: balance(pmsAgg.sums[UNCLASSIFIED]),
      ezBalance: balance(extAgg.sums[UNCLASSIFIED]),
      pmsLabels: pmsAgg.unclassifiedLabels,
      ezLabels: extAgg.unclassifiedLabels,
    };
    rows.push(unclassifiedRow);

    const directPMS = rows.reduce((acc, r) => sumTriple(acc, r.pms), { carry: 0, exec: 0, actual: 0 });
    const directExt = rows.reduce((acc, r) => sumTriple(acc, r.ez), { carry: 0, exec: 0, actual: 0 });
    const indirectPMS = pmsAgg.sums["__INDIRECT__"];
    const indirectExt = extAgg.sums["__INDIRECT__"];
    const totalPMS = sumTriple(directPMS, indirectPMS);
    const totalExt = sumTriple(directExt, indirectExt);

    const pairingCheck = detectPairingMismatch(rows, totalPMS, totalExt);

    const result = {
      ok: true,
      externalType: extType,
      externalLabel: extAdapter.label,
      rows,
      direct: { pms: directPMS, ez: directExt, pmsBalance: balance(directPMS), ezBalance: balance(directExt) },
      indirect: { pms: indirectPMS, ez: indirectExt, pmsBalance: balance(indirectPMS), ezBalance: balance(indirectExt) },
      total: { pms: totalPMS, ez: totalExt, pmsBalance: balance(totalPMS), ezBalance: balance(totalExt) },
      unclassifiedLabels: {
        pms: pmsAgg.unclassifiedLabels,
        ez: extAgg.unclassifiedLabels,
      },
      pairingSuspicious: pairingCheck.suspicious,
      pairingDiffRatio: pairingCheck.diffRatio,
      pairingNoOverlap: pairingCheck.noOverlap,
      looksLikeBasicProject: !!pmsAgg.looksLikeBasicProject,
      meta: {
        pmsHeaderRow: pmsLoc.headerRow, pmsDataStartRow: pmsLoc.dataStartRow, pmsLastRow: pmsAgg.lastRow,
        extHeaderRow: extLoc.headerRow, extDataStartRow: extLoc.dataStartRow, extLastRow: extAgg.lastRow,
      }
    };

    // RCMS만 파일 자체에 "사용잔액"이 이미 적혀 있어서, 우리가 재계산한 잔액과
    // 다를 수 있다 (예: 이월금이 재계산식에는 빠져있음). 다르면 화면에 별도로 알려준다.
    if (extType === "RCMS" && typeof extAgg.reportedBalanceTotal === "number") {
      const recalculated = totalExt.carry + totalExt.exec - totalExt.actual;
      const diff = recalculated - extAgg.reportedBalanceTotal;
      result.externalBalanceCheck = {
        reported: extAgg.reportedBalanceTotal,
        recalculated,
        diff,
        mismatch: Math.abs(diff) > 0.5,
      };
    }

    return result;
  }

  return {
    detectFileType, findHeaderRow, findColumnInRow, parseAmount,
    compare, STANDARD_CATEGORIES,
  };
})();

if (typeof module !== "undefined") module.exports = window.CalcCore;
