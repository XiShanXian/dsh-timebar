// 校验插件源码里引用的 --dsw-alias-* 主题 token 是否真实存在于 DSH 安装包中。
// 背景：DSH 的 UI 只有那一套 alias token，臆造出来的名字会被渲染成透明。
//
// 用法：
//   node scripts/check-theme-tokens.cjs <文件1> [文件2 ...]
//   node scripts/check-theme-tokens.cjs --asar "<DSH>/resources/app.asar" <文件...>
//
// 不传 --asar 时依次尝试环境变量 DSH_ASAR、以及 Windows 上几个默认安装位置；
// 都找不到会以退出码 2 报错，而不是静默通过。
const fs = require("fs");
const path = require("path");

function resolveAsar(argv) {
	const i = argv.indexOf("--asar");
	if (i !== -1) {
		const value = argv[i + 1];
		argv.splice(i, 2);
		if (value) return path.resolve(value);
	}
	if (process.env.DSH_ASAR) return path.resolve(process.env.DSH_ASAR);
	const candidates = [
		path.join(process.env.LOCALAPPDATA || "", "Programs", "DeepSeek Harness", "resources", "app.asar"),
		path.join(process.env.ProgramFiles || "", "DeepSeek Harness", "resources", "app.asar"),
		path.join(process.env.ProgramFiles || "", "DeepSeekHarness", "resources", "app.asar"),
	];
	for (const c of candidates) {
		if (c && c.length > 0 && fs.existsSync(c)) return c;
	}
	return null;
}

const argv = process.argv.slice(2);
const ASAR = resolveAsar(argv);
if (!ASAR || !fs.existsSync(ASAR)) {
	console.error("找不到 app.asar：请用 --asar <路径> 指定，或设置环境变量 DSH_ASAR。");
	process.exit(2);
}

const asar = fs.readFileSync(ASAR).toString("latin1");
const valid = new Set();
{
	const re = /dsw-alias-[a-z0-9-]+/g;
	let m;
	while ((m = re.exec(asar)) !== null) valid.add(m[0]);
}

const files = argv;
if (files.length === 0) {
	console.error("用法: node check-theme-tokens.cjs [--asar <app.asar>] <文件...>");
	process.exit(2);
}

let bad = 0;
let total = 0;
for (const f of files) {
	const text = fs.readFileSync(f, "utf8");
	const seen = new Set();
	const re = /dsw-alias-[a-z0-9-]+/g;
	let m;
	while ((m = re.exec(text)) !== null) seen.add(m[0]);
	console.log("--- " + path.basename(f) + "（" + seen.size + " 个 token）");
	for (const name of [...seen].sort()) {
		total++;
		const ok = valid.has(name);
		if (!ok) bad++;
		console.log((ok ? "  ok   " : "  BAD  ") + name);
	}
}
console.log("\n共 " + total + " 项，无效 " + bad + " 项（安装包内有效 token 总数 " + valid.size + "）");
process.exit(bad === 0 ? 0 : 1);
