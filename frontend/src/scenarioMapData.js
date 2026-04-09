const SCENARIO_MAPS = {
  "seoul-live-default": {
    title: "강남역에서 종로까지 대표 이동 경로",
    description:
      "강남역 출구 접근 후 2호선과 3호선을 갈아타 안국역까지 이동하고, 종로권 최종 접근까지 이어지는 기본 시나리오입니다.",
    center: [37.5336, 127.0019],
    zoom: 12,
    originLabel: "강남역 11번 출구",
    destinationLabel: "종로1가 공평도시유적전시관",
    boardStation: { label: "강남역 2호선 승강장", coords: [37.49796, 127.02759] },
    station: { label: "안국역 3호선 하차", coords: [37.57661, 126.98547] },
    exit: { label: "강남역 11번 출구", coords: [37.49886, 127.02914] },
    crossing: { label: "강남대로 횡단 지점", coords: [37.49845, 127.02843] },
    waitPoint: { label: "강남역 재계산 대기 지점", coords: [37.49818, 127.02792] },
    transitLineLabel: "2호선 강남역 -> 3호선 안국역",
    transitCorridor: [
      [37.49796, 127.02759],
      [37.49336, 127.01422],
      [37.50332, 127.00491],
      [37.51718, 126.98823],
      [37.52706, 126.99464],
      [37.54102, 127.00181],
      [37.55884, 126.99163],
      [37.56856, 126.97788],
      [37.57661, 126.98547],
    ],
    destinationAnchor: [37.57124, 126.98311],
    primaryDirectionLabel: "안국역 하차 후 종로권 진입",
    primaryDirectionNote:
      "강남역에서 탑승해 안국역에 내린 뒤 종로1가까지 마지막 도보를 이어가는 대표 발표용 동선입니다.",
    waitDirectionLabel: "강남역 대기 후 출발",
    waitDirectionNote:
      "강남역 횡단 전 대기 지점에서 다시 계산한 뒤, 신호에 맞춰 승강장으로 진입합니다.",
  },
  "jamsil-to-coex": {
    title: "잠실역에서 코엑스까지 이동 경로",
    description:
      "잠실역 출구 접근 후 2호선으로 삼성역까지 이동하고, 코엑스 동문까지 마지막 도보를 반영하는 시나리오입니다.",
    center: [37.5112, 127.0818],
    zoom: 13,
    originLabel: "잠실역 10번 출구",
    destinationLabel: "코엑스 동문",
    boardStation: { label: "잠실역 2호선 승강장", coords: [37.51329, 127.10016] },
    station: { label: "삼성역 2호선 하차", coords: [37.50884, 127.06316] },
    exit: { label: "잠실역 10번 출구", coords: [37.51216, 127.10227] },
    crossing: { label: "잠실역사거리 횡단 지점", coords: [37.51273, 127.10108] },
    waitPoint: { label: "잠실역 재계산 대기 지점", coords: [37.51298, 127.10002] },
    transitLineLabel: "2호선 잠실역 -> 삼성역",
    transitCorridor: [
      [37.51329, 127.10016],
      [37.51102, 127.08672],
      [37.51018, 127.07324],
      [37.50884, 127.06316],
    ],
    destinationAnchor: [37.51141, 127.05974],
    primaryDirectionLabel: "삼성역 하차 후 코엑스 진입",
    primaryDirectionNote:
      "잠실역에서 탑승해 삼성역에 내린 뒤 코엑스 동문까지 마지막 도보를 이어가는 업무지구형 경로입니다.",
    waitDirectionLabel: "잠실역 대기 후 출발",
    waitDirectionNote:
      "잠실역 재계산 대기 지점에서 다시 판단한 뒤, 가장 유리한 신호에 맞춰 승강장으로 이동합니다.",
  },
  "hongdae-to-deoksugung": {
    title: "홍대입구역에서 덕수궁까지 이동 경로",
    description:
      "홍대입구역 출구 접근 후 시청역까지 이동하고, 덕수궁 대한문 앞까지 걷는 문화권 시나리오입니다.",
    center: [37.5624, 126.9492],
    zoom: 12,
    originLabel: "홍대입구역 8번 출구",
    destinationLabel: "덕수궁 대한문 앞",
    boardStation: { label: "홍대입구역 2호선 승강장", coords: [37.55722, 126.92448] },
    station: { label: "시청역 2호선 하차", coords: [37.56577, 126.97698] },
    exit: { label: "홍대입구역 8번 출구", coords: [37.55803, 126.92332] },
    crossing: { label: "홍대입구역 앞 횡단 지점", coords: [37.55758, 126.92403] },
    waitPoint: { label: "홍대입구역 재계산 대기 지점", coords: [37.55729, 126.92361] },
    transitLineLabel: "2호선 홍대입구역 -> 시청역",
    transitCorridor: [
      [37.55722, 126.92448],
      [37.55872, 126.93573],
      [37.55986, 126.94526],
      [37.56095, 126.95628],
      [37.56218, 126.96687],
      [37.56388, 126.97254],
      [37.56577, 126.97698],
    ],
    destinationAnchor: [37.56868, 126.97341],
    primaryDirectionLabel: "시청역 하차 후 덕수궁 진입",
    primaryDirectionNote:
      "홍대입구역에서 탑승해 시청역에 내리고, 덕수궁 대한문 앞까지 도보로 이어지는 발표용 경로입니다.",
    waitDirectionLabel: "홍대입구역 대기 후 출발",
    waitDirectionNote:
      "홍대입구역 횡단 전 대기 지점에서 다시 판단한 뒤, 시청역 방면으로 이동합니다.",
  },
  "yeouido-to-gwanghwamun": {
    title: "여의도역에서 광화문광장까지 이동 경로",
    description:
      "여의도역 출구 접근 후 5호선으로 광화문역까지 이동하고, 광화문광장 북측까지 마지막 도보를 반영하는 시나리오입니다.",
    center: [37.5478, 126.9495],
    zoom: 11,
    originLabel: "여의도역 5번 출구",
    destinationLabel: "광화문광장 북측",
    boardStation: { label: "여의도역 5호선 승강장", coords: [37.52169, 126.92432] },
    station: { label: "광화문역 5호선 하차", coords: [37.57156, 126.97679] },
    exit: { label: "여의도역 5번 출구", coords: [37.52208, 126.92462] },
    crossing: { label: "여의도역 앞 횡단 지점", coords: [37.52222, 126.92539] },
    waitPoint: { label: "여의도역 재계산 대기 지점", coords: [37.52201, 126.92501] },
    transitLineLabel: "5호선 여의도역 -> 광화문역",
    transitCorridor: [
      [37.52169, 126.92432],
      [37.5243, 126.9384],
      [37.5308, 126.9475],
      [37.5419, 126.9558],
      [37.5534, 126.9638],
      [37.5635, 126.9708],
      [37.57156, 126.97679],
    ],
    destinationAnchor: [37.57586, 126.97699],
    primaryDirectionLabel: "광화문역 하차 후 광화문광장 진입",
    primaryDirectionNote:
      "여의도역에서 탑승해 광화문역에 내린 뒤, 광화문광장 북측까지 마지막 도보를 이어가는 도심 업무형 경로입니다.",
    waitDirectionLabel: "여의도역 대기 후 출발",
    waitDirectionNote:
      "여의도역 횡단 전 대기 지점에서 다시 계산한 뒤, 가장 유리한 신호에 맞춰 승강장으로 이동합니다.",
  },
  "sadang-to-seoul-station": {
    title: "사당역에서 서울역까지 이동 경로",
    description:
      "사당역 출구 접근 후 4호선으로 서울역까지 이동하고, 서울역 서부역까지 마지막 도보를 반영하는 시나리오입니다.",
    center: [37.5188, 126.9765],
    zoom: 11,
    originLabel: "사당역 10번 출구",
    destinationLabel: "서울역 서부역",
    boardStation: { label: "사당역 4호선 승강장", coords: [37.47657, 126.98167] },
    station: { label: "서울역 4호선 하차", coords: [37.55634, 126.97225] },
    exit: { label: "사당역 10번 출구", coords: [37.47618, 126.98195] },
    crossing: { label: "사당역 앞 횡단 지점", coords: [37.47638, 126.98248] },
    waitPoint: { label: "사당역 재계산 대기 지점", coords: [37.47627, 126.98217] },
    transitLineLabel: "4호선 사당역 -> 서울역",
    transitCorridor: [
      [37.47657, 126.98167],
      [37.4879, 126.9822],
      [37.5018, 126.9874],
      [37.5172, 126.9818],
      [37.5332, 126.9728],
      [37.5458, 126.9717],
      [37.55634, 126.97225],
    ],
    destinationAnchor: [37.55512, 126.96876],
    primaryDirectionLabel: "서울역 하차 후 서부역 진입",
    primaryDirectionNote:
      "사당역에서 탑승해 서울역에 내린 뒤, 서부역까지 마지막 도보를 이어가는 장거리 통근형 경로입니다.",
    waitDirectionLabel: "사당역 대기 후 출발",
    waitDirectionNote:
      "사당역 횡단 전 대기 지점에서 다시 판단한 뒤, 가장 안정적인 신호 타이밍으로 승강장에 진입합니다.",
  },
  "seongsu-to-sports-complex": {
    title: "성수역에서 잠실종합운동장까지 이동 경로",
    description:
      "성수역 출구 접근 후 2호선으로 종합운동장역까지 이동하고, 경기장까지 마지막 도보를 반영하는 시나리오입니다.",
    center: [37.5282, 127.0657],
    zoom: 12,
    originLabel: "성수역 3번 출구",
    destinationLabel: "잠실종합운동장 주경기장",
    boardStation: { label: "성수역 2호선 승강장", coords: [37.54462, 127.05596] },
    station: { label: "종합운동장역 2호선 하차", coords: [37.51113, 127.07394] },
    exit: { label: "성수역 3번 출구", coords: [37.54496, 127.05688] },
    crossing: { label: "성수역 앞 횡단 지점", coords: [37.54476, 127.05628] },
    waitPoint: { label: "성수역 재계산 대기 지점", coords: [37.54455, 127.05592] },
    transitLineLabel: "2호선 성수역 -> 종합운동장역",
    transitCorridor: [
      [37.54462, 127.05596],
      [37.5398, 127.0582],
      [37.5342, 127.0614],
      [37.5291, 127.0649],
      [37.5238, 127.0681],
      [37.5179, 127.0712],
      [37.51113, 127.07394],
    ],
    destinationAnchor: [37.51493, 127.07262],
    primaryDirectionLabel: "종합운동장역 하차 후 경기장 진입",
    primaryDirectionNote:
      "성수역에서 탑승해 종합운동장역에 내린 뒤, 주경기장까지 마지막 도보를 이어가는 행사형 경로입니다.",
    waitDirectionLabel: "성수역 대기 후 출발",
    waitDirectionNote:
      "성수역 횡단 전 대기 지점에서 다시 계산한 뒤, 가장 유리한 신호 타이밍으로 승강장에 이동합니다.",
  },
};

export function getScenarioMapScene(scenarioId) {
  return SCENARIO_MAPS[scenarioId] || SCENARIO_MAPS["seoul-live-default"];
}

function toCoords(placeLike, fallbackCoords) {
  if (!placeLike) return fallbackCoords;
  if (Array.isArray(placeLike.coords)) return placeLike.coords;
  const lat = Number(placeLike.y);
  const lng = Number(placeLike.x);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  return fallbackCoords;
}

function blendCoords(a, b, ratio) {
  return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
}

function averageCoords(points) {
  const valid = points.filter((coords) => Array.isArray(coords) && coords.length === 2);
  const total = valid.reduce(
    (acc, coords) => {
      acc[0] += coords[0];
      acc[1] += coords[1];
      return acc;
    },
    [0, 0],
  );
  return [total[0] / valid.length, total[1] / valid.length];
}

function buildAdaptiveCrossing(baseScene, originCoords, destinationCoords) {
  const midpoint = averageCoords([originCoords, destinationCoords]);
  const guidedMidpoint = blendCoords(midpoint, baseScene.crossing.coords, 0.35);
  return blendCoords(originCoords, guidedMidpoint, 0.62);
}

function buildAdaptiveWaitPoint(baseScene, originCoords, crossingCoords) {
  const waitSeed = blendCoords(originCoords, crossingCoords, 0.36);
  return blendCoords(waitSeed, baseScene.waitPoint.coords, 0.32);
}

function isStationPlace(placeLike) {
  const text = [placeLike?.placeName, placeLike?.categoryName, placeLike?.roadAddressName]
    .filter(Boolean)
    .join(" ");
  return /지하철|역/.test(text);
}

export function dedupePath(points) {
  return points.filter((coords, index, array) => {
    if (!Array.isArray(coords)) return false;
    const previous = array[index - 1];
    if (!previous) return true;
    return previous[0] !== coords[0] || previous[1] !== coords[1];
  });
}

function corridorPath(baseScene, startCoords, endCoords) {
  const corridor = baseScene.transitCorridor || [startCoords, endCoords];
  const middle = corridor.slice(1, -1);
  return dedupePath([startCoords, ...middle, endCoords]);
}

function flattenSegments(segments) {
  return dedupePath(segments.flatMap((segment) => segment.path));
}

function buildLocalSegments(scene, originPoint, destinationPoint, crossing, waitPoint) {
  const directDestination = scene.station.coords;
  return {
    journeySegments: [
      {
        id: "walk-direct",
        kind: "walk",
        title: "1구간 도보",
        summary: `${originPoint.label} -> ${scene.station.label}`,
        path: dedupePath([originPoint.coords, scene.exit.coords, crossing.coords, directDestination]),
      },
    ],
    waitJourneySegments: [
      {
        id: "walk-wait",
        kind: "walk",
        title: "1구간 도보",
        summary: `${originPoint.label} -> ${scene.waitPoint.label}`,
        path: dedupePath([originPoint.coords, scene.exit.coords, waitPoint.coords]),
      },
      {
        id: "walk-station",
        kind: "walk",
        title: "2구간 도보",
        summary: `${scene.waitPoint.label} -> ${scene.station.label}`,
        path: dedupePath([waitPoint.coords, crossing.coords, directDestination]),
      },
    ],
    destinationPoint,
  };
}

export function buildPlannerScene(scenarioId, planner = {}) {
  const baseScene = getScenarioMapScene(scenarioId);
  const defaultDestination = baseScene.destinationAnchor || baseScene.station.coords;
  const originCoords = toCoords(planner.originPlace, baseScene.exit.coords);
  const destinationCoords = toCoords(planner.destinationPlace, defaultDestination);
  const destinationIsStation = isStationPlace(planner.destinationPlace);

  const crossingCoords =
    planner.originPlace || planner.destinationPlace
      ? buildAdaptiveCrossing(
          baseScene,
          baseScene.exit.coords,
          destinationIsStation ? destinationCoords : baseScene.station.coords,
        )
      : baseScene.crossing.coords;

  const waitCoords =
    planner.originPlace || planner.destinationPlace
      ? buildAdaptiveWaitPoint(baseScene, originCoords, crossingCoords)
      : baseScene.waitPoint.coords;

  const originPoint = {
    label: planner.originPlace?.placeName || planner.originPlace?.label || baseScene.originLabel || baseScene.exit.label,
    coords: originCoords,
  };

  const destinationPoint = {
    label:
      planner.destinationPlace?.placeName ||
      planner.destinationPlace?.label ||
      baseScene.destinationLabel ||
      baseScene.station.label,
    coords: destinationCoords,
  };

  const boardStation = baseScene.boardStation ? { ...baseScene.boardStation } : null;

  const station = {
    ...baseScene.station,
    label: destinationIsStation ? destinationPoint.label : baseScene.station.label,
    coords: destinationIsStation ? destinationCoords : baseScene.station.coords,
  };

  const scene = {
    ...baseScene,
    originPoint,
    destinationPoint,
    exit: {
      ...baseScene.exit,
      coords: planner.originPlace ? originCoords : baseScene.exit.coords,
    },
    boardStation,
    station,
    crossing: {
      ...baseScene.crossing,
      coords: crossingCoords,
    },
    waitPoint: {
      ...baseScene.waitPoint,
      coords: waitCoords,
    },
  };

  let journeySegments = [];
  let waitJourneySegments = [];

  if (scene.boardStation) {
    const finalDestination = destinationIsStation ? station.coords : destinationPoint.coords;
    journeySegments = [
      {
        id: "walk-start",
        kind: "walk",
        title: "1구간 도보",
        summary: `${originPoint.label} -> ${scene.boardStation.label}`,
        path: dedupePath([originPoint.coords, scene.exit.coords, scene.crossing.coords, scene.boardStation.coords]),
      },
      {
        id: "subway-main",
        kind: "transit",
        title: "2구간 지하철",
        summary: `${scene.boardStation.label} -> ${scene.station.label}`,
        lineLabel: scene.transitLineLabel || "지하철",
        path: corridorPath(scene, scene.boardStation.coords, scene.station.coords),
      },
      {
        id: "walk-end",
        kind: "walk",
        title: "3구간 도보",
        summary: `${scene.station.label} -> ${destinationPoint.label}`,
        path: dedupePath([scene.station.coords, finalDestination]),
      },
    ];

    waitJourneySegments = [
      {
        id: "walk-wait",
        kind: "walk",
        title: "1구간 도보",
        summary: `${originPoint.label} -> ${scene.waitPoint.label}`,
        path: dedupePath([originPoint.coords, scene.exit.coords, scene.waitPoint.coords]),
      },
      {
        id: "walk-board",
        kind: "walk",
        title: "2구간 도보",
        summary: `${scene.waitPoint.label} -> ${scene.boardStation.label}`,
        path: dedupePath([scene.waitPoint.coords, scene.crossing.coords, scene.boardStation.coords]),
      },
      {
        id: "subway-main",
        kind: "transit",
        title: "3구간 지하철",
        summary: `${scene.boardStation.label} -> ${scene.station.label}`,
        lineLabel: scene.transitLineLabel || "지하철",
        path: corridorPath(scene, scene.boardStation.coords, scene.station.coords),
      },
      {
        id: "walk-end",
        kind: "walk",
        title: "4구간 도보",
        summary: `${scene.station.label} -> ${destinationPoint.label}`,
        path: dedupePath([scene.station.coords, finalDestination]),
      },
    ];
  } else {
    const local = buildLocalSegments(scene, originPoint, destinationPoint, scene.crossing, scene.waitPoint);
    journeySegments = local.journeySegments;
    waitJourneySegments = local.waitJourneySegments;
  }

  return {
    ...scene,
    center: averageCoords(flattenSegments([...journeySegments, ...waitJourneySegments])),
    journeySegments,
    waitJourneySegments,
    primaryPath: flattenSegments(journeySegments),
    waitPath: flattenSegments(waitJourneySegments),
  };
}
