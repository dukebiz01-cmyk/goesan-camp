# events.html 버그① 영구 패치 가이드

## 작업 흐름
1. **SQL 먼저 실행** (`fix_bug1.sql`) → 기존 208건 즉시 정정
2. **이 JS 패치 적용** → 신규 등록 시 자동 lock
3. **드래그 업로드** (GitHub 직접 편집 금지 — 한글 IME 변수명 깨짐)

---

## 1) `autoPrice()` 함수 수정

### 위치: 약 line 770 근방

### BEFORE
```javascript
function autoPrice(name, count){
  const p = findProgram(name);
  const pr = p.p;
  if(count >= 3 && pr.bundle3) return {price: pr.bundle3, bundle: "bundle3"};
  if(count === 2 && pr.bundle2) return {price: pr.bundle2, bundle: "bundle2"};
  if(count === 1 && pr.single)  return {price: pr.single,  bundle: "single"};
  return {price: 0, bundle: "unknown"};
}
```

### AFTER
```javascript
function autoPrice(name, count, lockedPrice = null){
  // ① lock된 가격이 있으면 그대로 사용 (재계산 X)
  if(lockedPrice && lockedPrice > 0){
    return {price: lockedPrice, bundle: "locked"};
  }
  const p = findProgram(name);
  if(!p) return {price: 0, bundle: "unknown"};
  const pr = p.p;
  if(count >= 3 && pr.bundle3) return {price: pr.bundle3, bundle: "bundle3"};
  if(count === 2 && pr.bundle2) return {price: pr.bundle2, bundle: "bundle2"};
  if(count === 1 && pr.single)  return {price: pr.single,  bundle: "single"};
  return {price: 0, bundle: "unknown"};
}
```

---

## 2) `campSpent()` 함수 수정

### 위치: 약 line 785 근방

### BEFORE
```javascript
function campSpent(camp){
  let total = 0;
  for(const e of state.events){
    if(e.camp_name !== camp) continue;
    const bs = bundleStatus(e.event_date, e.program_name);
    const ap = autoPrice(e.program_name, bs.count);
    total += ap.price;
  }
  return total;
}
```

### AFTER
```javascript
function campSpent(camp){
  let total = 0;
  for(const e of state.events){
    if(e.camp_name !== camp) continue;
    // ① locked_price 있으면 그대로 — 재계산 X
    if(e.locked_price && e.locked_price > 0){
      total += e.locked_price;
      continue;
    }
    // ② 아직 lock 안 됐으면 동적 계산 (미확정 표시용)
    const bs = bundleStatus(e.event_date, e.program_name);
    const ap = autoPrice(e.program_name, bs.count);
    total += ap.price;
  }
  return total;
}
```

---

## 3) 그룹 일괄 lock 함수 추가 (신규)

### 위치: 등록/삭제 핸들러 근처에 새로 추가

```javascript
// 같은 (event_date, program_name) 그룹의 모든 행 가격 일괄 박제
async function lockGroupPrice(event_date, program_name){
  if(!event_date || !program_name) return;
  
  const { data: rows, error } = await supabase
    .from('camp_events')
    .select('*')
    .eq('event_date', event_date)
    .eq('program_name', program_name);
  
  if(error || !rows || rows.length === 0) return;
  
  const ap = autoPrice(program_name, rows.length);
  if(!ap.price) return; // 가격 산출 실패 시 lock 안 함
  
  await supabase
    .from('camp_events')
    .update({
      locked_price: ap.price,
      bundle_type:  ap.bundle,
      finalized:    true
    })
    .eq('event_date', event_date)
    .eq('program_name', program_name);
}
```

---

## 4) 등록/삭제 핸들러 끝에 lock 호출 추가

### addEvent / saveEvent 함수 끝부분
```javascript
// 기존 insert 코드 ...
await supabase.from('camp_events').insert([newEvent]);

// ✅ 추가: 같은 그룹 전체 가격 박제
await lockGroupPrice(newEvent.event_date, newEvent.program_name);

await loadEvents(); // state 새로고침
```

### removeEvent 함수 끝부분
```javascript
const removed = state.events.find(e => e.id === id);
await supabase.from('camp_events').delete().eq('id', id);

// ✅ 추가: 같은 그룹 남은 행들 가격 재계산
if(removed) await lockGroupPrice(removed.event_date, removed.program_name);

await loadEvents();
```

---

## 5) 적용 후 검증

브라우저 콘솔에서:
```javascript
// 미확정 행 카운트 (0이면 성공)
state.events.filter(e => !e.finalized && e.event_date).length
```

---

## 부작용·주의사항
- **카탈로그에 가격 정의 누락된 프로그램**은 lock 안 됨 (그대로 미확정)
- **event_date=null 행 13건** (이용권류)은 그룹 매칭 불가 → 별도 처리 필요
- 4캠프 이상 묶음은 현재 카탈로그에 bundle3까지만 정의 → 4번째부터 같은 bundle3 가격 적용됨 (별도 패치 필요 시 알려주세요)
