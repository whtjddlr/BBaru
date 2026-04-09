TMAP sample dataset folder

Use the daily quotas to collect a balanced prototype dataset instead of spending every call on route search only.

Daily quotas:
- `routes`: `10/day`
- `summary`: `10/day`
- `statistical congestion`: `2/day`

Interpretation used in this prototype:
- `routes` uses the public transit route search bucket.
- `train_congestion`, `car_congestion`, and `alighting_ratio` share the same `statistical congestion` bucket.

Recommended collection split for one prototype cycle:
- `routes`: 4
- `train_congestion`: 1
- `car_congestion`: 1
- `alighting_ratio`: 0~1

Folder layout:
- `sample_data/tmap/routes`
- `sample_data/tmap/train_congestion`
- `sample_data/tmap/car_congestion`
- `sample_data/tmap/alighting_ratio`

Recommended filenames:
- `route_gangnam_to_jongno_01.json`
- `route_gwanghwamun_to_cityhall_01.json`
- `route_jamsil_to_hongdae_01.json`
- `train_congestion_cityhall_line2_0810.json`
- `train_congestion_gangnam_line2_1830.json`
- `train_congestion_jamsil_line2_2230.json`
- `car_congestion_cityhall_line2_0810.json`
- `car_congestion_gangnam_line2_1830.json`
- `alighting_ratio_cityhall_line2_0810.json`
- `alighting_ratio_jonggak_line1_0830.json`

Prototype strategy:
- Use `routes` for total distance, walk distance, transfer count, and leg structure.
- Use `train_congestion` for departure recommendation and crowd-risk weighting.
- Use `car_congestion` for coach recommendation.
- Use `alighting_ratio` for exit-side / transfer-side recommendation.

The app exposes `GET /api/tmap/dataset` to inspect what has been collected so far.
