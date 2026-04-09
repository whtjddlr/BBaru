# SafeETA Lite

서울 생활권을 기준으로 `신호등 + 지하철 + 서울 도시데이터`를 결합해
지금 이동해도 되는지 판단하는 공모전용 MVP입니다.

버스는 백엔드 연동 구조와 엔드포인트가 준비되어 있고,
인증 가능한 버스 키만 추가되면 같은 화면에 바로 붙일 수 있습니다.

## 실행

### 백엔드

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --reload
```

### 프론트엔드

```powershell
cd frontend
npm install
npm run build
```

모바일 앱 래핑:

```powershell
cd frontend
Copy-Item .env.example .env
# 필요하면 VITE_SAFEETA_API_BASE_URL=http://백엔드주소:8000 설정
npm run cap:android
```

브라우저:

```text
http://127.0.0.1:8000
```

개발 중 프론트만 따로 확인하려면:

```powershell
cd frontend
npm run dev
```

모바일 앱 빌드에서는 `frontend/.env`를 사용합니다.

```env
VITE_SAFEETA_API_BASE_URL=http://127.0.0.1:8000
```

실기기에서는 `127.0.0.1` 대신 같은 네트워크에서 접근 가능한 백엔드 주소를 넣어야 합니다.

## 주요 환경변수

```env
SAFEETA_SERVICE_KEY=
SAFEETA_SERVICE_KEY_ENCODED=
SAFEETA_JOURNEY_DB_PATH=C:\Users\SSAFY\Desktop\legend\data\safeeta.db
SAFEETA_SEOUL_OPENAPI_KEY=
SAFEETA_SEOUL_SUBWAY_OPENAPI_KEY=
SAFEETA_SEOUL_BUS_OPENAPI_KEY=
SAFEETA_TMAP_TRANSIT_APP_KEY=
SAFEETA_TMAP_TRANSIT_ROUTES_DAILY_LIMIT=10
SAFEETA_TMAP_TRANSIT_SUMMARY_DAILY_LIMIT=10
SAFEETA_TMAP_STATISTICAL_CONGESTION_DAILY_LIMIT=2
SAFEETA_SEOUL_DEFAULT_AREA_NAME=광화문·덕수궁
SAFEETA_SEOUL_DEFAULT_STATION_NAME=시청
SAFEETA_SEOUL_DEFAULT_LINE_NAME=2호선
```

## 주요 API

- `GET /api/scenarios`
- `POST /api/evaluate`
- `POST /api/journey/sessions`
- `GET /api/journey/sessions/{session_id}`
- `POST /api/journey/sessions/{session_id}/advance`
- `GET /api/live/blueprint`
- `POST /api/live/signal-directions`
- `POST /api/live/seoul-citydata`
- `POST /api/live/seoul-subway-arrivals`
- `POST /api/live/seoul-bus-positions`
- `POST /api/live/seoul-bus-arrivals`
- `POST /api/live/seoul-bus-station`
- `POST /api/routes/transit`
- `GET /api/tmap/dataset`
- `POST /api/live/seoul-combined`
- `POST /api/live/bundle`

## 현재 구조

- 필수 공모전 데이터: `KLID 신호등`
- 핵심 실시간 판단: `서울 지하철`
- 지역 컨텍스트: `서울 실시간 도시데이터`
- 버스: `busRouteId`, `arsId`, 서울 버스용 인증키를 받으면 바로 연결 가능`

## 비고

- 서울 도시데이터는 환경에 따라 타임아웃이 발생할 수 있어 일부 값은 fallback 됩니다.
- 지하철 API는 역 조건에 따라 실시간 항목이 비어 있을 수 있어 기본 ETA를 보정해 사용합니다.
- 프론트엔드는 `frontend` 폴더의 Vite React 앱을 빌드한 결과물을 FastAPI가 서빙합니다.
- `frontend`는 Capacitor 기반 안드로이드 앱으로 그대로 래핑할 수 있게 구성했습니다.
