// dsh-diy-timebar 浏览器侧 bundle（客户端模块系统格式）。
// 24 小时 DeepSeek 百万 TOKEN 价格时间条：
// 顶部固定横条（shell.overlay 浮层），高峰时段琥珀色，空闲时段绿色，
// 当前时间指针 + 左侧直角矩形时间标签（HH:MM:SS），
// X 随侧边栏 wide 状态自动切换（收起 55 / 展开 278）。
//
// 峰谷规则版本：2026-09-19（官方「调休上班的周末、中国法定节假日全天均按空闲时段计费」）
// 规则原文见 <docs/configuration.md>；数据源为国务院办公厅节假日安排通知。
window.__ModuleLoader__.load({
	id: "dsh-diy-timebar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		// ┌──────────────────────────────────────────────────────────────────┐
		// │ 峰谷规则区（纯逻辑，无 React 依赖）                                 │
		// │ 验证：node scripts/verify-rules.cjs 会抽取本区块并跑断言              │
		// └──────────────────────────────────────────────────────────────────┘
		// @rules-begin —— 抽取标记，勿删
		// 高峰时段：北京时间周一至周五（不含中国法定节假日）9:00–12:00、14:00–18:00。
		// 其余全部空闲：每日 00:00–09:00 / 12:00–14:00 / 18:00–24:00、周六周日全天、
		// 法定节假日全天、调休上班的周末全天（即使国务院安排上班，仍按空闲价）。
		// 判定口径：官方按请求「完成」时刻计价；本时间条按「当前时刻」显示。
		const PEAK = [
			{ start: 9, end: 12 },
			{ start: 14, end: 18 },
		];

		// 法定节假日（含调休形成的连休）：日内全天按空闲（低谷）价。
		// 数据源：国务院办公厅《关于2026年部分节假日安排的通知》
		// （国办发明电〔2025〕7号，2025-11-04）。逐年维护：次年通知发布后追加年份。
		const HOLIDAYS_2026 = [
			"2026-01-01", "2026-01-02", "2026-01-03", // 元旦
			"2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18",
			"2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22",
			"2026-02-23", // 春节（9 天，2/15–2/23；2/23 为周一，必须列全）
			"2026-04-04", "2026-04-05", "2026-04-06", // 清明
			"2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05", // 劳动节
			"2026-06-19", "2026-06-20", "2026-06-21", // 端午
			"2026-09-25", "2026-09-26", "2026-09-27", // 中秋
			"2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
			"2026-10-05", "2026-10-06", "2026-10-07", // 国庆
		];
		const HOLIDAYS = new Set(HOLIDAYS_2026);

		// 调休上班日：国务院安排上班，但 DeepSeek 官方明确「调休上班的周末
		// 仍按空闲时段计费」。判断顺序上放在周末之前，以保证 reason 语义准确。
		// 注：2026 年这 6 个调休日恰好全部落在周六/周日，因此即便不在此名单中，
		// 也会被周末规则判为空闲；本名单是为将来「调休日恰好是工作日」的排布预留。
		const MAKEUP_WORKDAYS = new Set([
			"2026-01-04", // 周日，元旦调休
			"2026-02-14", // 周六，春节调休
			"2026-02-28", // 周六，春节调休
			"2026-05-09", // 周六，劳动节调休
			"2026-09-20", // 周日，中秋国庆调休
			"2026-10-10", // 周六，国庆调休
		]);

		// 规则覆盖的完整年份：超出此范围的日期无节假日数据，按空闲价显示并画灰色斜纹，
		// 避免把法定节假日误画成高价高峰（宁可漏报高峰，不可误报高价）。
		const KNOWN_YEARS = [2026];

		const pad2 = (n) => String(n).padStart(2, "0");
		const dateKey = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
		const isWeekendDay = (d) => d.getDay() === 0 || d.getDay() === 6;
		const isHoliday = (d) => HOLIDAYS.has(dateKey(d));

		// 返回 { inPeak, reason, unknown }
		//   inPeak  —— 当前时刻是否处于高峰（琥珀）
		//   reason  —— holiday | weekend | makeup | peak | offpeak | unknown
		//   unknown —— 所在年份未被 KNOWN_YEARS 覆盖（节假日数据缺失）
		function classify(d) {
			const y = d.getFullYear();
			if (KNOWN_YEARS.indexOf(y) === -1) {
				return { inPeak: false, reason: "unknown", unknown: true };
			}
			const k = dateKey(d);
			if (HOLIDAYS.has(k)) return { inPeak: false, reason: "holiday", unknown: false };
			// 调休判断必须早于周末判断：调休上班日多落在周六/周日上，
			// 先判周末会把它归成 weekend，丢掉「官方调休上班日仍按空闲价」的语义。
			if (MAKEUP_WORKDAYS.has(k)) return { inPeak: false, reason: "makeup", unknown: false };
			if (isWeekendDay(d)) return { inPeak: false, reason: "weekend", unknown: false };
			const h = d.getHours();
			const hit = PEAK.some((s) => h >= s.start && h < s.end);
			return { inPeak: hit, reason: hit ? "peak" : "offpeak", unknown: false };
		}

		// 24h 进度条分段：已知年份返回空数组（整条空闲绿 + 高峰段琥珀）；
		// 未知年份返回全天分段，供调用方画灰色斜纹（价格规则未覆盖）。
		function bandSegments(d) {
			if (KNOWN_YEARS.indexOf(d.getFullYear()) !== -1) return [];
			return [{ start: 0, end: 24, unknown: true }];
		}
		// @rules-end —— 抽取标记，勿删

		const X_RAIL = 55;
		const X_WIDE = 278;
		const Y = 73;
		// 时间显示定稿参数
		const FS = 11;
		const GAP = 0;
		const VOFF = 10;
		const ALPHA = 18;
		const SC = 1.2;
		// 指针定稿参数
		const PX = 0;
		const PY = 2;
		const PLEN = 17;

		// ── 调试开关：?tbdate=YYYY-MM-DD[THH:MM] ─────────────────────────────
		// 用指定时刻代替真实时间渲染（便于核对任意日期/时段的峰谷配色，不必改系统时钟）。
		// 例：...?tbdate=2026-10-02T10:00 → 国庆期间的周五上午，应为整条绿色（无琥珀段）；
		//     ...?tbdate=2026-10-08T10:00 → 假期后首个工作日高峰，应出现琥珀段且指针为琥珀。
		// 不传该参数时行为完全不受影响；仅在启动时解析一次。
		const FAKE_DATE = (function () {
			try {
				const s = new URLSearchParams(window.location.search).get("tbdate");
				if (!s) return null;
				// 传 "YYYY-MM-DDTHH:MM"（带 T）按本地时间解析，避免被当成 UTC；
				// 只传日期时构造为当天 00:00 本地时间。
				const d = s.indexOf("T") !== -1 ? new Date(s) : new Date(s + "T00:00");
				return isNaN(d.getTime()) ? null : d;
			} catch (e) {
				return null;
			}
		})();

		// 侧边栏展开状态（wide）共享存储
		let wide = false;
		const listeners = new Set();
		function setWide(v) {
			if (v !== wide) {
				wide = v;
				listeners.forEach((l) => l());
			}
		}
		function subscribeWide(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
		function getWide() {
			return wide;
		}
		// useSyncExternalStore：订阅者在挂载时先 getSnapshot 取当前值、再订阅，
		// 杜绝「订阅注册前状态已变化」的启动竞态（曾导致 wide 不同步，
		// 需手动收起/展开一次才校准）。后续变化仍经 listeners 通知。
		function useWide() {
			return React.useSyncExternalStore(subscribeWide, getWide);
		}

		function hhmmss(d) {
			return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
		}
		function pctOf(h, m) {
			return ((h * 60 + m) / 1440) * 100;
		}

		function apply(ctx) {
			const slots = ctx.get("slots");
			if (slots === undefined) return;

			function TimeBar24() {
				const w = useWide();
				// 调试开关命中时固定用伪造时刻：对象恒定 → 每秒 tick 只触发重渲染、不换日期
				const [now, setNow] = React.useState(() => (FAKE_DATE ? FAKE_DATE : new Date()));
				React.useEffect(() => {
					if (FAKE_DATE) return undefined;
					return ctx.interval(() => setNow(new Date()), 1000);
				}, []);
				const containerRef = React.useRef(null);
				const labelRef = React.useRef(null);
				const [metrics, setMetrics] = React.useState(null);
				const x = w ? X_WIDE : X_RAIL;
				const cls = classify(now);
				// 空闲（含周末/节假日/调休/夜间）绿；高峰琥珀；未知年份用中性色 state-idle
				const segColor = cls.unknown
					? "var(--dsw-alias-state-idle-primary)"
					: cls.inPeak
						? "var(--dsw-alias-state-warn-primary)"
						: "var(--dsw-alias-state-success-primary)";
				const segs = bandSegments(now);
				const secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
				const pct = (secs / 86400) * 100;
				// 实测容器宽与标签宽，决定贴左还是贴右
				React.useLayoutEffect(() => {
					const c = containerRef.current;
					const l = labelRef.current;
					if (c && l) setMetrics({ cw: c.offsetWidth, lw: l.offsetWidth });
				}, [pct, w]);
				const cw = metrics ? metrics.cw : 0;
				const lw = metrics ? metrics.lw : 0;
				const pointerPx = (pct / 100) * cw;
				const effLw = lw * SC;
				// 左侧放得下（指针左侧空间 >= 标签视觉宽）→ 贴左；否则贴右
				const leftPlacement = metrics === null ? true : pointerPx - GAP - effLw >= 0;
				const labelLeftPx = leftPlacement ? Math.max(0, pointerPx - GAP - lw) : pointerPx + GAP;
				return React.createElement("div", { ref: containerRef, style: { position: "fixed", left: x + "px", top: Y, right: 0, height: 20, zIndex: 9999, pointerEvents: "none" } },
					React.createElement("div", { style: { position: "absolute", left: 0, right: 0, top: 0, height: 2, borderRadius: 1, background: "var(--dsw-alias-state-success-primary)", opacity: 0.55 } }),
					cls.unknown ? null : PEAK.map((s, i) => React.createElement("div", {
						key: i,
						style: { position: "absolute", top: 0, height: 2, left: pctOf(s.start, 0) + "%", width: (pctOf(s.end, 0) - pctOf(s.start, 0)) + "%", background: "var(--dsw-alias-state-warn-primary)", opacity: 0.95, borderRadius: 1 },
					})),
					segs.map((s, i) => React.createElement("div", {
						key: "u" + i,
						style: {
							position: "absolute", top: 0, height: 2,
							left: pctOf(s.start, 0) + "%",
							width: (pctOf(s.end, 0) - pctOf(s.start, 0)) + "%",
							background: "repeating-linear-gradient(90deg, var(--dsw-alias-state-idle-primary) 0 2px, transparent 2px 5px)",
							opacity: 0.75,
						},
					})),
					React.createElement("div", { ref: labelRef, style: { position: "absolute", top: 1 + VOFF, left: labelLeftPx + "px", transform: "translateY(-50%) scale(" + SC + ")", transformOrigin: leftPlacement ? "right center" : "left center", fontSize: FS + "px", color: segColor, background: "color-mix(in srgb, " + segColor + " " + ALPHA + "%, transparent)", padding: "1px 4px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" } }, hhmmss(now)),
					React.createElement("div", { style: { position: "absolute", top: PY, left: "calc(" + pct + "% + " + PX + "px)", height: PLEN, width: 2, transform: "translateX(-50%)", background: segColor } }),
				);
			}

			// 观察侧边栏 wide 状态（空 cell，不占可见空间）
			slots.inject("sidebar.footer.action", () => slots.register(
				{ name: "sidebar.footer.action", id: "timebar-wide", order: 50, label: "时间条" },
				(props) => {
					React.useEffect(() => {
						setWide(Boolean(props.wide));
					}, [props.wide]);
					return null;
				},
			));

			// 24h 价格条浮层
			slots.inject("shell.overlay", () => slots.register(
				{ name: "shell.overlay", id: "timebar-overlay", order: 100, label: "时间条" },
				() => React.createElement(TimeBar24),
			));
		}

		exports.apply = apply;
		exports.inject = ["timer"];
		return module.exports;
	},
});
