export const APP_VERSION = "GCA v5.0.1 · 행사 RLS/화면 수정";

export const SUPABASE_URL = "https://zzglzlbxslgojntcofez.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Z2x6bGJ4c2xnb2pudGNvZmV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NzUzMTAsImV4cCI6MjA5MjI1MTMxMH0.7wd78MoLgN2QSCFDitr3ZcJN3PI7UG8x1OkUbqwW3WQ";
export const STORAGE_BUCKET = "association-files";
export const ENARA_URL = "https://www.gosims.go.kr";
export const KAKAO_OPENCHAT_URL = "https://open.kakao.com/o/XXXXXX";
export const KAKAO_CHANNEL_URL = "http://pf.kakao.com/_XXXXXX";

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
};

export const ROLE_LABEL = {
  admin: "협회임원",
  member: "회원",
  provider: "업체/강사",
  vendor: "업체/강사",
  instructor: "업체/강사",
  county: "군청",
};

export const EVENT_META = {
  "풍선쇼": { cat: "공연", provider: "백선일" },
  "버블쇼": { cat: "공연", provider: "백선일" },
  "마술쇼": { cat: "공연", provider: "백선일" },
  "솜사탕쇼": { cat: "공연", provider: "백선일" },
  "레이저쇼": { cat: "공연", provider: "백선일" },
  "풍선매직쇼": { cat: "공연", provider: "신태호" },
  "가족캐리커쳐": { cat: "체험", provider: "이은희" },
  "페이스페인팅": { cat: "체험", provider: "이은희" },
  "헤나": { cat: "체험", provider: "이은희" },
  "캐릭터 솜사탕": { cat: "체험", provider: "캐릭터솜사탕" },
  "짚라인": { cat: "활동", provider: "이경희" },
  "소형유람선 1매": { cat: "활동", provider: "유람선" },
  "모터보트 2인 1매": { cat: "활동", provider: "모터보트" },
  "자체행사비": { cat: "활동", provider: "자체" },
};

export const DEFAULT_TRAVEL = [
  { title: "산막이옛길", category: "관광지", region: "칠성", address: "칠성면 산막이옛길 일원", lat: 36.7565, lng: 127.8336, summary: "괴산 대표 걷기 관광지" },
  { title: "괴산호", category: "계곡·자연", region: "칠성", address: "칠성면 괴산호 일원", lat: 36.7601, lng: 127.8352, summary: "수변 관광 연계 코스" },
  { title: "화양구곡", category: "계곡·자연", region: "청천", address: "청천면 화양동 일원", lat: 36.6655, lng: 127.8132, summary: "청천권 대표 자연 관광지" },
  { title: "쌍곡계곡", category: "계곡·자연", region: "칠성", address: "칠성면 쌍곡리 일원", lat: 36.7495, lng: 127.8892, summary: "칠성권 계곡 관광지" },
];
