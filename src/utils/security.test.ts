/**
 * 前端安全回归测试。
 * 这两个函数都是"改回去也不报错"的类型：去掉一个分支，功能测试全绿，
 * 只有开放重定向 / XSS 会悄悄回来。
 */
import { describe, expect, test } from "vitest";
import { safeNext } from "./safeNext";
import { normalizeSafeUrl } from "./siteDraft";

describe("safeNext（登录后跳转 · 开放重定向）", () => {
  test.each([
    ["协议相对 URL", "//evil.com"],
    ["反斜杠变体", "/\\evil.com"],
    ["绝对 URL", "https://evil.com"],
    ["javascript 伪协议", "javascript:alert(1)"],
    ["制表符绕过", "/\t/evil.com"],
    ["换行绕过", "/\n/evil.com"],
  ])("%s 被打回首页", (_label, input) => {
    expect(safeNext(input)).toBe("/");
  });

  test.each(["/ideas", "/me", "/groups/abc?x=1"])("站内路径 %s 正常保留", (p) => {
    expect(safeNext(p)).toBe(p);
  });

  test("回跳 auth 页会造成死循环，打回首页", () => {
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/register")).toBe("/");
  });
});

describe("normalizeSafeUrl（外链协议白名单）", () => {
  test.each([
    ["javascript 伪协议", "javascript:alert(1)"],
    ["大小写混淆", "JaVaScRiPt:alert(1)"],
    ["data URL", "data:text/html,<script>alert(1)</script>"],
    ["vbscript", "vbscript:msgbox(1)"],
    ["file", "file:///etc/passwd"],
    ["协议相对", "//evil.com"],
  ])("%s 返回空串", (_label, input) => {
    expect(normalizeSafeUrl(input)).toBe("");
  });

  test.each(["https://example.com/", "http://example.com/"])("%s 正常放行", (u) => {
    expect(normalizeSafeUrl(u)).not.toBe("");
  });

  test("站内绝对路径放行", () => {
    expect(normalizeSafeUrl("/ideas/123")).toBe("/ideas/123");
  });
});
