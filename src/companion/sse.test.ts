import { describe, expect, it } from "vitest";
import { createSseParser } from "./sse";

describe("createSseParser", () => {
  it("跨 chunk 的事件也能拼回来，且保持顺序", () => {
    const seen: Array<{ event: string; data: string }> = [];
    const parser = createSseParser((e) => seen.push(e));
    parser.push('event: sentence\ndata: {"index":0,"te');
    parser.push('xt":"你好"}\n\nevent: token\ndata: {"t":"好"}\n\nevent: do');
    parser.push('ne\ndata: {"text":"你好"}\n\n');
    parser.flush();
    expect(seen.map((e) => e.event)).toEqual(["sentence", "token", "done"]);
    expect(JSON.parse(seen[0].data)).toEqual({ index: 0, text: "你好" });
  });

  it("CRLF、注释行、无 event 字段都按规范处理", () => {
    const seen: Array<{ event: string; data: string }> = [];
    const parser = createSseParser((e) => seen.push(e));
    parser.push(": keep-alive\r\n\r\ndata: a\r\ndata: b\r\n\r\n");
    expect(seen).toEqual([{ event: "message", data: "a\nb" }]);
  });
});
