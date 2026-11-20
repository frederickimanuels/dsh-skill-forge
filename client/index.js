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

    var css = ".sf-section{display:flex;flex-direction:column;gap:16px;max-width:820px;color:var(--dsw-alias-label-primary)}\n.sf-head{display:flex;flex-direction:column;gap:4px}\n.sf-title{margin:0;font-size:20px;font-weight:500;line-height:28px;color:var(--dsw-alias-label-primary)}\n.sf-sub{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}\n.sf-meta{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}\n.sf-meta code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}\n.sf-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.sf-search{flex:1 1 200px;min-width:0;box-sizing:border-box;height:30px;padding:0 9px;font-size:13px;font-family:inherit;color:var(--dsw-alias-label-primary);background:transparent;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md,8px)}\n.sf-search::placeholder{color:var(--dsw-alias-label-tertiary)}\n.sf-search:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 var(--dsw-focus-ring-width) var(--dsw-focus-ring-color)}\n.sf-filters{display:flex;align-items:center;gap:2px}\n.sf-chip{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:4px 9px;border-radius:999px;cursor:pointer;white-space:nowrap}\n.sf-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n.sf-chip[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary)}\n.sf-count{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}\n.sf-btn{appearance:none;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;line-height:18px;padding:6px 12px;border-radius:var(--dsw-radius-md,8px);cursor:pointer;white-space:nowrap}\n.sf-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}\n.sf-btn:disabled{opacity:.4;cursor:default}\n.sf-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-state-business-primary));color:var(--dsw-alias-label-primary-inverted,#fff)}\n.sf-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-state-business-primary))}\n.sf-btn-danger{border-color:transparent;background:var(--dsw-alias-state-error-primary,#c33);color:var(--dsw-alias-label-primary-inverted,#fff)}\n.sf-btn:focus-visible,.sf-chip:focus-visible,.sf-icon-btn:focus-visible{outline:none;box-shadow:0 0 0 var(--dsw-focus-ring-width) var(--dsw-focus-ring-color)}\n.sf-card{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg,10px);padding:12px;display:flex;flex-direction:column;gap:8px}\n.sf-label{font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-secondary)}\n.sf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}\n.sf-row-end{justify-content:flex-end}\n.sf-input{flex:1 1 260px;min-width:0;box-sizing:border-box;height:30px;padding:0 9px;font-size:13px;font-family:inherit;color:var(--dsw-alias-label-primary);background:transparent;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md,8px)}\n.sf-input::placeholder{color:var(--dsw-alias-label-tertiary)}\n.sf-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 var(--dsw-focus-ring-width) var(--dsw-focus-ring-color)}\n.sf-input:disabled{opacity:.5}\n.sf-list{display:flex;flex-direction:column;border-top:.5px solid var(--dsw-alias-border-l2)}\n.sf-skill{display:flex;align-items:flex-start;gap:12px;padding:10px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2)}\n.sf-skill:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.sf-skill-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}\n.sf-row-line{display:flex;align-items:baseline;gap:10px;min-width:0}\n.sf-name{font-size:13.5px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}\n.sf-tags{display:flex;gap:8px;margin-left:auto;flex:none;align-items:baseline}\n.sf-tag{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}\n.sf-desc{font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}\n.sf-skill-end{flex:none;display:flex;align-items:center;gap:4px;min-height:20px}\n.sf-confirm{display:flex;align-items:center;gap:4px}\n.sf-icon-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;transition:opacity .12s ease}\n@media (hover:hover) and (pointer:fine){.sf-icon-btn{opacity:0}.sf-skill:hover .sf-icon-btn,.sf-skill:focus-within .sf-icon-btn,.sf-icon-btn:focus-visible{opacity:1}}\n.sf-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover-danger,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-state-error-primary,#c33)}\n.sf-warn{font-size:11px;color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-secondary))}\n.sf-empty{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary);padding:20px 0;text-align:center}\n.sf-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#c33);overflow-wrap:anywhere}\n.sf-notice{font-size:12px;line-height:18px;color:var(--dsw-alias-state-business-primary)}\n.sf-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}\n.sf-spacer{flex:1}\n.sf-listitem{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}\n.sf-page{box-sizing:border-box;height:100%;max-height:100%;min-height:0;min-width:0;flex:1 1 auto;overflow:hidden;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}\n.sf-pageScroll{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;-webkit-overflow-scrolling:touch}\n.sf-pageScroll:focus{outline:none}\n.sf-pageContent{box-sizing:border-box;width:100%;max-width:960px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 48px}\n@media (width<=767px){.sf-pageContent{padding-inline:20px}}\n@media (width<=560px){.sf-row-line{flex-direction:column;align-items:flex-start;gap:0}.sf-tags{margin-left:0;gap:6px}.sf-name{font-size:13px}}\n.sf-page .sf-section{max-width:none;padding-top:28px}\n[data-platform=darwin] .sf-page .sf-section{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}";
    var tagId = "dsh-skill-forge/SkillsPage.module.css";
    if (typeof document !== "undefined") {
      // Upsert, not insert-once: a reloaded plugin must replace stale rules, not
      // inherit whatever an earlier bundle left in this tab.
      var tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]");
      if (tag === null) {
        tag = document.createElement("style");
        tag.dataset.plugin = "dsh-skill-forge";
        tag.dataset.pluginCss = tagId;
        document.head.appendChild(tag);
      }
      if (tag.textContent !== css) tag.textContent = css;
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
          "overwriteHint": "Names already in the store are skipped. To replace one, run the command line with --force.",
          "search": "Filter by name or description",
          "filterAll": "All",
          "filterModel": "Model",
          "filterUser": "User-only",
          "showing": "{shown} of {total}",
          "noMatch": "No skill matches this filter.",
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
          "overwriteHint": "同名技能会被跳过，需要替换请在命令行加 --force。",
          "search": "按名称或描述筛选",
          "filterAll": "全部",
          "filterModel": "模型可调用",
          "filterUser": "仅用户可调用",
          "showing": "{shown} / {total}",
          "noMatch": "没有符合条件的技能。",
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
        { className: "sf-page", role: "region" },
        el(
          "div",
          { className: "sf-pageScroll" },
          el("div", { className: "sf-pageContent" }, el(SkillsSection, props)),
        ),
      );
    }

    /** The inline remove glyph: a bare cross, drawn so the bundle needs no icon import. */
    function removeGlyph() {
      return el(
        "svg",
        { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", "aria-hidden": "true" },
        el("path", { d: "M3 3l6 6M9 3l-6 6" }),
      );
    }

    /**
     * One skill, as a single dense row.
     *
     * The list is a management view of a few hundred entries, so the row carries
     * only what is scanned for: name, what dialect it came from and how it can be
     * invoked. Removal is destructive and rare, so it is an icon button that
     * appears on hover or focus rather than a permanent button on every row.
     */
    function SkillRow(props) {
      var skill = props.skill;
      var t = props.t;
      var confirming = props.pendingRemove === skill.name;
      var meta = [skill.dialectLabel, skill.modelInvocable === true ? t("model") : t("userOnly")];
      var main = [
        el(
          "div",
          { key: "line", className: "sf-row-line" },
          el("span", { key: "name", className: "sf-name" }, skill.name),
          el(
            "span",
            { key: "tags", className: "sf-tags" },
            meta.map(function (label, index) {
              return el("span", { key: index, className: "sf-tag" }, label);
            }),
          ),
        ),
      ];
      if (skill.description) {
        main.push(el("div", { key: "desc", className: "sf-desc", title: skill.description }, skill.description));
      }
      var end;
      if (confirming) {
        end = el(
          "div",
          { key: "confirm", className: "sf-confirm" },
          el("button", { key: "do", type: "button", className: "sf-btn sf-btn-danger", disabled: props.busy, onClick: function () { props.onRemove(skill.name); } }, t("confirm")),
          el("button", { key: "no", type: "button", className: "sf-btn", disabled: props.busy, onClick: props.onCancelRemove }, t("cancel")),
        );
      } else {
        end = el(
          "button",
          {
            key: "remove",
            type: "button",
            className: "sf-icon-btn",
            title: t("remove"),
            "aria-label": t("remove") + ": " + skill.name,
            disabled: props.busy,
            onClick: function () { props.onAskRemove(skill.name); },
          },
          removeGlyph(),
        );
      }
      return el(
        "div",
        { className: "sf-skill" },
        el("div", { key: "main", className: "sf-skill-main" }, main),
        el("div", { key: "end", className: "sf-skill-end" }, end),
      );
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
      var queryState = useState("");
      var query = queryState[0];
      var setQuery = queryState[1];
      var filterState = useState("all");
      var filter = filterState[0];
      var setFilter = filterState[1];
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

      var needle = query.trim().toLowerCase();
      var filtered = skills.filter(function (skill) {
        if (filter === "model" && skill.modelInvocable !== true) return false;
        if (filter === "user" && skill.userInvocable !== true) return false;
        if (needle === "") return true;
        var haystack = String(skill.name) + " " + String(skill.description || "") + " " + String(skill.dialectLabel || "");
        return haystack.toLowerCase().indexOf(needle) !== -1;
      });

      /** One segmented-filter button; the pressed state is what the CSS keys on. */
      function chip(value, label) {
        return el(
          "button",
          {
            key: value,
            type: "button",
            className: "sf-chip",
            "aria-pressed": filter === value,
            onClick: function () { setFilter(value); },
          },
          label,
        );
      }

      var toolbar = el(
        "div",
        { key: "toolbar", className: "sf-toolbar" },
        el("input", {
          key: "search",
          className: "sf-search",
          type: "search",
          spellCheck: false,
          placeholder: t("search"),
          "aria-label": t("search"),
          value: query,
          onChange: function (event) { setQuery(event.target.value); },
        }),
        el("div", { key: "filters", className: "sf-filters", role: "group" }, [
          chip("all", t("filterAll")),
          chip("model", t("filterModel")),
          chip("user", t("filterUser")),
        ]),
        el("span", { key: "count", className: "sf-count" }, t("showing", { shown: filtered.length, total: skills.length })),
        el("button", { key: "refresh", type: "button", className: "sf-btn", disabled: disabled, onClick: load }, t("refresh")),
      );

      var children = [
        el(
          "div",
          { key: "head", className: "sf-head" },
          el("h2", { key: "title", className: "sf-title" }, t("title")),
          el("div", { key: "sub", className: "sf-sub" }, t("subtitle")),
        ),
        el(
          "div",
          { key: "meta", className: "sf-meta" },
          el("span", { key: "store" }, t("store") + ": ", el("code", { key: "code" }, (snapshot && snapshot.store) || "...")),
          Array.isArray(settings.roots) && settings.roots.length > 0
            ? el("span", { key: "roots" }, t("roots") + ": ", el("code", { key: "code" }, settings.roots.join(", ")))
            : null,
          snapshot && snapshot.truncated === true
            ? el("span", { key: "truncated", className: "sf-warn" }, t("truncatedNote", { count: (snapshot && snapshot.maxFiles) || skills.length }))
            : null,
        ),
        el(
          "div",
          { key: "import", className: "sf-card" },
          el("div", { key: "label", className: "sf-label" }, t("importTitle")),
          el(
            "div",
            { key: "row", className: "sf-row" },
            el("input", {
              key: "input",
              className: "sf-input",
              type: "text",
              spellCheck: false,
              placeholder: t("importPlaceholder"),
              "aria-label": t("importTitle"),
              value: source,
              disabled: disabled,
              onChange: function (event) { setSource(event.target.value); },
              onKeyDown: function (event) {
                if (event.key === "Enter" && canSubmit) onImport();
              },
            }),
            el("button", { key: "preview", type: "button", className: "sf-btn", disabled: canSubmit === false, onClick: onPreview }, busy === "preview" ? t("previewing") : t("preview")),
            el("button", { key: "go", type: "button", className: "sf-btn sf-btn-primary", disabled: canSubmit === false, onClick: onImport }, busy === "import" ? t("importing") : t("import")),
          ),
          el("div", { key: "hint", className: "sf-hint" }, t("importHint") + " " + t("overwriteHint")),
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
      children.push(toolbar);
      if (skills.length === 0) {
        children.push(el("div", { key: "empty", className: "sf-empty" }, busy === "load" ? t("loading") : t("empty")));
      } else if (filtered.length === 0) {
        children.push(el("div", { key: "nomatch", className: "sf-empty" }, t("noMatch")));
      } else {
        children.push(
          el(
            "div",
            { key: "list", className: "sf-list" },
            filtered.map(function (skill) {
              return el(SkillRow, {
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
