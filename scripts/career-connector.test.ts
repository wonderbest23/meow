import assert from "node:assert/strict";
import { parseWork24CareerXml } from "../lib/careers/work24";

const parsed = parseWork24CareerXml(`<?xml version="1.0" encoding="UTF-8"?>
<jobsList><total>2</total><jobList><jobClcd>01</jobClcd><jobClcdNM>경영</jobClcdNM><jobCd>1001</jobCd><jobNm>경영 컨설턴트</jobNm></jobList><jobList><jobClcd>02</jobClcd><jobClcdNM>정보통신</jobClcdNM><jobCd>2002</jobCd><jobNm>데이터 분석가</jobNm></jobList></jobsList>`);

assert.equal(parsed.total, 2);
assert.deepEqual(parsed.jobs.map((job) => job.name), ["경영 컨설턴트", "데이터 분석가"]);
assert.equal(parsed.jobs[1].jobCode, "2002");

console.log("career-connector.test.ts passed");
