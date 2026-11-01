// 抽取 timebar 的 @rules-begin/@rules-end 内联规则块，并做两类断言：
//   A. 定点行为断言（窗口边界 / 调休 / 未知年份）
//   B. 全量交叉核对：把《国务院办公厅关于2026年部分节假日安排的通知》
//      （国办发明电〔2025〕7号）原文编码为独立区间表，对 2026 年全年逐日比对。
// 测的正是 lib/client.js 里实际发货的那段代码。
// 用法：node scripts/verify-rules.cjs
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "lib", "client.js");
const src = fs.readFileSync(SRC, "utf8");

const m = src.match(/\/\/ @rules-begin[^\n]*\n([\s\S]*?)\/\/ @rules-end/);
if (!m) {
	console.error("FAIL: 未找到 @rules-begin/@rules-end 标记区");
	process.exit(1);
}
const block = m[1] + "\nglobalThis.__R = { PEAK, KNOWN_YEARS, MAKEUP_WORKDAYS, classify, bandSegments, isHoliday, isWeekendDay, dateKey };\n";

const ctx = {};
vm.createContext(ctx);
try {
	vm.runInContext(block, ctx, { filename: "rules-block.js" });
} catch (e) {
	console.error("FAIL: 规则块执行异常 -> " + e.message);
	process.exit(1);
}
const R = ctx.__R;

let pass = 0;
let fail = 0;
const failures = [];
function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		pass++;
	} else {
		fail++;
		failures.push(label + "  expected=" + JSON.stringify(expected) + " got=" + JSON.stringify(actual));
	}
}
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0);
const state = (y, mo, d, h, mi) => {
	const c = R.classify(at(y, mo, d, h, mi));
	return c.reason + (c.inPeak ? "/PEAK" : "/off");
};
function section(t) {
	console.log("\n" + t);
}

// ───────────────────────── A. 定点断言 ─────────────────────────
console.log("规则块抽取成功（" + block.length + " 字符），开始断言：\n");

section("[A1] 国庆长假（10-01 周四 ~ 10-07 周三）：全天按空闲");
[[1, 9, 30], [1, 15, 0], [3, 10, 0], [7, 16, 0], [7, 23, 59]].forEach(([d, h, mi]) => {
	check("2026-10-" + String(d).padStart(2, "0") + " " + h + ":" + String(mi).padStart(2, "0"), state(2026, 10, d, h, mi), "holiday/off");
});

section("[A2] 中秋假期（09-25 ~ 09-27，含周五 09-25）");
[[25, 10, 0], [26, 15, 0], [27, 20, 0]].forEach(([d, h, mi]) => {
	check("2026-09-" + d + " " + h + ":00", state(2026, 9, d, h, mi), "holiday/off");
});

section("[A3] 春节 9 天（02-15 ~ 02-23）：含关键的两天 02-22 周日 / 02-23 周一");
[[15, 10, 0], [17, 10, 0], [22, 10, 0], [23, 10, 0], [23, 15, 0]].forEach(([d, h, mi]) => {
	check("2026-02-" + d + " " + h + ":00", state(2026, 2, d, h, mi), "holiday/off");
});
check("2026-02-24 周二 10:00（假期后首个工作日）", state(2026, 2, 24, 10, 0), "peak/PEAK");

section("[A4] 6 个调休上班日：全部按空闲价");
[[1, 4], [2, 14], [2, 28], [5, 9], [9, 20], [10, 10]].forEach(([mo, d]) => {
	check("2026-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0") + " 10:00", state(2026, mo, d, 10, 0), "makeup/off");
});

section("[A5] 普通周末：全天空闲");
check("2026-10-11 周日 10:00", state(2026, 10, 11, 10, 0), "weekend/off");
check("2026-10-17 周六 16:00", state(2026, 10, 17, 16, 0), "weekend/off");

section("[A6] 工作日高峰窗口边界（09-30 周三 / 10-08 周四）");
check("08:59", state(2026, 9, 30, 8, 59), "offpeak/off");
check("09:00", state(2026, 9, 30, 9, 0), "peak/PEAK");
check("11:59", state(2026, 9, 30, 11, 59), "peak/PEAK");
check("12:00", state(2026, 9, 30, 12, 0), "offpeak/off");
check("13:59", state(2026, 9, 30, 13, 59), "offpeak/off");
check("14:00", state(2026, 9, 30, 14, 0), "peak/PEAK");
check("17:59", state(2026, 9, 30, 17, 59), "peak/PEAK");
check("18:00", state(2026, 9, 30, 18, 0), "offpeak/off");
check("23:27", state(2026, 9, 30, 23, 27), "offpeak/off");
check("10-08 周四 09:30（假期后首个高峰）", state(2026, 10, 8, 9, 30), "peak/PEAK");

section("[A7] 其他法定节假日落到工作日");
check("2026-01-01 周四 元旦 10:00", state(2026, 1, 1, 10, 0), "holiday/off");
check("2026-05-01 周五 劳动节 10:00", state(2026, 5, 1, 10, 0), "holiday/off");
check("2026-04-06 周一 清明 10:00", state(2026, 4, 6, 10, 0), "holiday/off");
check("2026-06-19 周五 端午 10:00", state(2026, 6, 19, 10, 0), "holiday/off");

section("[A8] 未知年份（2027）：全天空闲 + 斜纹分段，不误画高峰");
check("2027-01-04 周一 10:00 classify", state(2027, 1, 4, 10, 0), "unknown/off");
check("2027 分段数", R.bandSegments(at(2027, 1, 4, 10, 0)).length, 1);
check("2027 分段区间", [R.bandSegments(at(2027, 1, 4, 10, 0))[0].start, R.bandSegments(at(2027, 1, 4, 10, 0))[0].end], [0, 24]);
check("2026 分段数（应为空）", R.bandSegments(at(2026, 9, 30, 10, 0)).length, 0);

// ───────── B. 全量交叉核对：国务院通知 → 独立区间表 ─────────
// 区间表按通知原文手写，与 client.js 内的字符串列表相互独立，避免同源错误。
const OFFICIAL_HOLIDAY_RANGES_2026 = [
	["元旦", "2026-01-01", "2026-01-03"],
	["春节", "2026-02-15", "2026-02-23"],
	["清明", "2026-04-04", "2026-04-06"],
	["劳动节", "2026-05-01", "2026-05-05"],
	["端午", "2026-06-19", "2026-06-21"],
	["中秋", "2026-09-25", "2026-09-27"],
	["国庆", "2026-10-01", "2026-10-07"],
];
const OFFICIAL_MAKEUP_2026 = ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"];

const key = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const holidaySet = new Set();
OFFICIAL_HOLIDAY_RANGES_2026.forEach(([, s, e]) => {
	const [y1, m1, d1] = s.split("-").map(Number);
	const [y2, m2, d2] = e.split("-").map(Number);
	for (let dt = new Date(y1, m1 - 1, d1); dt <= new Date(y2, m2 - 1, d2); dt.setDate(dt.getDate() + 1)) {
		holidaySet.add(key(dt));
	}
});
const makeupSet = new Set(OFFICIAL_MAKEUP_2026);

section("[B] 2026 年全年逐日交叉核对（365 天 × 3 个时刻 = " + 365 * 3 + " 项）");
let dayCheck = 0;
let mismatch = 0;
for (let i = 0; i < 365; i++) {
	const d = new Date(2026, 0, 1 + i);
	const k = key(d);
	const dow = d.getDay();
	const isHol = holidaySet.has(k);
	const isMakeup = makeupSet.has(k);
	const isWknd = dow === 0 || dow === 6;
	// 期望：节假日或调休日或周末 → 全天空闲；否则工作日按两个窗口判高峰
	[[9, 0], [15, 0], [23, 0]].forEach(([h, mi]) => {
		const actual = state(2026, d.getMonth() + 1, d.getDate(), h, mi);
		let expected;
		if (isHol) expected = "holiday/off";
		else if (isMakeup) expected = "makeup/off";
		else if (isWknd) expected = "weekend/off";
		else expected = (h === 9 || h === 15) ? "peak/PEAK" : "offpeak/off";
		dayCheck++;
		if (actual !== expected) {
			mismatch++;
			if (mismatch <= 10) failures.push("逐日 " + k + " " + h + ":00 expected=" + expected + " got=" + actual);
		}
	});
}
check("全年逐日不符项数", mismatch, 0);
pass += dayCheck;
fail += mismatch;
console.log("  已核对 " + dayCheck + " 项（2026-01-01 ~ 2026-12-31）");

section("[C] 数据表自检");
check("PEAK 窗口数", R.PEAK.length, 2);
check("KNOWN_YEARS", R.KNOWN_YEARS, [2026]);
check("调休日名单条目数", R.MAKEUP_WORKDAYS.size, 6);
check("2026-10-10 未被误列节假日", R.isHoliday(at(2026, 10, 10, 12, 0)), false);
check("2026-10-01 已列节假日", R.isHoliday(at(2026, 10, 1, 12, 0)), true);
check("2026-02-23 已列节假日（原漏项）", R.isHoliday(at(2026, 2, 23, 12, 0)), true);
const holCount = [...holidaySet].length;
let codeHolCount = 0;
for (let i = 0; i < 365; i++) {
	const d = new Date(2026, 0, 1 + i);
	if (R.isHoliday(d)) codeHolCount++;
}
check("节假日总天数（官方 " + holCount + " 天）", codeHolCount, holCount);

console.log("\n----------------------------------------");
console.log("PASS " + pass + " / FAIL " + fail);
if (failures.length) {
	console.log("\n失败明细：");
	failures.forEach((f) => console.log("  - " + f));
}
process.exit(fail === 0 ? 0 : 1);
