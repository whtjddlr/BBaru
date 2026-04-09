# 샘플 데이터 넣는 위치

## 1. API 키

`.env` 파일에 아래처럼 넣으면 됩니다.

```env
SAFEETA_MODE=mock
SAFEETA_SERVICE_KEY=여기에_디코딩된_일반인증키
```

## 5. TMAP ?꾨줈?좎??낅뜑 ?곗씠???고룿??

TMAP ?몄텧 ?쇱닔媛 ?묒쑝硫?寃쎈줈留??섏냽 ?몄텧?섎뒗 寃껋쓣 ?꾨줈?좎? 湲곕컲 ?곗씠?곗쭊 ???낅땲???꾨옒 ?뚯뒪?몃? ?뚭퀬 ?낅뜑 諛⑹떇?쇰줈 吏꾪뻾?섏꽭??.

- `tmap/routes`
- `tmap/train_congestion`
- `tmap/car_congestion`
- `tmap/alighting_ratio`

?곸꽭 ?섏쭅??`sample_data/tmap/README.md`瑜??고뒪硫???二쇱꽭??.

실데이터 테스트를 시작할 때는 `SAFEETA_MODE=live`로 바꿔도 되고, 처음엔 `mock`으로 둔 채 키만 넣어도 괜찮습니다.

## 2. 버스 데이터 샘플

아래 파일명으로 넣어주면 제가 바로 연결 작업을 이어갈 수 있습니다.

- `bus_route_info.json`
- `bus_route_stops.json`
- `bus_positions.json`

JSON이 아니라 XML이면 아래 이름으로 넣어도 됩니다.

- `bus_route_info.xml`
- `bus_route_stops.xml`
- `bus_positions.xml`

## 3. 신호등 데이터 샘플

있으면 같이 넣어주세요.

- `signal_intersection_info.json`
- `signal_remaining_time.json`

또는 XML:

- `signal_intersection_info.xml`
- `signal_remaining_time.xml`

## 4. 엔드포인트 메모

실제 호출 주소나 파라미터를 알고 있으면 아래 파일에 적어주세요.

- `api_notes.txt`

예시:

```txt
노선 기본정보: /some/path/routeInfo
노선 경유지: /some/path/routeStops
실시간 위치: /some/path/busPositions
필수 파라미터: cityCode, routeId
```
