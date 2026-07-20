// ============================================================
// systems/registry.js
// PMS·이지바로·RCMS 등 "예산 파일 시스템" 어댑터 레지스트리.
//
// 각 어댑터(systems/pms.js, systems/ezbaro.js, systems/rcms.js)는
// 자신을 이 레지스트리에 등록(register)만 하면 되고, 이 파일은
// 새 시스템이 추가되어도 수정할 필요가 없다.
//
// 어댑터 형태: { key, label, isExternal, detect(grid), locate(grid), aggregate(grid, loc) }
// ============================================================

window.SystemRegistry = (() => {
  const adapters = {};       // key -> adapter
  const order = [];          // 등록 순서 (detectType에서 이 순서대로 detect를 시도한다)

  function register(key, adapter) {
    adapters[key] = { key, ...adapter };
    order.push(key);
  }

  function get(key) {
    return adapters[key];
  }

  function all() {
    return order.map((key) => adapters[key]);
  }

  function externalSystems() {
    const result = {};
    for (const key of order) {
      if (adapters[key].isExternal) result[key] = adapters[key];
    }
    return result;
  }

  // grid를 보고 어떤 시스템인지 등록된 어댑터들의 detect()를 등록 순서대로 시도한다.
  // 등록 순서가 판별 우선순위이므로, main.js에서 반드시
  // EZBARO -> PMS -> RCMS 순으로 등록해서 기존 판별 로직과 동일한 우선순위를 유지한다.
  function detectType(grid) {
    for (const key of order) {
      if (adapters[key].detect(grid)) return key;
    }
    return "UNKNOWN";
  }

  return { register, get, all, externalSystems, detectType };
})();
