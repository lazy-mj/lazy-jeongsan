// ============================================================
// main.js
// 컨트롤러 계층: 파일 읽기(I/O), 사용자 액션 처리, 초기화/이벤트 바인딩.
// state 변경과 render 호출을 함께 지시하는 "지휘자" 역할이라 계산(core)이나
// 순수 렌더링(render.js)과는 분리해서 여기 모아둔다.
//
// 모든 처리는 브라우저 안에서만 이루어지며, 어떤 파일도 서버로
// 전송되지 않는다. 계산 로직은 core/calc-core.js를 그대로 사용한다.
//
// 두 가지 모드를 지원한다:
//  - 단일 모드: PMS 1개 + 이지바로 1개만 인식되면 바로 진행 (기존과 동일)
//  - 배치 모드: 후보가 여러 개면 사용자가 직접 "짝"을 여러 개 만들고
//               한 번에 전체 검증을 실행한다. 파일 내용만으로 어떤 PMS가
//               어떤 이지바로와 짝인지 자동으로 알 방법이 없어서(과제 구분값이
//               파일에 없음), 자동 짝짓기는 하지 않는다 - 잘못 짝지으면
//               에러 없이 조용히 틀린 결과가 나오는 게 가장 위험하기 때문.
// ============================================================

function readWorkbookGrid(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
        resolve(grid);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function resetResultIfNeeded() {
  if (!AppState.state.resultShown) return;
  AppState.state.resultShown = false;
  $("#uploadCard").style.display = "block";
  $("#resultCard").style.display = "none";
  $("#overviewArea").innerHTML = "";
  $("#resultsContainer").innerHTML = "";
  AppCore.toast.show("파일이 바뀌어 이전 결과를 초기화했습니다. 다시 검증을 실행해주세요.");
}

async function handleFiles(fileList) {
  resetResultIfNeeded();
  const files = Array.from(fileList);
  for (const file of files) {
    const entry = { id: AppState.nextFileId(), name: file.name, grid: null, type: "분석중" };
    AppState.state.files.push(entry);
    renderChips();
    try {
      const grid = await readWorkbookGrid(file);
      entry.grid = grid;
      entry.type = CalcCore.detectFileType(grid);
    } catch (err) {
      entry.type = "ERROR";
      console.error(err);
    }
    renderChips();
  }
  updateRunState();
}

function removeFile(id) {
  resetResultIfNeeded();
  AppState.state.files = AppState.state.files.filter((f) => f.id !== id);
  AppState.state.pairs = AppState.state.pairs.filter((p) => p.pmsId !== id && p.ezId !== id);
  renderChips();
  renderPairList();
  updateRunState();
}

function resetAll() {
  AppState.state.files = [];
  AppState.state.pairs = [];
  AppState.state.resultShown = false;
  renderChips();
  renderPairList();
  updateRunState();
  $("#uploadCard").style.display = "block";
  $("#resultCard").style.display = "none";
  $("#overviewArea").innerHTML = "";
  $("#resultsContainer").innerHTML = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addPair() {
  const pmsSelect = $("#pmsSelect");
  const ezSelect = $("#ezSelect");
  if (!pmsSelect.value || !ezSelect.value) return; // 옵션이 아예 없는 경우만 걸러냄 (id=0은 정상 처리)
  const pmsId = Number(pmsSelect.value);
  const ezId = Number(ezSelect.value);

  // 이미 다른 짝에 사용된 파일을 또 선택한 경우 -> 조용히 중복/충돌 짝이 생기지 않도록 경고
  const dupPms = AppState.state.pairs.find((p) => p.pmsId === pmsId);
  const dupEz = AppState.state.pairs.find((p) => p.ezId === ezId);
  if (dupPms || dupEz) {
    const dupFileId = dupPms ? pmsId : ezId;
    const dupFile = AppState.state.files.find((f) => f.id === dupFileId);
    showWarningModal(
      "이미 선택된 파일이에요",
      `"${dupFile ? dupFile.name : "선택한 파일"}"은(는) 이미 다른 짝에 사용되었습니다. 다른 파일을 선택해주세요.`
    );
    return;
  }

  AppState.state.pairs.push({ id: AppState.nextPairId(), pmsId, ezId });
  renderPairList();
  updateRunState();
}

function removePair(id) {
  AppState.state.pairs = AppState.state.pairs.filter((p) => p.id !== id);
  renderPairList();
  updateRunState();
}

async function runComparison() {
  const pmsFiles = AppState.state.files.filter((f) => f.type === "PMS");
  const ezFiles = AppState.state.files.filter((f) => AppState.isExternalType(f.type));

  if (pmsFiles.length === 1 && ezFiles.length === 1) {
    const label = `${pmsFiles[0].name} ↔ ${ezFiles[0].name}`;
    const result = CalcCore.compare(pmsFiles[0].grid, ezFiles[0].grid);
    renderResults([{ label, result }]);
    return;
  }

  if (AppState.state.pairs.length === 0) return;

  const items = AppState.state.pairs.map((p) => {
    const pmsFile = AppState.state.files.find((f) => f.id === p.pmsId);
    const ezFile = AppState.state.files.find((f) => f.id === p.ezId);
    const label = `${pmsFile ? pmsFile.name : "?"} ↔ ${ezFile ? ezFile.name : "?"}`;
    if (!pmsFile || !ezFile) {
      return { label, result: { ok: false, error: "파일을 찾을 수 없습니다. 목록에서 제거되었을 수 있어요." } };
    }
    const result = CalcCore.compare(pmsFile.grid, ezFile.grid);
    return { label, result };
  });

  renderResults(items);
}

function wireDropzone() {
  const dz = $("#dropzone");
  const input = $("#fileInput");

  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", (e) => {
    if (e.target.files.length) handleFiles(e.target.files);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((evt) => {
    dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove("dragover"); });
  });
  dz.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireDropzone();
  $("#runBtn").addEventListener("click", runComparison);
  $("#addPairBtn").addEventListener("click", addPair);
  $("#downloadAllBtn").addEventListener("click", downloadAllExcel);
  $("#resetBtn").addEventListener("click", resetAll);
  AppCore.stepper.set(1);
});

