import assert from "node:assert/strict";
import { isEditorPreviewAccount } from "../lib/landing/editor-preview";

const saved = process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS;
delete process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS;
// 기본 목록: 운영자 계정과 원가 측정용 테스트 계정만(대소문자·공백 무시)
assert.equal(isEditorPreviewAccount("rena35200@gmail.com"), true);
assert.equal(isEditorPreviewAccount(" Rena35200+Test@gmail.com "), true);
assert.equal(isEditorPreviewAccount("someone@example.com"), false);
assert.equal(isEditorPreviewAccount(null), false);
// 환경변수로 목록을 바꾸면 기본 목록은 쓰지 않는다
process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS = "qa@example.com, second@example.com";
assert.equal(isEditorPreviewAccount("second@example.com"), true);
assert.equal(isEditorPreviewAccount("rena35200+test@gmail.com"), false);
if (saved === undefined) delete process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS; else process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS = saved;

console.log(JSON.stringify({ passed: 6 }));
