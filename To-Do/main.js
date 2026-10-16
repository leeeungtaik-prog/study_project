/* ===== 1. DOM 요소 가져오기 ===== */
// 입력 폼 / 입력창 / 할 일 목록 / 오류 메시지
const form = document.querySelector('.todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const errorMessage = document.getElementById('error-message');

// 전체 / 진행중 / 완료 개수 표시
const countTotal = document.getElementById('count-total');
const countActive = document.getElementById('count-active');
const countDone = document.getElementById('count-done');

// 일괄 처리 영역 (전체 선택 / 선택 완료 / 선택 삭제)
const bulkBar = document.getElementById('bulk-bar');
const selectAll = document.getElementById('select-all');
const bulkCompleteBtn = document.getElementById('bulk-complete-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');

// 필터 버튼들 (전체 / 진행중 / 완료)
const filterBtns = document.querySelectorAll('.filter-btn');

// 완료 히스토리 영역
const historyToggle = document.getElementById('history-toggle');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const historyClear = document.getElementById('history-clear');

// 전체 초기화 버튼
const resetBtn = document.getElementById('reset-btn');

/* ===== 2. 저장소(localStorage) 관련 ===== */
// localStorage에 저장할 때 사용하는 키 이름
const STORAGE_KEY = 'todos';
const HISTORY_KEY = 'todoHistory';

// 저장된 할 일 목록을 불러옴 (없거나 손상되었으면 빈 배열)
function loadTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (e) {
    return [];
  }
}

// 현재 할 일 목록을 저장
function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (e) {
    // 저장 실패 시에도 앱은 계속 동작
  }
}

// 저장된 완료 히스토리를 불러옴 (없거나 손상되었으면 빈 배열)
function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (e) {
    return [];
  }
}

// 현재 완료 히스토리를 저장
function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyLog));
  } catch (e) {
    // 저장 실패 시에도 앱은 계속 동작
  }
}

/* ===== 3. 앱 상태(데이터) ===== */
// 할 일 목록 [{ id, text, completed, completedAt }]
let todos = loadTodos();
// 완료 기록 [{ text, completedAt }] - 최신순, 항목을 삭제해도 남음
let historyLog = loadHistory();
// 새 할 일에 부여할 id (기존 id 중 최댓값 + 1)
let nextId = todos.reduce((max, t) => Math.max(max, t.id), 0) + 1;
// 현재 필터: 'all' | 'active' | 'done'
let currentFilter = 'all';
// 일괄 처리용으로 선택된 할 일 id (저장하지 않음)
const selectedIds = new Set();

/* ===== 4. 화면 그리기(렌더링) ===== */
// 현재 필터에 맞는 할 일만 골라서 반환
function getVisibleTodos() {
  if (currentFilter === 'active') return todos.filter((t) => !t.completed);
  if (currentFilter === 'done') return todos.filter((t) => t.completed);
  return todos;
}

// 전체 / 진행중 / 완료 개수를 갱신
function renderSummary() {
  const done = todos.filter((t) => t.completed).length;
  countTotal.textContent = todos.length;
  countDone.textContent = done;
  countActive.textContent = todos.length - done;
}

// 시각(타임스탬프)을 "10월 6일 오후 03:20" 형태로 변환
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 완료 히스토리 목록과 버튼의 개수 표시를 갱신
function renderHistory() {
  historyToggle.textContent = `완료 히스토리 (${historyLog.length})`;
  historyList.innerHTML = '';

  // 기록이 없으면 안내 문구만 표시
  if (historyLog.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = '완료한 기록이 없습니다.';
    historyList.appendChild(empty);
    return;
  }

  // 기록마다 "할 일 내용 + 완료 시각" 한 줄 생성
  historyLog.forEach((entry) => {
    const li = document.createElement('li');

    const text = document.createElement('span');
    text.className = 'history-text';
    text.textContent = entry.text;

    const time = document.createElement('span');
    time.className = 'history-time';
    time.textContent = formatTime(entry.completedAt);

    li.append(text, time);
    historyList.appendChild(li);
  });
}

// 일괄 처리 영역 갱신 (visible: 현재 필터로 화면에 보이는 할 일들)
function renderBulkBar(visible) {
  const selected = todos.filter((t) => selectedIds.has(t.id));
  const selectedActive = selected.filter((t) => !t.completed).length;

  // 보이는 할 일이 없으면 영역 숨김
  bulkBar.hidden = visible.length === 0;

  // 보이는 항목이 모두 선택되었을 때만 "전체 선택" 체크
  selectAll.checked = visible.length > 0 && selected.length === visible.length;

  // 일괄 처리는 2개 이상 선택했을 때만 활성화 (1개는 항목별 버튼 사용)
  const canBulk = selected.length >= 2;

  // 2개 이상 선택 + 선택 중 진행중인 항목이 있어야 "선택 완료" 활성화
  bulkCompleteBtn.disabled = !canBulk || selectedActive === 0;
  bulkCompleteBtn.textContent =
    canBulk && selectedActive > 0 ? `선택 완료 (${selectedActive})` : '선택 완료';

  // 2개 이상 선택해야 "선택 삭제" 활성화
  bulkDeleteBtn.disabled = !canBulk;
  bulkDeleteBtn.textContent =
    canBulk ? `선택 삭제 (${selected.length})` : '선택 삭제';
}

// 전체 화면을 다시 그림 (데이터가 바뀔 때마다 호출)
function render() {
  saveTodos();
  list.innerHTML = '';

  // 현재 선택된 필터 버튼만 active 표시
  filterBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === currentFilter);
  });

  const visible = getVisibleTodos();

  // 화면에 보이지 않는 항목(필터 밖)은 선택에서 제외 -> 현재 필터 대상만 일괄 처리됨
  const visibleIds = new Set(visible.map((t) => t.id));
  selectedIds.forEach((id) => {
    if (!visibleIds.has(id)) selectedIds.delete(id);
  });

  // 필터에 맞는 할 일을 한 줄씩 생성
  visible.forEach((todo) => {
    const li = document.createElement('li');
    li.className =
      'todo-item' +
      (todo.completed ? ' completed' : '') +
      (selectedIds.has(todo.id) ? ' selected' : '');

    // 일괄 처리용 선택 체크박스
    const selectBox = document.createElement('input');
    selectBox.type = 'checkbox';
    selectBox.title = '일괄 처리할 항목 선택';
    selectBox.checked = selectedIds.has(todo.id);
    selectBox.addEventListener('change', () => toggleSelect(todo.id));

    // 할 일 내용 (textContent 사용으로 HTML 삽입 방지)
    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = todo.text;

    // 완료 버튼: 진행중 항목은 "완료", 완료된 항목은 "되돌리기"(진행중으로 복귀)
    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'complete-btn' + (todo.completed ? ' undo' : '');
    completeBtn.textContent = todo.completed ? '되돌리기' : '완료';
    completeBtn.addEventListener('click', () => toggleTodo(todo.id));

    // 개별 삭제 버튼
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', () => deleteTodo(todo.id));

    li.append(selectBox, text, completeBtn, deleteBtn);
    list.appendChild(li);
  });

  renderSummary();
  renderBulkBar(visible);
  renderHistory();
}

/* ===== 5. 할 일 추가 / 완료 토글 / 삭제 ===== */
// 새 할 일 추가
function addTodo(text) {
  todos.push({ id: nextId++, text, completed: false });
  render();
}

// 할 일 하나의 완료 상태를 변경 (화면 갱신/저장은 호출한 쪽에서 처리)
function setCompleted(todo, completed) {
  if (todo.completed === completed) return;
  todo.completed = completed;
  if (completed) {
    // 완료 처리: 완료 시각을 남기고 히스토리 맨 앞에 추가
    todo.completedAt = Date.now();
    historyLog.unshift({ text: todo.text, completedAt: todo.completedAt });
  } else {
    // 완료를 취소하면 해당 완료 기록도 제거
    historyLog = historyLog.filter(
      (h) => !(h.completedAt === todo.completedAt && h.text === todo.text)
    );
    delete todo.completedAt;
  }
}

// 완료 <-> 미완료 전환
function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    setCompleted(todo, !todo.completed);
    saveHistory();
  }
  render();
}

// 할 일 하나 삭제 (히스토리 기록은 유지)
function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  selectedIds.delete(id);
  render();
}

// 일괄 처리용 선택 / 선택 해제
function toggleSelect(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  render();
}

/* ===== 6. 이벤트 연결 ===== */
// 필터 버튼 클릭: 선택한 필터로 바꾸고 다시 그림
filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    selectedIds.clear(); // 필터가 바뀌면 선택 초기화
    render();
  });
});

// 히스토리 버튼 클릭: 패널 열기/닫기
historyToggle.addEventListener('click', () => {
  historyPanel.hidden = !historyPanel.hidden;
  historyToggle.setAttribute('aria-expanded', String(!historyPanel.hidden));
});

// 기록 지우기 버튼: 확인 후 히스토리 전체 삭제
historyClear.addEventListener('click', () => {
  if (historyLog.length === 0) return;
  if (!confirm('완료 히스토리를 모두 지울까요?')) return;
  historyLog = [];
  saveHistory();
  render();
});

// 전체 초기화: 확인 후 저장된 모든 데이터를 지우고 처음 상태로 되돌림
resetBtn.addEventListener('click', () => {
  if (!confirm('모든 할 일과 히스토리가 삭제됩니다. 초기화할까요?')) return;

  // 저장소 데이터 삭제
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) {
    // 삭제 실패 시에도 화면 상태는 초기화
  }

  // 앱 상태를 처음 상태로
  todos = [];
  historyLog = [];
  nextId = 1;
  currentFilter = 'all';
  selectedIds.clear();

  // 입력창, 오류 메시지, 히스토리 패널도 초기 상태로
  input.value = '';
  errorMessage.textContent = '';
  historyPanel.hidden = true;
  historyToggle.setAttribute('aria-expanded', 'false');

  render();
});

// 전체 선택: 현재 필터로 보이는 항목만 모두 선택 / 해제
selectAll.addEventListener('change', () => {
  selectedIds.clear();
  if (selectAll.checked) {
    getVisibleTodos().forEach((t) => selectedIds.add(t.id));
  }
  render();
});

// 선택 완료: 선택한 항목 중 진행중인 것을 모두 완료 처리
bulkCompleteBtn.addEventListener('click', () => {
  todos.forEach((t) => {
    if (selectedIds.has(t.id)) setCompleted(t, true);
  });
  saveHistory();
  selectedIds.clear();
  render(); // 현재 필터가 유지되므로 필터 밖으로 이동한 항목은 자동으로 숨겨짐
});

// 선택 삭제: 선택한 항목을 모두 삭제 (히스토리 기록은 유지)
bulkDeleteBtn.addEventListener('click', () => {
  todos = todos.filter((t) => !selectedIds.has(t.id));
  selectedIds.clear();
  render();
});

// 추가 버튼 클릭과 엔터키 모두 form submit으로 처리됨
form.addEventListener('submit', (e) => {
  e.preventDefault(); // 페이지 새로고침 방지
  const text = input.value.trim(); // 앞뒤 공백 제거

  // 빈 값이면 오류 메시지 표시
  if (!text) {
    errorMessage.textContent = '할 일을 입력하세요';
    input.focus();
    return;
  }

  // 같은 내용(대소문자 구분 없음)이 이미 있으면 추가하지 않음
  const isDuplicate = todos.some(
    (t) => t.text.toLowerCase() === text.toLowerCase()
  );
  if (isDuplicate) {
    errorMessage.textContent = '이미 있는 할 일 목록입니다.';
    input.focus();
    return;
  }

  // 정상 입력: 추가 후 입력창 비우기
  errorMessage.textContent = '';
  addTodo(text);
  input.value = '';
  input.focus();
});

// 다시 입력을 시작하면 오류 메시지 제거
input.addEventListener('input', () => {
  errorMessage.textContent = '';
});

/* ===== 7. 초기 실행 ===== */
// 페이지 로드 시 저장된 목록 표시
render();
