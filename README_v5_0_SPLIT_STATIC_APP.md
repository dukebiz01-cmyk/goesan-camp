# GCA v5.0 · 분리형 정적앱 구조

## 먼저 해야 할 일
1. `GCA_v5_0_DB_HARDENING_BASELINE.sql` 적용 완료
2. 기존 v4.33 앱에서 로그인/업로드/회원관리 기본 확인
3. 그 다음 이 v5.0 파일 묶음을 정적 호스팅에 업로드

## 파일 구조
- `index.html` : 화면 뼈대, 페이지 컨테이너, script import
- `css/app.css` : 전체 디자인, 모바일/PC 반응형
- `js/config.js` : Supabase URL, anon key, 앱 버전, 상수
- `js/supabase.js` : Supabase client, timeout, RPC
- `js/auth.js` : 로그인, 로그아웃, 세션, 가입신청
- `js/router.js` : MY / 공지 / 투표 / 정보 / 관리 라우팅
- `js/my.js` : 내 캠핑장 행사, 보조사업 서류함, e나라도움
- `js/notices.js` : 공지 목록/작성/삭제
- `js/votes.js` : 안건 목록/등록/투표/삭제
- `js/info.js` : 캠핑장 정보, 행사업체, 국가지원금, 괴산여행, 협회자료
- `js/map.js` : Leaflet 지도, 회원/비회원 캠핑장, 관광지
- `js/uploads.js` : Storage 업로드, attachments 기록, signed URL
- `js/admin.js` : 회원등록, 가입신청 승인, 회원정지/삭제
- `js/utils.js` : 공통 helper

## 주의
- 이 버전은 v5 분리형 구조의 기준본입니다.
- v4 단일 HTML의 모든 디테일 UI를 100% 복제하기보다, 기능을 모듈별로 재구성했습니다.
- 다음 단계는 각 모듈별 버그를 작게 검수하면서 확장하는 것입니다.
