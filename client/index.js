/**
 * Browser half of @frederickimanuels/dsh-skill-forge.
 *
 * The harness serves this file as a client module: it only registers a factory
 * (`window.__ModuleLoader__.load`), and the factory runs when the module is
 * materialized. Inside, it is a normal cordis plugin - it injects `slots` and
 * `locale` and registers one settings section.
 *
 * The page cannot touch the filesystem, so it talks to the host through the
 * routes in `src/bridge.js` over plain fetch, the same way the bundled
 * settings pages do.
 *
 * Written by hand rather than generated: the module format is small enough
 * that a build step would add a toolchain without adding capability. Use
 * `React.createElement` (aliased to `el`) instead of JSX so the file needs no
 * transform and no jsx pragma at runtime.
 */

window.__ModuleLoader__.load({
  id: "@frederickimanuels/dsh-skill-forge",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    var el = React.createElement;
    var useCallback = React.useCallback;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useState = React.useState;

    var css = ".sf-section{display:flex;flex-direction:column;gap:18px;max-width:820px}\n.sf-head{display:flex;flex-direction:column;gap:6px}\n.sf-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}\n.sf-sub{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}\n.sf-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--dsw-alias-label-tertiary)}\n.sf-meta code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}\n.sf-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px}\n.sf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}\n.sf-row-end{justify-content:flex-end}\n.sf-input{flex:1 1 260px;min-width:0;padding:7px 10px;font-size:13px;color:var(--dsw-alias-label-primary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font-family:inherit}\n.sf-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 var(--dsw-focus-ring-width) var(--dsw-focus-ring-color)}\n.sf-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;padding:6px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}\n.sf-btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}\n.sf-btn:disabled{opacity:.5;cursor:default}\n.sf-btn-primary{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}\n.sf-list{display:flex;flex-direction:column;gap:8px}\n.sf-skill{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px}\n.sf-skill-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline}\n.sf-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}\n.sf-dialect{font-size:11px;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 8px;white-space:nowrap}\n.sf-desc{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}\n.sf-path{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}\n.sf-warn{font-size:11px;color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-secondary))}\n.sf-empty{font-size:12px;color:var(--dsw-alias-label-tertiary);padding:14px 0;text-align:center}\n.sf-error{font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary,#d33);word-break:break-word}\n.sf-notice{font-size:12px;line-height:1.5;color:var(--dsw-alias-state-business-primary)}\n.sf-hint{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}\n.sf-spacer{flex:1}\n.sf-listitem{font-size:12px;color:var(--dsw-alias-label-secondary)}\n.sf-page{width:100%;min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6;display:flex;overflow:hidden}\n.sf-pageScroll{scrollbar-gutter:stable;flex:1;min-height:0;overflow:auto}\n.sf-pageContent{max-width:960px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 48px}\n@media (width<=767px){.sf-pageContent{padding-inline:20px}}\n.sf-page .sf-section{max-width:none;padding-top:28px}\n[data-platform=darwin] .sf-page .sf-section{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}";
    var tagId = "dsh-skill-forge/SkillsPage.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-skill-forge";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    var NS = "dsh-skill-forge";
    var BRIDGE_PATH = "api/dsh-skill-forge";

    /**
     * The id shared by the sidebar entry and the main panel it opens.
     *
     * The sidebar renders one row per 'sidebar.panellist' registration and calls
     * layout.selectPanel(id) on click; the frame then renders the 'main' entry
     * whose key equals that id. Registering both under one id is the whole
     * wiring - there is no navigation API to call.
     */
    var PANEL_ID = "skill-forge";

    /** Sidebar row position: after the Plugins row (0) and the schedule row (10). */
    var PANEL_ORDER = 20;

    var en = {
          "nav": "Skills",
          "title": "Forged skills",
          "subtitle": "Skills written for other agents - Claude Code, Cursor, AGENTS.md - adapted for this harness. Anything you import here is published to every session immediately.",
          "store": "Store",
          "roots": "Roots",
          "empty": "The store is empty. Import a skill repository to get started.",
          "importTitle": "Import",
          "importHint": "A local path or a git URL. A bundle is copied whole, so its references and scripts keep working.",
          "importPlaceholder": "https://github.com/benjitaylor/skills.git",
          "import": "Import",
          "preview": "Preview",
          "importing": "Importing...",
          "previewing": "Reading...",
          "refresh": "Refresh",
          "remove": "Remove",
          "confirm": "Confirm removal",
          "cancel": "Cancel",
          "model": "model",
          "userOnly": "user-only",
          "loading": "Loading...",
          "stats": "{count} skill(s) in the store",
          "truncatedNote": "Showing the first {count} skills only.",
          "previewFound": "{count} skill(s) would be imported:",
          "previewNone": "No importable skills found in that source.",
          "imported": "Imported {names}.",
          "skipped": "Already present: {names}.",
          "removed": "Removed {name}.",
          "failed": "Failed: {message}",
          "overwriteHint": "Names already in the store are skipped. To replace one, run the command line with --force."
    };
    var zh = {
          "nav": "技能",
          "title": "外来技能",
          "subtitle": "为其他 AI 助手（Claude Code、Cursor、AGENTS.md）编写的技能，改写后可直接在本 harness 使用。在这里导入的技能够立即被所有会话使用。",
          "store": "存储目录",
          "roots": "扫描根目录",
          "empty": "存储目录还是空的，先导入一个技能仓库吧。",
          "importTitle": "导入",
          "importHint": "本地路径或 git 地址。整包复制，references 和脚本依然可用。",
          "importPlaceholder": "https://github.com/benjitaylor/skills.git",
          "import": "导入",
          "preview": "预览",
          "importing": "正在导入...",
          "previewing": "正在读取...",
          "refresh": "刷新",
          "remove": "删除",
          "confirm": "确认删除",
          "cancel": "取消",
          "model": "模型可调用",
          "userOnly": "仅用户可调用",
          "loading": "加载中...",
          "stats": "存储目录中有 {count} 个技能",
          "truncatedNote": "仅显示前 {count} 个技能。",
          "previewFound": "将导入 {count} 个技能：",
          "previewNone": "该来源里没有可导入的技能。",
          "imported": "已导入 {names}。",
          "skipped": "已存在：{names}。",
          "removed": "已删除 {name}。",
          "failed": "出错：{message}",
          "overwriteHint": "同名技能会被跳过，需要替换请在命令行加 --force。"
    };

    /** Build one bridge URL relative to wherever the app is served. */
    function bridgeUrl(endpoint) {
      return new URL(BRIDGE_PATH + "/" + endpoint, document.baseURI).toString();
    }

    /**
     * Call one bridge route and unwrap the {ok, ...} envelope.
     * @param {string} endpoint - route name after the prefix.
     * @param {object} [body] - JSON body; omit for a GET.
     */
    async function call(endpoint, body) {
      var init =
        body === undefined
          ? { headers: { accept: "application/json" }, credentials: "same-origin" }
          : {
              method: "POST",
              headers: { "content-type": "application/json", accept: "application/json" },
              body: JSON.stringify(body),
              credentials: "same-origin",
            };
      var response = await fetch(bridgeUrl(endpoint), init);
      var payload = await response.json().catch(function () {
        return { ok: false, error: "the server answered without JSON (HTTP " + response.status + ")" };
      });
      if (payload.ok !== true) throw new Error(typeof payload.error === "string" ? payload.error : "HTTP " + response.status);
      return payload;
    }

    /** Turn an unknown throwable into a message for the page. */
    function messageOf(cause) {
      return String(cause && cause.message ? cause.message : cause);
    }

    /**
     * The sidebar row glyph. The shell paints the row button, its label, tooltip
     * and active state; a 'sidebar.panellist' registrant contributes only the
     * icon, so this is drawn inline rather than imported - the bundle may require
     * nothing but React (test/ui.test.js enforces that).
     */
    function SkillsPanelIcon(props) {
      var size = props.size || 16;
      return el(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.3,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
        },
        el("path", { key: "shaft", d: "M3.4 12.6 9.8 6.2" }),
        el("path", { key: "head", d: "M10.8 3.2l2 2-1.4 1.4-2-2z" }),
        el("path", { key: "spark", d: "M12.9 8.2v2.4" }),
        el("path", { key: "spark2", d: "M11.7 9.4h2.4" }),
      );
    }

    /**
     * The standalone page the sidebar row opens.
     *
     * A 'main' entry owns the whole centre column, so it brings its own scroll
     * container and content column - the shell paints no chrome around it. The
     * settings section it shares state with renders inside this width.
     */
    function SkillsPanel(props) {
      return el(
        "div",
        { className: "sf-page" },
        el(
          "div",
          { className: "sf-pageScroll" },
          el("div", { className: "sf-pageContent" }, el(SkillsSection, props)),
        ),
      );
    }

    function SkillCard(props) {
      var skill = props.skill;
      var t = props.t;
      var confirming = props.pendingRemove === skill.name;
      var children = [
        el(
          "div",
          { key: "head", className: "sf-skill-head" },
          el("span", { key: "name", className: "sf-name" }, skill.name),
          el("span", { key: "dialect", className: "sf-dialect" }, skill.dialectLabel),
        ),
      ];
      if (skill.description) children.push(el("div", { key: "desc", className: "sf-desc" }, skill.description));
      var actions = [
        el(
          "span",
          { key: "flags", className: "sf-path" },
          (skill.modelInvocable ? t("model") : t("userOnly")) + (skill.source ? "  -  " + skill.source : ""),
        ),
        el("span", { key: "spacer", className: "sf-spacer" }),
      ];
      if (confirming) {
        actions.push(
          el("button", { key: "do", className: "sf-btn sf-btn-primary", disabled: props.busy, onClick: function () { props.onRemove(skill.name); } }, t("confirm")),
          el("button", { key: "no", className: "sf-btn", disabled: props.busy, onClick: props.onCancelRemove }, t("cancel")),
        );
      } else {
        actions.push(
          el("button", { key: "remove", className: "sf-btn", disabled: props.busy, onClick: function () { props.onAskRemove(skill.name); } }, t("remove")),
        );
      }
      children.push(el("div", { key: "row", className: "sf-row" }, actions));
      if (skill.relativeFile) children.push(el("div", { key: "path", className: "sf-path" }, skill.relativeFile));
      return el("div", { className: "sf-skill" }, children);
    }

    function SkillsSection(props) {
      var t = props.t;
      var state = useState(null);
      var snapshot = state[0];
      var setSnapshot = state[1];
      var errorState = useState("");
      var error = errorState[0];
      var setError = errorState[1];
      var noticeState = useState("");
      var notice = noticeState[0];
      var setNotice = noticeState[1];
      var sourceState = useState("");
      var source = sourceState[0];
      var setSource = sourceState[1];
      var busyState = useState("load");
      var busy = busyState[0];
      var setBusy = busyState[1];
      var removeState = useState(null);
      var pendingRemove = removeState[0];
      var setPendingRemove = removeState[1];
      var previewState = useState(null);
      var preview = previewState[0];
      var setPreview = previewState[1];
      var mounted = useRef(true);

      useEffect(function () {
        mounted.current = true;
        return function () {
          mounted.current = false;
        };
      }, []);

      var load = useCallback(async function () {
        setBusy("load");
        try {
          var payload = await call("state");
          if (mounted.current === true) {
            setSnapshot(payload);
            setError("");
          }
        } catch (cause) {
          if (mounted.current === true) setError(t("failed", { message: messageOf(cause) }));
        } finally {
          if (mounted.current === true) setBusy("");
        }
      }, [t]);

      useEffect(function () {
        load();
      }, [load]);

      /** Fold a mutating response into the page state. */
      function report(payload) {
        if (payload.state !== undefined) setSnapshot(payload.state);
        var lines = [];
        if (payload.removed === true) lines.push(t("removed", { name: payload.name }));
        if (Array.isArray(payload.imported) && payload.imported.length > 0) lines.push(t("imported", { names: payload.imported.join(", ") }));
        if (Array.isArray(payload.skipped) && payload.skipped.length > 0) lines.push(t("skipped", { names: payload.skipped.join(", ") }));
        if (lines.length > 0) setNotice(lines.join(" "));
      }

      async function onPreview() {
        if (source.trim() === "") return;
        setBusy("preview");
        setError("");
        setNotice("");
        try {
          var payload = await call("preview", { source: source.trim() });
          if (mounted.current === true) setPreview(payload.skills || []);
        } catch (cause) {
          if (mounted.current === true) setError(t("failed", { message: messageOf(cause) }));
        } finally {
          if (mounted.current === true) setBusy("");
        }
      }

      async function onImport() {
        if (source.trim() === "") return;
        setBusy("import");
        setError("");
        setNotice("");
        setPreview(null);
        try {
          var payload = await call("import", { source: source.trim() });
          if (mounted.current === true) {
            report(payload);
            setSource("");
          }
        } catch (cause) {
          if (mounted.current === true) setError(t("failed", { message: messageOf(cause) }));
        } finally {
          if (mounted.current === true) setBusy("");
        }
      }

      async function onRemove(name) {
        setBusy("remove");
        setError("");
        setNotice("");
        try {
          var payload = await call("remove", { name: name });
          if (mounted.current === true) {
            setPendingRemove(null);
            report(payload);
          }
        } catch (cause) {
          if (mounted.current === true) setError(t("failed", { message: messageOf(cause) }));
        } finally {
          if (mounted.current === true) setBusy("");
        }
      }

      var skills = snapshot && Array.isArray(snapshot.skills) ? snapshot.skills : [];
      var settings = (snapshot && snapshot.settings) || {};
      var disabled = busy !== "";
      var canSubmit = disabled === false && source.trim() !== "";

      var children = [
        el(
          "div",
          { key: "head", className: "sf-head" },
          el("div", { key: "title", className: "sf-title" }, t("title")),
          el("div", { key: "sub", className: "sf-sub" }, t("subtitle")),
        ),
        el(
          "div",
          { key: "meta", className: "sf-meta" },
          el("span", { key: "store" }, t("store") + ": ", el("code", { key: "code" }, (snapshot && snapshot.store) || "...")),
          Array.isArray(settings.roots) && settings.roots.length > 0
            ? el("span", { key: "roots" }, t("roots") + ": ", el("code", { key: "code" }, settings.roots.join(", ")))
            : null,
          el("span", { key: "count" }, t("stats", { count: skills.length })),
          snapshot && snapshot.truncated === true
            ? el("span", { key: "truncated", className: "sf-warn" }, t("truncatedNote", { count: (snapshot && snapshot.maxFiles) || skills.length }))
            : null,
        ),
        el(
          "div",
          { key: "import", className: "sf-card" },
          el("div", { key: "title", className: "sf-title" }, t("importTitle")),
          el("div", { key: "hint", className: "sf-hint" }, t("importHint")),
          el(
            "div",
            { key: "row", className: "sf-row" },
            el("input", {
              key: "input",
              className: "sf-input",
              type: "text",
              spellCheck: false,
              placeholder: t("importPlaceholder"),
              value: source,
              disabled: disabled,
              onChange: function (event) { setSource(event.target.value); },
              onKeyDown: function (event) {
                if (event.key === "Enter" && canSubmit) onImport();
              },
            }),
            el("button", { key: "preview", className: "sf-btn", disabled: canSubmit === false, onClick: onPreview }, busy === "preview" ? t("previewing") : t("preview")),
            el("button", { key: "go", className: "sf-btn sf-btn-primary", disabled: canSubmit === false, onClick: onImport }, busy === "import" ? t("importing") : t("import")),
          ),
          el("div", { key: "hint2", className: "sf-hint" }, t("overwriteHint")),
          preview === null
            ? null
            : el(
                "div",
                { key: "preview", className: "sf-list" },
                el("div", { key: "label", className: "sf-hint" }, preview.length === 0 ? t("previewNone") : t("previewFound", { count: preview.length })),
                preview.map(function (skill) {
                  return el("div", { key: skill.name, className: "sf-listitem" }, skill.name + "  -  " + skill.dialectLabel);
                }),
              ),
        ),
      ];
      if (error !== "") children.push(el("div", { key: "error", className: "sf-error" }, error));
      if (notice !== "") children.push(el("div", { key: "notice", className: "sf-notice" }, notice));
      children.push(
        el(
          "div",
          { key: "toolbar", className: "sf-row sf-row-end" },
          el("button", { key: "refresh", className: "sf-btn", disabled: disabled, onClick: load }, t("refresh")),
        ),
      );
      if (skills.length === 0) {
        children.push(el("div", { key: "empty", className: "sf-empty" }, busy === "load" ? t("loading") : t("empty")));
      } else {
        children.push(
          el(
            "div",
            { key: "list", className: "sf-list" },
            skills.map(function (skill) {
              return el(SkillCard, {
                key: skill.name,
                skill: skill,
                t: t,
                busy: disabled,
                pendingRemove: pendingRemove,
                onAskRemove: setPendingRemove,
                onCancelRemove: function () { setPendingRemove(null); },
                onRemove: onRemove,
              });
            }),
          ),
        );
      }
      return el("div", { className: "sf-section" }, children);
    }

    var inject = ["slots", "locale"];

    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      ctx.effect(function () {
        return ctx.locale.register(NS, { en: en, zh: zh });
      }, "skill-forge: dictionaries");
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          {
            name: "settings.section",
            id: "skill-forge",
            order: 42,
            label: function () { return t("nav"); },
            locale: NS,
          },
          SkillsSection,
        );
      });
      ctx.slots.inject("main", function () {
        return ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
            locale: NS,
          },
          SkillsPanel,
        );
      });
      ctx.slots.inject("sidebar.panellist", function () {
        return ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: PANEL_ORDER,
            label: function () { return t("nav"); },
            locale: NS,
          },
          SkillsPanelIcon,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
