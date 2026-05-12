// js/config.js — v5.0.2 → v5.1.0 (events.html 통합)
export const APP_VERSION = "GCA v5.1.0 · events 통합";

export const SUPABASE_URL = "https://zzglzlbxslgojntcofez.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Z2x6bGJ4c2xnb2pudGNvZmV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NzUzMTAsImV4cCI6MjA5MjI1MTMxMH0.7wd78MoLgN2QSCFDitr3ZcJN3PI7UG8x1OkUbqwW3WQ";
export const STORAGE_BUCKET = "association-files";
export const ENARA_URL = "https://www.gosims.go.kr";
export const KAKAO_OPENCHAT_URL = "https://open.kakao.com/o/XXXXXX";
export const KAKAO_CHANNEL_URL = "http://pf.kakao.com/_XXXXXX";

// ============================================================
// 글로벌 상태
// ============================================================
export const state = {
  user: null,
  member: null,
  role: null,
  page: "my",
  events: [],
  camps: [],
  travel: [],
  providers: [],
  files: [],
  eventsError: null,
  // events 통합 상태
  selectedCamp: null,      // 관리자가 다른 캠프 보기용
  announcements: [],
  dismissedAnnIds: new Set(),
};

export const ROLE_LABEL = {
  admin: "협회임원",
  member: "회원",
  provider: "업체/강사",
  vendor: "업체/강사",
  instructor: "업체/강사",
  county: "군청",
};

// ============================================================
// 예산 산정 (events.html에서 흡수)
// 총 1억 / 21곳 기준 + 포기 2곳 재분배 + 해밀턴 미사용 차액 재분배
// ============================================================
export const PROJECT_TOTAL_BUDGET = 100000000;
export const TOTAL_PROJECT_CAMPS = 21;
export const SYSTEM_APPLICATION_COUNT = 17;
export const SELF_APPLICATION_COUNT = 4;
export const FORFEITED_CAMP_COUNT = 2;
export const HAMILTON_CAMP_NAME = "해밀터";
export const HAMILTON_USED_AMOUNT = 715000;
export const FORFEITED_CAMP_NAMES = ["아빠의나무", "강변캠핑장", "강변"];

const BASE_BUDGET = Math.round(PROJECT_TOTAL_BUDGET / TOTAL_PROJECT_CAMPS);            // 4,761,905
const FORFEITED_TOTAL = BASE_BUDGET * FORFEITED_CAMP_COUNT;                            // 9,523,810
const FORFEIT_EXTRA = Math.round(FORFEITED_TOTAL / TOTAL_PROJECT_CAMPS);               // 453,515
const FIRST_STAGE = BASE_BUDGET + FORFEIT_EXTRA;                                       // 5,215,420
const HAMILTON_UNUSED = Math.max(0, FIRST_STAGE - HAMILTON_USED_AMOUNT);               // 4,500,420
const HAMILTON_EXTRA = Math.round(HAMILTON_UNUSED / TOTAL_PROJECT_CAMPS);              // 214,306
export const CAMP_BUDGET = BASE_BUDGET + FORFEIT_EXTRA + HAMILTON_EXTRA;               // 5,429,726

export const BUDGET_BREAKDOWN = {
  base: BASE_BUDGET,
  forfeit_extra: FORFEIT_EXTRA,
  forfeited_total: FORFEITED_TOTAL,
  hamilton_unused: HAMILTON_UNUSED,
  hamilton_extra: HAMILTON_EXTRA,
  final: CAMP_BUDGET,
};

// ============================================================
// 카탈로그 — events.html의 programs를 그대로 흡수
// EVENT_META는 호환성을 위해 cat·provider 그대로 유지 + pricing 추가
// ============================================================
export const PROGRAMS = {
  A: [
    { n: "풍선쇼",            i: "A_백선일", p: { bundle3: 400000, single: 500000 } },
    { n: "버블쇼",            i: "A_백선일", p: { bundle3: 400000, single: 500000 } },
    { n: "마술쇼",            i: "A_백선일", p: { bundle3: 400000, single: 500000 } },
    { n: "솜사탕쇼",          i: "A_백선일", p: { bundle3: 400000, single: 500000 } },
    { n: "레이저쇼",          i: "A_백선일", p: { bundle3: 500000, single: 800000 } },
    { n: "풍선매직쇼",        i: "A_신태호", p: { bundle2: 500000, single: 550000 } },
    { n: "통기타음악회",      i: "A_통기타", p: { bundle2: 330000, single: 500000 } },
    { n: "마술쇼 조동희(40분)", i: "A_조동희", p: { single: 550000 } },
    { n: "반려견 행동 토크쇼",  i: "A_반려견", p: { single: 400000 } },
  ],
  B: [
    ...[
      "사과오이소박이","꽃떡퐁듀","감자핫도그만들기","과일꼬치화채",
      "시원한 허브꽃 모히또","허브솔트","보들꽃 증편","건강 강정 만들기",
      "추석 꽃송편","단호박 꽃단자","깍두기 만들기","꽃장식 딸기 모찌",
      "딸기청 만들기","꽃 코디얼 빙수","호두정과","딸기 고추장",
      "카네이션 바람떡","수레국화 양갱","캐릭터김밥","연잎밥 만들기",
      "오이 모듬피클","얼굴 카나페","모기퇴치 꽃스머지스틱","인절미",
      "K도넛 개성주악","발효초콜릿","곳감단자","봄향기 화전",
      "봄꽃 코디얼","고기도둑 달래쌈장","쑥버무리","꽃식초",
      "고기 마리네이드","과일젤리",
    ].map(n => ({ n, i: "B_정미화", p: { bundle3: 165000, single: 220000 } })),
    { n: "4인 재료비 1매", i: "B_재료비", p: { ticket: 10000 } },
  ],
  C: [
    { n: "페이스페인팅",       i: "C_이은희",       p: { bundle3: 143000, bundle2: 165000, single: 220000 } },
    { n: "헤나",               i: "C_이은희",       p: { bundle3: 143000, bundle2: 165000, single: 220000 } },
    { n: "가족캐리커쳐",       i: "C_이은희",       p: { bundle3: 165000, bundle2: 187000, single: 220000 } },
    { n: "타로카드",           i: "C_이은희",       p: { bundle3: 143000, bundle2: 165000, single: 220000 } },
    { n: "할로윈 페이스페인팅", i: "C_이은희",       p: { bundle3: 143000, bundle2: 165000, single: 220000 } },
    { n: "캐릭터 솜사탕",      i: "C_캐릭터솜사탕", p: { bundle2: 350000, single: 400000 } },
  ],
  D: [
    { n: "짚라인",         i: "D_이경희",   p: { bundle2: 250000, single: 300000 } },
    { n: "슬랙라인",       i: "D_이경희",   p: { bundle2: 250000, single: 300000 } },
    { n: "로켓스윙",       i: "D_이경희",   p: { bundle2: 250000, single: 300000 } },
    { n: "승마체험",       i: "D_승마",     p: { single: 200000 } },
    { n: "사과따기 체험",  i: "D_사과따기", p: { single: 500000 } },
    { n: "산막이 보트 1매", i: "D_보트",     p: { ticket: 4000 } },
    { n: "모터보트 2인 1매", i: "D_모터보트", p: { ticket: 25000 } },
    { n: "소형유람선 1매",  i: "D_유람선",   p: { ticket: 18000 } },
    { n: "자체행사비",     i: "D_자체",     p: { single: 1000000 } },
  ],
};

export const CATEGORY_LABEL = { A: "공연", B: "먹거리", C: "체험", D: "활동" };

// 강사 ID → 표시명·소속업체 매핑
export const INSTRUCTOR_INFO = {
  "A_백선일":       { name: "백선일",       company: "썬엔터테인먼트 문화공연팀" },
  "A_신태호":       { name: "신태호",       company: "링엔터테인먼트" },
  "A_통기타":       { name: "통기타 음악회 공연팀", company: "통기타 음악회 공연팀" },
  "A_조동희":       { name: "조동희",       company: "마술쇼 전문" },
  "A_반려견":       { name: "반려견 행동 토크쇼 전문강사", company: "반려견 행동 토크쇼 전문" },
  "B_정미화":       { name: "정미화",       company: "푸드체험 공방" },
  "B_재료비":       { name: "재료비",       company: "4인 재료비 매수권" },
  "C_이은희":       { name: "이은희 작가",   company: "토탈아트" },
  "C_캐릭터솜사탕": { name: "캐릭터 솜사탕팀", company: "캐릭터 솜사탕 전문" },
  "D_이경희":       { name: "이경희 강사",   company: "산촌활성화종합지원센터" },
  "D_승마":         { name: "승마체험팀",   company: "괴산 승마장" },
  "D_사과따기":     { name: "사과 농장",     company: "괴산 사과농가 연계" },
  "D_보트":         { name: "산막이옛길 수상관광 운영처", company: "산막이옛길 수상관광" },
  "D_모터보트":     { name: "괴산호 수상관광 운영처",     company: "괴산호 수상관광" },
  "D_유람선":       { name: "괴산호 유람선 운영처",       company: "괴산호 유람선" },
  "D_자체":         { name: "캠프 자체행사", company: "캠프 자체" },
};

// ============================================================
// EVENT_META — 기존 코드 호환용 (cat·provider) + 확장 (catKey·instructorId)
// programs에서 자동 생성
// ============================================================
function buildEventMeta() {
  const meta = {};
  for (const catKey of ["A", "B", "C", "D"]) {
    for (const p of PROGRAMS[catKey]) {
      const inst = INSTRUCTOR_INFO[p.i] || {};
      meta[p.n] = {
        cat: CATEGORY_LABEL[catKey],
        catKey,
        provider: inst.name || p.i.split("_")[1] || p.i,
        company: inst.company || "",
        instructorId: p.i,
        pricing: p.p,
      };
    }
  }
  return meta;
}
export const EVENT_META = buildEventMeta();

// ============================================================
// 기본 캠프 (DB 비었을 때 폴백)
// ============================================================
export const ALL_CAMPS_DEFAULT = [
  { name: "가자우리집",      group_name: "1조 표준A" },
  { name: "솔베이",          group_name: "1조 표준A" },
  { name: "도명산",          group_name: "1조 표준A" },
  { name: "아빠의나무",      group_name: "2조 표준B" },
  { name: "시냇가",          group_name: "2조 표준B" },
  { name: "후평숲",          group_name: "2조 표준B" },
  { name: "해밀터",          group_name: "3조 표준C" },
  { name: "원탑",            group_name: "3조 표준C" },
  { name: "즐거운녀석들",    group_name: "3조 표준C" },
  { name: "따봄스테이",      group_name: "4조 따봄형" },
  { name: "모래재캠핑장",    group_name: "4조 따봄형" },
  { name: "자연애캠핑장",    group_name: "4조 따봄형" },
  { name: "루파니캠핑장",    group_name: "5조 C지원" },
  { name: "숲속의하모니",    group_name: "5조 C지원" },
  { name: "아이뜰캠핑장",    group_name: "5조 C지원" },
  { name: "운교랜드캠핑장",  group_name: "6조 AC형" },
  { name: "화양숲노리",      group_name: "6조 AC형" },
  { name: "그린비",          group_name: "6조 AC형" },
];

// 캠프 위치 (지도용, events.html에서 흡수)
export const CAMP_LOCATIONS = {
  "가자우리집":[36.681,127.830], "솔베이":[36.674,127.812], "도명산":[36.667,127.807],
  "아빠의나무":[36.719,127.795], "시냇가":[36.707,127.784], "후평숲":[36.730,127.808],
  "해밀터":[36.789,127.833], "원탑":[36.775,127.850], "즐거운녀석들":[36.762,127.842],
  "따봄스테이":[36.815,127.789], "모래재캠핑장":[36.765,127.655], "자연애캠핑장":[36.705,127.744],
  "루파니캠핑장":[36.733,127.916], "숲속의하모니":[36.786,127.909], "아이뜰캠핑장":[36.754,127.884],
  "운교랜드캠핑장":[36.653,127.755], "화양숲노리":[36.670,127.802], "그린비":[36.690,127.865],
};

// ============================================================
// 괴산여행 기본 콘텐츠
// ============================================================
export const DEFAULT_TRAVEL = [
  { title: "산막이옛길",   category: "관광지",       region: "칠성", address: "칠성면 산막이옛길 일원", lat: 36.7565, lng: 127.8336, summary: "괴산 대표 걷기 관광지" },
  { title: "괴산호",       category: "계곡·자연",   region: "칠성", address: "칠성면 괴산호 일원",     lat: 36.7601, lng: 127.8352, summary: "수변 관광 연계 코스" },
  { title: "화양구곡",     category: "계곡·자연",   region: "청천", address: "청천면 화양동 일원",     lat: 36.6655, lng: 127.8132, summary: "청천권 대표 자연 관광지" },
  { title: "쌍곡계곡",     category: "계곡·자연",   region: "칠성", address: "칠성면 쌍곡리 일원",     lat: 36.7495, lng: 127.8892, summary: "칠성권 계곡 관광지" },
];
