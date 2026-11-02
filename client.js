window.__ModuleLoader__.load({
  id: "dsh-zh-layer",
  factory: function (require) {
    var module = { exports: {} };
    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var ORIG = "data-dsh-zh-orig";
    var NS = "zh-layer";
    var CACHE_KEY = NS + ":captured-items";

    console.log("[zh-layer] 双语覆盖层已启动 ✨");

    var DICT_COMMANDS = {};
    var userConfig = { prompt: "", maxTitle: 20, maxOneLine: 80 };

    var memoryCaptured = new Set();
    try {
      var rawCache = localStorage.getItem(CACHE_KEY);
      if (rawCache)
        JSON.parse(rawCache).forEach(function (n) {
          memoryCaptured.add(n);
        });
    } catch (e) {
      console.warn("[zh-layer] 捕获到异常:", e?.message || e);
    }

    function saveCaptured() {
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify(Array.from(memoryCaptured)),
        );
        console.log("[zh-layer] 已更新缓存:", Array.from(memoryCaptured));
      } catch (e) {
        console.warn("[zh-layer] 捕获到异常:", e?.message || e);
      }
    }

    function getMode() {
      return localStorage.getItem(NS + ":mode") || "both";
    }
    function setMode(m) {
      localStorage.setItem(NS + ":mode", m);
      window.dispatchEvent(new Event("zh-layer-change"));
      fetch("/api/zh-layer/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: m }),
      }).catch(() => {});
    }

    function ModeSettingsSection() {
      var [mode, setLocalMode] = useState(getMode());
      var [prompt, setPrompt] = useState(userConfig.prompt);
      var [saved, setSaved] = useState(false);

      var [loading, setLoading] = useState(false);
      var [toast, setToast] = useState(null);
      var [pendingCount, setPendingCount] = useState(0);

      useEffect(function () {
        function onChange() {
          setLocalMode(getMode());
        }
        window.addEventListener("zh-layer-change", onChange);

        fetch("/api/zh-layer/config")
          .then(function (r) {
            return r.text();
          })
          .then(function (t) {
            if (t.indexOf("{") === 0) {
              var data = JSON.parse(t);
              setPrompt(data.prompt);
              userConfig = data;
            }
          })
          .catch(function (e) {
            console.warn("[zh-layer] 捕获到异常:", e?.message || e);
          });

        setTimeout(scanPending, 500);
        return function () {
          window.removeEventListener("zh-layer-change", onChange);
        };
      }, []);

      useEffect(
        function () {
          if (toast) {
            var timer = setTimeout(function () {
              setToast(null);
            }, 3000);
            return function () {
              clearTimeout(timer);
            };
          }
        },
        [toast],
      );

      function scanPending() {
        var seen = new Set();
        memoryCaptured.forEach(function (name) {
          if (!DICT_COMMANDS[name]) seen.add(name);
        });
        document
          .querySelectorAll('[class*="itemName"]')
          .forEach(function (span) {
            var raw = span.getAttribute(ORIG) || span.textContent.trim();
            var match = raw.match(/^\/?([a-zA-Z0-9_-]{2,30})$/);
            if (match) {
              var name = match[1];
              if (!DICT_COMMANDS[name] && !/[\u4e00-\u9fa5]/.test(name))
                seen.add(name);
            }
          });

        fetch("/api/zh-layer/pending-count")
          .then(function (r) {
            return r.text();
          })
          .then(function (t) {
            var pluginCount = 0;
            if (t.indexOf("{") === 0) {
              pluginCount = JSON.parse(t).count || 0;
            }
            setPendingCount(seen.size + pluginCount);
          })
          .catch(function () {
            setPendingCount(seen.size);
          });

        return Array.from(seen);
      }

      function saveConfig() {
        fetch("/api/zh-layer/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: prompt }),
        })
          .then(function (r) {
            return r.text();
          })
          .then(function (t) {
            if (t.indexOf("{") === 0) {
              var data = JSON.parse(t);
              if (data.ok) {
                setSaved(true);
                setTimeout(function () {
                  setSaved(false);
                }, 2000);
              } else {
                setToast({ type: "error", text: "保存失败，服务端未确认" });
              }
            } else {
              setToast({ type: "error", text: "保存异常：返回格式错误" });
            }
          })
          .catch(function (e) {
            console.warn("[zh-layer] 保存提示词异常:", e?.message || e);
            setToast({ type: "error", text: "网络请求失败，无法保存" });
          });
      }

      function doTranslate() {
        setLoading(true);
        setToast(null);

        var pendingNames = scanPending();
        var items = pendingNames.map(function (n) {
          return { type: "skill", name: n };
        });

        fetch("/api/zh-layer/translate-batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: items }),
        })
          .then(function (r) {
            return r.text();
          })
          .then(function (t) {
            if (t.indexOf("{") === 0) {
              var data = JSON.parse(t);
              if (data.ok) {
                setToast({
                  type: "success",
                  text:
                    data.added === 0
                      ? "当前没有需要翻译的内容，已全部汉化。"
                      : "翻译已完成，本次共翻译 " + data.added + " 项。",
                });
                fetch("/api/zh-layer/dict")
                  .then(function (r) {
                    return r.text();
                  })
                  .then(function (dt) {
                    if (dt.indexOf("{") === 0) {
                      var d = JSON.parse(dt);
                      if (d.commands) DICT_COMMANDS = d.commands;
                      runPass();
                      scanPending();
                    }
                  });
              } else {
                setToast({
                  type: "error",
                  text: "翻译失败：" + (data.error || "未知错误"),
                });
              }
            } else {
              setToast({ type: "error", text: "翻译请求异常" });
            }
          })
          .catch(function (e) {
            setToast({ type: "error", text: "网络请求失败" });
          })
          .finally(function () {
            setLoading(false);
          });
      }

      var modes = [
        { id: "zh", title: "只显示中文", desc: "界面极致清爽" },
        { id: "both", title: "中英都显示", desc: "保留英文对照（推荐）" },
        { id: "off", title: "不翻译", desc: "恢复英文原样" },
      ];

      function getCardStyle(active) {
        return {
          flex: 1,
          padding: "16px",
          borderRadius: "10px",
          cursor: "pointer",
          border: active
            ? "2px solid #435092"
            : "1px solid rgba(127,127,127,0.3)",
          background: active ? "rgba(77,107,254,0.05)" : "transparent",
          transition: "all 0.2s ease",
          boxShadow: active ? "0 4px 12px rgba(77,107,254,0.1)" : "none",
          transform: "translateY(0)",
        };
      }

      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "10px 0",
          },
        },

        h(
          "div",
          { style: { display: "flex", gap: "12px" } },
          modes.map(function (m) {
            var active = mode === m.id;
            return h(
              "div",
              {
                key: m.id,
                onClick: function () {
                  setMode(m.id);
                  runPass();
                },
                style: getCardStyle(active),
                onMouseEnter: function (e) {
                  if (!active) {
                    e.currentTarget.style.borderColor = "rgba(127,127,127,0.6)";
                    e.currentTarget.style.background = "rgba(127,127,127,0.05)";
                  }
                },
                onMouseLeave: function (e) {
                  if (!active) {
                    e.currentTarget.style.borderColor = "rgba(127,127,127,0.3)";
                    e.currentTarget.style.background = "transparent";
                  }
                },
              },
              h(
                "div",
                {
                  style: {
                    fontWeight: 600,
                    color: active ? "#4D6BFE" : "inherit",
                    marginBottom: "4px",
                  },
                },
                m.title,
              ),
              h("div", { style: { fontSize: "12px", color: "#888" } }, m.desc),
            );
          }),
        ),

        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(127,127,127,0.08)",
              padding: "16px",
              borderRadius: "12px",
            },
          },
          h(
            "div",
            null,
            h(
              "div",
              { style: { fontSize: "14px", fontWeight: 600 } },
              "智能翻译",
            ),
            h(
              "div",
              {
                style: {
                  fontSize: "12px",
                  color: "#888",
                  marginTop: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                },
              },
              "待翻译项",
              h(
                "span",
                {
                  style: {
                    background: pendingCount > 0 ? "#e67c73" : "#4CAF50",
                    color: "#fff",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    fontSize: "11px",
                    fontWeight: "bold",
                  },
                },
                pendingCount,
              ),
              "个 (含插件/命令/技能)",
            ),
          ),
          h(
            "button",
            {
              onClick: doTranslate,
              disabled: loading,
              style: {
                padding: "10px 24px",
                fontSize: "13px",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                background: loading ? "#ccc" : "#4D6BFE",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                transition: "all 0.2s",
                transform: "translateY(0)",
                boxShadow: loading
                  ? "none"
                  : "0 4px 10px rgba(77,107,254,0.25)",
              },
              onMouseEnter: function (e) {
                if (!loading) {
                  e.target.style.background = "#3b54c9";
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 6px 14px rgba(77,107,254,0.35)";
                }
              },
              onMouseLeave: function (e) {
                if (!loading) {
                  e.target.style.background = "#4D6BFE";
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "0 4px 10px rgba(77,107,254,0.25)";
                }
              },
              onMouseDown: function (e) {
                if (!loading) e.target.style.transform = "translateY(1px)";
              },
              onMouseUp: function (e) {
                if (!loading) e.target.style.transform = "translateY(-2px)";
              },
            },
            loading ? "正在请求 AI..." : "一键全量 AI 翻译",
          ),
        ),

        h(
          "div",
          null,
          h(
            "div",
            {
              style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" },
            },
            "大模型 提示词 (Prompt)",
          ),
          h("textarea", {
            value: prompt,
            onChange: function (e) {
              setPrompt(e.target.value);
            },
            style: {
              width: "100%",
              height: "120px",
              padding: "12px",
              fontSize: "12px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              background: "#fafafa",
              fontFamily: "monospace",
              resize: "vertical",
              outline: "none",
              transition: "border 0.2s",
            },
            onFocus: function (e) {
              e.target.style.border = "1px solid #4288c5";
            },
            onBlur: function (e) {
              e.target.style.border = "1px solid #ddd";
            },
          }),
          h(
            "div",
            { style: { marginTop: "12px", display: "flex", gap: "10px" } },
            h(
              "button",
              {
                onClick: saveConfig,
                style: {
                  padding: "8px 16px",
                  fontSize: "13px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontWeight: 500,
                },
                onMouseEnter: function (e) {
                  e.target.style.background = "#f5f5f5";
                  e.target.style.transform = "translateY(-1px)";
                },
                onMouseLeave: function (e) {
                  e.target.style.background = "#fff";
                  e.target.style.transform = "translateY(0)";
                },
              },
              saved ? "已保存" : "保存提示词",
            ),
            h(
              "button",
              {
                onClick: function () {
                  fetch("/api/zh-layer/open-dir", { method: "POST" });
                },
                style: {
                  padding: "8px 16px",
                  fontSize: "13px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontWeight: 500,
                },
                onMouseEnter: function (e) {
                  e.target.style.background = "#f5f5f5";
                  e.target.style.transform = "translateY(-1px)";
                },
                onMouseLeave: function (e) {
                  e.target.style.background = "#fff";
                  e.target.style.transform = "translateY(0)";
                },
              },
              "配置文件夹",
            ),
          ),
        ),

        toast &&
          h(
            "div",
            {
              style: {
                padding: "12px",
                borderRadius: "8px",
                fontSize: "13px",
                textAlign: "center",
                fontWeight: "bold",
                background: toast.type === "success" ? "#e6f4ea" : "#fce8e6",
                color: toast.type === "success" ? "#1e8e3e" : "#d93025",
                animation: "fadeIn 0.3s ease-out",
              },
            },
            toast.text,
          ),
      );
    }

    function runPass() {
      if (!document.body) return;

      var mode = getMode();

      if (mode === "off") {
        document.querySelectorAll(".zh-layer-wrap").forEach(function (wrap) {
          var pSpan = wrap.parentElement;
          var origTxt = pSpan ? pSpan.getAttribute(ORIG) : null;
          if (origTxt) {
            pSpan.textContent = origTxt;
            pSpan.removeAttribute(ORIG);
          }
        });
        document
          .querySelectorAll("[data-dsh-desc-orig]")
          .forEach(function (el) {
            el.textContent = el.getAttribute("data-dsh-desc-orig");
            el.removeAttribute("data-dsh-desc-orig");
          });
        return;
      }

      var capturedChanged = false;

      document.querySelectorAll('[class*="itemName"]').forEach(function (span) {
        var raw = span.getAttribute(ORIG) || span.textContent.trim();

        var match = raw.match(/^\/?([a-zA-Z0-9_-]{2,30})$/);
        if (match) {
          var cmdName = match[1];
          if (!memoryCaptured.has(cmdName)) {
            memoryCaptured.add(cmdName);
            capturedChanged = true;
          }
        }

        if (span.querySelector(".zh-layer-wrap")) return;
        if (!match) return;

        var cmdName = match[1];
        var dict = DICT_COMMANDS[cmdName];
        if (!dict) return;

        var zhName = dict.title || (Array.isArray(dict) ? dict[0] : "");
        var zhDesc = dict.oneLine || (Array.isArray(dict) ? dict[1] : "");
        if (!zhName) return;

        span.setAttribute(ORIG, raw);

        span.innerHTML = "";
        var wrap = document.createElement("span");
        wrap.className = "zh-layer-wrap";
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "baseline";
        wrap.style.gap = "7px";

        if (mode === "both") {
          var zhSpan = document.createElement("span");
          zhSpan.textContent = zhName;

          var enSpan = document.createElement("span");
          enSpan.style.fontSize = "12px";
          enSpan.style.color = "#75787d";
          enSpan.style.opacity = "0.8";
          enSpan.style.fontWeight = "normal";
          enSpan.textContent = raw;

          wrap.appendChild(zhSpan);
          wrap.appendChild(enSpan);
        } else {
          wrap.textContent = zhName;
        }
        span.appendChild(wrap);

        var container =
          span.closest('[class*="itemWrapper"], [class*="menuItem"], li') ||
          span.parentElement;
        var descEl = container
          ? container.querySelector(
              '[class*="itemDescription"], [class*="itemAlias"], [class*="description"]',
            )
          : null;
        if (descEl && zhDesc) {
          if (!descEl.getAttribute("data-dsh-desc-orig")) {
            descEl.setAttribute("data-dsh-desc-orig", descEl.textContent);
          }
          descEl.textContent = zhDesc;
        }
      });

      if (capturedChanged) saveCaptured();
    }

    function apply(ctx) {
      var style = document.createElement("style");
      style.textContent =
        "@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }";
      document.head.appendChild(style);
      fetch("/api/zh-layer/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: getMode() }),
      }).catch(function (e) {
        console.warn("[zh-layer] 初始化模式同步失败:", e?.message || e);
      });
      fetch("/api/zh-layer/dict")
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          if (t.indexOf("{") === 0) {
            var d = JSON.parse(t);
            if (d.commands) DICT_COMMANDS = d.commands;
            runPass();
          }
        })
        .catch(function (e) {
          console.warn("[zh-layer] 捕获到异常:", e?.message || e);
        });

      fetch("/api/zh-layer/config")
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          if (t.indexOf("{") === 0) userConfig = JSON.parse(t);
        })
        .catch(function (e) {
          console.warn("[zh-layer] 捕获到异常:", e?.message || e);
        });

      try {
        ctx.slots.inject("settings.section", function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "zh-layer-settings",
              order: 52,
              label: function () {
                return "翻译设置";
              },
            },
            function () {
              return h(ModeSettingsSection);
            },
          );
        });
      } catch (e) {
        console.warn("[zh-layer] 捕获到异常:", e?.message || e);
      }

      var scheduled = false;
      var observer = new MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
          scheduled = false;
          runPass();
        });
      });

      ctx.effect(function () {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        runPass();
        return function () {
          observer.disconnect();
        };
      }, "zh-layer: observer");
    }

    module.exports = {
      name: "zh-layer",
      inject: ["slots"],
      apply: apply,
    };
    return module.exports;
  },
});
