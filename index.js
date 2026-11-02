import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

export const name = "zh-layer";
export const inject = ["webServer"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICT_FILE = "dictionary.json";
const CONFIG_FILE = "settings.json";

const OFFICIAL_META_MARK = Symbol.for("dsh-zh-layer.official-meta");
const BUNDLE_META_MARK = Symbol.for("dsh-zh-layer.bundle-meta");

let db = { plugins: {}, commands: {} };
let userConfig = { prompt: "", maxTitle: 20, maxOneLine: 80 };
let currentMode = "both";

function resolveHome() {
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  return path.join(os.homedir(), ".dsh");
}
const home = resolveHome();
const configDir = path.join(home, "zh-layer-config");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJsonAtomic(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp-" + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

function loadConfigs() {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  const cfgPath = path.join(configDir, CONFIG_FILE);
  if (fs.existsSync(cfgPath)) {
    userConfig = readJson(cfgPath, userConfig);
  } else {
    userConfig.prompt = [
      "You are an expert translator for DSH (DeepSeek Harness). DO NOT output any reasoning or thinking process.",
      "Translate the given items into Chinese, replying with strict JSON only.",
      "For each item, you MUST return the exact same 'name' and 'type' as provided in the input.",
      "Provide:",
      '1. "title": A short Chinese name (max 10 characters).',
      '2. "oneLine": ONE Chinese sentence explaining WHAT it does and HOW to use it.',
      "Answer with strict JSON only, no markdown fences:",
      '{"items":[{"name":"<exact name>","type":"<plugin|command|skill>","title":"...","oneLine":"..."}]}',
    ].join("\n");
    writeJsonAtomic(cfgPath, userConfig);
  }

  const dictPath = path.join(configDir, DICT_FILE);
  if (fs.existsSync(dictPath)) {
    db = readJson(dictPath, { plugins: {}, commands: {} });
  } else {
    db = {
      plugins: {
        "dsh-zh-layer": {
          title: "双语覆盖层",
          oneLine: "为插件、命令与 Skill 叠加中文名和功能说明，三种显示模式，英文原版一键开关。",
        },
      },
      commands: {
        compact: { title: "压缩对话", oneLine: "压缩较早的对话历史" },
      },
    };
    writeJsonAtomic(dictPath, db);
  }
}
loadConfigs();

function bareNameOf(specifier) {
  if (typeof specifier !== "string") return "";
  const request = specifier.trim();
  if (request === "" || request.startsWith("cordis:")) return "";
  if (/^[.\/\\#]/.test(request) || request.includes(":")) return "";
  const parts = request.split("/").filter((p) => p !== "");
  if (parts.length === 0) return "";
  if (request.startsWith("@")) return parts.length >= 2 ? parts[0] + "/" + parts[1] : "";
  return parts[0];
}

function getLabel(name, type = "plugins") {
  if (!name) return null;
  const b = bareNameOf(name) || name;
  let res = db[type]?.[b] || db[type]?.[name];
  if (!res) return null;
  if (Array.isArray(res)) return { title: res[0], oneLine: res[1] };
  return res;
}

function mergeDisplayMeta(base, label, name) {
  if (!label) return base;
  if (currentMode === "off") return base;
  const source = base && typeof base === "object" ? base : {};

  const isObjTitle = typeof source.title === "object" && source.title !== null;
  
  let enTitle = name; 
  if (typeof source.title === "string" && !/[\u4e00-\u9fa5]/.test(source.title)) {
    enTitle = source.title;
  } else if (isObjTitle && typeof source.title.en === "string") {
    enTitle = source.title.en;
  }

  let zhTitle = label.title || "";

  const isObjDesc = typeof source.description === "object" && source.description !== null;
  let enDesc = "";
  if (typeof source.description === "string") {
    enDesc = source.description;
  } else if (isObjDesc) {
    enDesc = source.description.en || "";
  }
  let zhDesc = label.oneLine || "";

  const result = { ...source };

  if (currentMode === "zh") {
    if (isObjTitle) {
      result.title = { ...source.title, zh: zhTitle || enTitle };
      if (zhDesc) {
        result.description = isObjDesc 
          ? { ...source.description, zh: zhDesc || enDesc } 
          : { en: enDesc, zh: zhDesc || enDesc };
      }
    } else {
      result.title = zhTitle || enTitle;
      result.description = zhDesc || enDesc;
    }
  } else {
    const finalTitle = enTitle && zhTitle && enTitle !== zhTitle ? enTitle + " " + zhTitle : zhTitle || enTitle;
    const finalDesc = zhDesc || enDesc; 
    
    result.title = finalTitle;
    result.description = finalDesc;
  }
  
  return result;
}

function markWithSymbol(wrapper, symbol) {
  try {
    Object.defineProperty(wrapper, symbol, { value: true, enumerable: false });
  } catch (e) {}
  return wrapper;
}
function isOfficialMetaWrapper(value) {
  return Boolean(value && typeof value === "function" && value[OFFICIAL_META_MARK] === true);
}
function isBundleMetaWrapper(value) {
  return Boolean(value && typeof value === "function" && value[BUNDLE_META_MARK] === true);
}

function installOfficialMeta(ctx) {
  const tryPatch = () => {
    try {
      const service = ctx.get("pluginPackages");
      if (!service || isOfficialMetaWrapper(service.metaOf)) return;
      const raw = service.metaOf;
      if (typeof raw !== "function") return;
      const original = raw.bind(service);
      const wrapper = markWithSymbol(function (specifier, parentURL) {
        let base;
        try {
          base = original(specifier, parentURL);
        } catch (e) {
          base = undefined;
        }
        const pluginName = bareNameOf(specifier);
        const label = getLabel(pluginName, "plugins");
        if (!label) return base;
        try {
          return mergeDisplayMeta(base, label, pluginName);
        } catch (e) {
          return base;
        }
      }, OFFICIAL_META_MARK);
      service.metaOf = wrapper;
    } catch (e) {}
  };
  tryPatch();
  return { dispose: () => {}, tryPatch };
}

function installBundleMeta(ctx) {
  const tryPatch = () => {
    try {
      const service = ctx.get("pluginManager");
      if (!service || isBundleMetaWrapper(service.listBundles)) return;
      const raw = service.listBundles;
      if (typeof raw !== "function") return;
      const wrapper = markWithSymbol(function (...args) {
        return Promise.resolve(raw.apply(service, args)).then((value) => {
          if (Array.isArray(value)) {
            for (const bundle of value) {
              const label = getLabel(bundle.name, "plugins");
              if (label) {
                try {
                  bundle.meta = mergeDisplayMeta(bundle.meta, label, bundle.name);
                } catch (e) {}
              }
            }
          }
          return value;
        });
      }, BUNDLE_META_MARK);
      service.listBundles = wrapper;
    } catch (e) {}
  };
  tryPatch();
  return { dispose: () => {}, tryPatch };
}

async function getPendingPlugins(ctx) {
  const pending = [];
  const manager = ctx.get("pluginManager");
  if (!manager || typeof manager.listBundles !== "function") return pending;

  try {
    const bundles = await manager.listBundles();
    if (!Array.isArray(bundles)) return pending;

    for (const bundle of bundles) {
      const n = bundle.name;
      if (!n || n.startsWith("@deepseek-ai/") || n === "dsh-zh-layer") continue;
      if (!getLabel(n, "plugins")) {
        let desc = "";
        if (bundle.meta && bundle.meta.description) {
          if (typeof bundle.meta.description === "string") {
            desc = bundle.meta.description;
          } else if (typeof bundle.meta.description === "object") {
            desc = bundle.meta.description.en || "";
          }
        }
        pending.push({ type: "plugin", name: n, desc });
      }
    }
  } catch (e) {}
  return pending;
}

export function apply(ctx) {
  
  ctx.inject(["webServer"], () => {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/api/zh-layer/pending-count",
          handler: async (req, res) => {
            res.setHeader("content-type", "application/json");
            const pendingPlugins = await getPendingPlugins(ctx);
            res.end(JSON.stringify({ count: pendingPlugins.length }));
          },
        }),
      "zh-layer: pending count api",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/api/zh-layer/config",
          handler: (req, res) => {
            res.setHeader("content-type", "application/json");
            if (req.method === "POST") {
              let body = "";
              req.on("data", (c) => (body += c));
              req.on("end", () => {
                try {
                  const data = JSON.parse(body);
                  userConfig = { ...userConfig, ...data };
                  const isSaved = writeJsonAtomic(path.join(configDir, CONFIG_FILE), userConfig);
                  res.end(JSON.stringify({ ok: isSaved }));
                } catch (err) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ ok: false }));
                }
              });
            } else {
              res.end(JSON.stringify(userConfig));
            }
          },
        }),
      "zh-layer: config api",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/api/zh-layer/mode",
          handler: (req, res) => {
            res.setHeader("content-type", "application/json");
            if (req.method === "POST") {
              let body = "";
              req.on("data", (c) => (body += c));
              req.on("end", () => {
                try {
                  const data = JSON.parse(body);
                  if (data.mode) currentMode = data.mode;
                  res.end(JSON.stringify({ ok: true }));
                } catch {
                  res.statusCode = 400;
                  res.end("{}");
                }
              });
            } else {
              res.end(JSON.stringify({ mode: currentMode }));
            }
          },
        }),
      "zh-layer: mode api",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/api/zh-layer/dict",
          handler: (req, res) => {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(db));
          },
        }),
      "zh-layer: dict api",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/api/zh-layer/open-dir",
          handler: (req, res) => {
            try {
              exec(`explorer.exe "${configDir}"`);
            } catch (e) {}
            res.end("{}");
          },
        }),
      "zh-layer: open dir",
    );

    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: "/api/zh-layer/translate-batch",
          handler: (req, res) => {
            res.setHeader("content-type", "application/json");
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.end("{}");
              return;
            }

            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", async () => {
              try {
                const { items } = JSON.parse(body);
                const pendingPlugins = await getPendingPlugins(ctx);
                const pendingCommands = (items || []).map((c) => ({
                  type: c.type || "command",
                  name: c.name,
                  desc: "",
                }));

                const allPending = [...pendingPlugins, ...pendingCommands].filter((item) => {
                  const label = getLabel(item.name, item.type === "plugin" ? "plugins" : "commands");
                  return !label;
                });

                if (allPending.length === 0) {
                  res.end(JSON.stringify({ ok: true, added: 0, msg: "没有待翻译项" }));
                  return;
                }

                const llm = ctx.get("llm");
                if (!llm || typeof llm.stream !== "function") {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: "LLM 不可用" }));
                  return;
                }

                const stream = llm.stream({
                  provider: "deepseek-official",
                  model: "deepseek-flash",
                  temperature: 0,
                  system: userConfig.prompt,
                  messages: [{ role: "user", content: [{ type: "text", text: JSON.stringify(allPending) }] }],
                  signal: AbortSignal.timeout(60000),
                });

                let text = "";
                for await (const chunk of stream) {
                  if (chunk.type === "text-delta") text += chunk.text;
                }

                const start = text.indexOf("{"), end = text.lastIndexOf("}");
                if (start >= 0 && end > start) {
                  const parsed = JSON.parse(text.slice(start, end + 1));
                  let added = 0;

                  if (parsed.items) {
                    const norm = (s) => String(s || "").trim().toLowerCase();
                    parsed.items.forEach((item) => {
                      if (item.name && item.title) {
                        const hit = allPending.find((p) => norm(p.name) === norm(item.name));
                        let targetType = item.type || hit?.type || "command";
                        const targetDb = targetType === "plugin" ? db.plugins : db.commands;
                        const finalKey = (hit ? hit.name : item.name).trim();

                        targetDb[finalKey] = {
                          title: item.title.slice(0, userConfig.maxTitle),
                          oneLine: (item.oneLine || "").slice(0, userConfig.maxOneLine),
                        };
                        added++;
                      }
                    });
                    writeJsonAtomic(path.join(configDir, DICT_FILE), db);
                  }
                  res.end(JSON.stringify({ ok: true, added }));
                } else {
                  res.end(JSON.stringify({ ok: false, error: "模型返回格式错误" }));
                }
              } catch (e) {
                res.end(JSON.stringify({ ok: false, error: e.message }));
              }
            });
          },
        }),
      "zh-layer: translate batch api",
    );
  });

  ctx.inject(["pluginPackages"], () => {
    installOfficialMeta(ctx);
  });
  ctx.inject(["pluginManager"], () => {
    installBundleMeta(ctx);
  });
}