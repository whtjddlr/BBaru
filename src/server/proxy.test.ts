import { describe, expect, it } from "vitest";
import {
  createSignalUpstreamUrl,
  ProxyHttpError,
  validatePoiQuery,
  validateSignalQuery,
  validateTransitBody,
} from "../../api/_lib/proxy.js";

describe("proxy request validation", () => {
  it("normalizes POI query input", () => {
    expect(validatePoiQuery({ q: "  강남역  " })).toEqual({
      q: "강남역",
      count: 5,
    });
    expect(validatePoiQuery({ q: "강남역", count: "3" })).toEqual({
      q: "강남역",
      count: 3,
    });
  });

  it("rejects invalid POI query input", () => {
    expect(() => validatePoiQuery({ q: "" })).toThrow(ProxyHttpError);
    expect(() => validatePoiQuery({ q: "가".repeat(81) })).toThrow(ProxyHttpError);
    expect(() => validatePoiQuery({ q: "강남역", count: "0" })).toThrow(ProxyHttpError);
  });

  it("validates transit route body and supports JSON strings", () => {
    expect(
      validateTransitBody(JSON.stringify({
        startX: 127.027619,
        startY: 37.497952,
        endX: 127.048957,
        endY: 37.504503,
      })),
    ).toEqual({
      startX: 127.027619,
      startY: 37.497952,
      endX: 127.048957,
      endY: 37.504503,
      count: 3,
    });

    expect(
      validateTransitBody(new TextEncoder().encode(JSON.stringify({
        startX: 127.027619,
        startY: 37.497952,
        endX: 127.048957,
        endY: 37.504503,
        count: 2,
      }))),
    ).toEqual({
      startX: 127.027619,
      startY: 37.497952,
      endX: 127.048957,
      endY: 37.504503,
      count: 2,
    });
  });

  it("rejects invalid transit route body values", () => {
    expect(() => validateTransitBody({ startX: 181, startY: 37, endX: 127, endY: 37 })).toThrow(ProxyHttpError);
    expect(() => validateTransitBody({ startX: 127, startY: 91, endX: 127, endY: 37 })).toThrow(ProxyHttpError);
    expect(() => validateTransitBody({ startX: 127, startY: 37, endX: 127, endY: 37, count: 9 })).toThrow(ProxyHttpError);
    expect(() => validateTransitBody("{")).toThrow(ProxyHttpError);
  });

  it("defaults and validates signal query input", () => {
    expect(validateSignalQuery()).toEqual({
      pageNo: "1",
      numOfRows: "1000",
      stdgCd: "1100000000",
    });
    expect(validateSignalQuery({ pageNo: "2", numOfRows: "3000", stdgCd: "1100000000" })).toEqual({
      pageNo: "2",
      numOfRows: "3000",
      stdgCd: "1100000000",
    });
  });

  it("rejects invalid signal query input", () => {
    expect(() => validateSignalQuery({ pageNo: "0" })).toThrow(ProxyHttpError);
    expect(() => validateSignalQuery({ numOfRows: "3001" })).toThrow(ProxyHttpError);
    expect(() => validateSignalQuery({ stdgCd: "seoul" })).toThrow(ProxyHttpError);
  });

  it("creates 공공데이터 upstream URLs without double-encoding service keys", () => {
    const rawKeyUrl = createSignalUpstreamUrl(
      "tl_drct_info",
      { pageNo: "1", numOfRows: "1000", stdgCd: "1100000000" },
      "abc+def/ghi",
    );
    const encodedKeyUrl = createSignalUpstreamUrl(
      "crsrd_map_info",
      { pageNo: "1", numOfRows: "1000", stdgCd: "1100000000" },
      "abc%2Bdef%2Fghi",
    );

    expect(rawKeyUrl).toContain("serviceKey=abc%2Bdef%2Fghi");
    expect(encodedKeyUrl).toContain("serviceKey=abc%2Bdef%2Fghi");
    expect(encodedKeyUrl).not.toContain("%252B");
    expect(rawKeyUrl).toContain("type=json");
  });
});
