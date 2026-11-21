// Browser module: Arya Computer Use settings UI + chat activity rows.
// Derived from dsh-computer-use-win (MIT, Yu-tao-Li) — browser-policy, tool-preset,
// and community sections removed; behavior switches (headed/overlay/driver lock) added.
// 1.0.14 settings redesign: the page is built from the host's own settings kit
// (@deepseek-ai/dsh-client-ui-primitives — SettingsForm, SettingsFormModel, the control
// catalog), so staged drafts, inline field validation, the Overridden tag and the
// revision-fenced write are the host's own and the page carries no feature stylesheet
// (docs/web-styling.md: the primitives catalog is the only channel). Path fields get
// native pickers through ctx.remote.directoryPicker; Status is three one-line lane rows
// read from the host's loopback status route — the two MCP lanes publish facts files
// the route merges. Hosts without the catalog fall back to a plain form over the same
// save ladder, so the chat rows and the settings stay usable either way.
window.__ModuleLoader__.load({
  id: '@aryacode/dsh-plugin-arya-computer-use',
  factory: (require) => {
    const React = require('react'), h = React.createElement;
    const NS = 'aryaComputerUse.settings';
    // The host's own status route (index.js STATUS_PATH). Same-origin, loopback-only,
    // no token — the panel is read-only and the route already refuses non-loopback.
    const STATUS_PATH = '/plugins/arya/status';
    // The component catalog, as a seed-table module: require resolves it to the host's
    // own singleton when the host ships one (packages/client/web/src/seed.ts), and
    // throws on hosts that do not. The guarded require keeps everything else alive.
    let P = null;
    try { P = require('@deepseek-ai/dsh-client-ui-primitives'); } catch { P = null; }
    const defaults = {
      progressOverlayEnabled: true, progressOverlayMode: 'summary', progressOverlayOpacity: 60,
      progressOverlayWidth: 360, progressOverlayHeight: 240, progressOverlayPosition: 'top-right',
      progressOverlayX: 80, progressOverlayY: 80, progressOverlayLocked: true, progressLockShortcut: '',
      progressPreviewToken: 0, indicatorEnabled: true, cursorIndicatorEnabled: true,
      remoteIndicatorVisible: true, indicatorText: 'Arya is controlling your computer', pointerLabel: 'Arya', indicatorPosition: 'top',
      indicatorIdleMs: 800, stopShortcut: '', resumeToken: 0, previewToken: 0,
      headedDefault: false, overlayDefault: true, driverLockEnabled: true,
      toolPreset: 'lite',
      browserTools: 'core', browserProfile: '', browserSession: '', browserStateFile: '', browserCdp: '', browserExecutablePath: '', browserHeaded: false, browserToolFlags: 'strip',
      browserAllowedDomains: '', browserIdleTimeout: '', browserNamespace: '', browserCaCert: '', browserUseSystemCa: false, browserDefaultTimeoutMs: 0, browserConfirmActions: '',
      engineCallTimeoutMs: 150000, leaseRetryBaseMs: 800, screenshotDir: '',
    };
    const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    const dictionaries = {
      zh: {
        nav: '电脑操控', title: 'Arya 电脑操控', pluginDescription: '通过无障碍控件驱动 Windows 应用，接管时显示提示并可用 Esc 停止。',
        openSettings: '打开设置', intro: '查看接管提示，使用 Esc 停止桌面操作。',
        loadingSettings: '正在加载设置', notLoaded: '设置尚未加载', reloadSettings: '刷新',
        desktopTitle: '桌面通道', desktopHint: 'agent-desktop 引擎驱动 Windows 应用的方式：暴露哪些工具、是否允许真实键鼠、以及调用上限等。',
        indicatorTitle: '接管提示', indicator: '为应用窗口描边框', indicatorHint: '用边框标出 agent 正在操作的窗口，并显示提示条。不会高亮你自己的鼠标。',
        cursorIndicator: '显示虚拟光标', cursorIndicatorHint: '在 agent 操作的位置画一个虚拟光标。不会跟随或高亮你的真实鼠标。',
        appearance: '提示的更多选项', progressAppearance: '浮窗选项', advanced: '高级选项', text: '提示文字', position: '提示位置', top: '顶部', bottom: '底部',
        delay: '操作后保留提示', delayHint: '连续动作保持显示，减少闪烁。200–3000 毫秒。', ms: '毫秒',
        cursorLabel: 'Agent 名称', cursorLabelHint: '用于虚拟光标标签和进度面板标题，1–16 个字符。',
        remoteVisible: '远程与录屏可见', remoteVisibleHint: '让远程桌面、屏幕共享和录屏看到接管提示与浮窗。关闭后请求 Windows 把它们排除在捕获之外。',
        preview: '预览接管提示', previewed: '已请求预览；如果之前按 Esc 暂停，请先恢复控制。', previewHint: '请先保存更改，再预览屏幕上的实际效果。',
        progressTitle: '操作浮窗', progressOverlay: '显示操作浮窗', progressOverlayHint: '在屏幕上显示当前步骤、模型的思考与回复。',
        progressLocked: '锁定浮窗', progressLockedHint: '锁定后浮窗不抢焦点、不可拖动；可用快捷键解锁。',
        progressSync: '浮窗位置与大小与接管浮窗同步。', openProgress: '显示浮窗',
        progressMode: '浮窗内容', progressModeHint: '摘要只显示每个动作的简短一行；原始模型文本会把助手的未整理文本直接画在桌面上。', progressModeSummary: '摘要', progressModeSource: '原始模型文本',
        progressOpacity: '背景不透明度（%）', progressWidth: '宽度（像素）', progressHeight: '高度（像素）',
        progressPosition: '浮窗位置', progress_topRight: '右上', progress_topLeft: '左上', progress_bottomRight: '右下', progress_bottomLeft: '左下', progress_custom: '自定义',
        progressX: 'X 坐标', progressY: 'Y 坐标', progressShortcut: '浮窗解锁快捷键', progressShortcutHint: '按下后临时解锁浮窗以便拖动。留空表示不设置。',
        toolSurfaceTitle: '工具范围', toolPreset: '工具预设', toolPresetHint: 'lite 直接列出全部 28 个工具；lazy 只暴露 tools / snapshot / click，其余按需加载。修改后需重启 MCP 生效。', toolPresetLite: 'lite · 全部 28 个', toolPresetLazy: 'lazy · 按需加载',
        behaviorTitle: '操作方式', headedDefault: '真实鼠标和键盘', headedDefaultHint: '默认关闭：点击通过辅助功能接口或后台发送的消息完成，指针和前台窗口仍归你，文本走 set_value。开启后本对话内允许真实键盘鼠标输入（type、focus，以及没有其他路径的点击），会移动指针并短暂聚焦目标窗口。单次调用写 physical: true 是更窄的选择。',
        overlayDefault: '引擎会话叠加层', overlayDefaultHint: '启动桌面会话时启用引擎自带的光标叠加层。Arya 的虚拟光标不依赖它；除非你也想要引擎的标记，否则保持关闭。',
        driverLock: '单会话驱动', driverLockHint: '同一时间只允许一个对话操作桌面；其他对话调用桌面工具会收到 BUSY 提示。关闭后最近使用的对话自动接管。',
        engineCallTimeout: '单次调用上限（毫秒）', engineCallTimeoutHint: '一次引擎调用超过这个时间就返回超时信封。10000–300000；默认 150000。',
        leaseRetryBase: '争用重试基数（毫秒）', leaseRetryBaseHint: '桌面锁被占用时的重试间隔基数，每次翻倍（默认 800 → 1600 → 3200）。0 表示不重试、立即回答。100–10000。',
        screenshotDir: '截图目录', screenshotDirHint: 'screenshot 与 ocr 保存 PNG 的绝对路径目录；留空则用插件目录下的 screenshots。',
        browserTitle: '网页通道', webToolsGroup: '暴露哪些工具', webBrowserGroup: '使用哪个浏览器', webNetworkGroup: '网络与信任',
        browserTools: '工具范围', browserToolsHint: 'agent-browser 向 MCP 暴露的工具集（0.43.0 实测）：core 33 个、network 9、state 27、debug 40、tabs 13、react 8、mobile 15、webmcp 4、all 160。修改后需重启 MCP 生效。',
        browserFlags: '精简工具定义', browserFlagsHint: '插件启动网页通道时会把 host-wide 参数设好（域名走 AGENT_BROWSER_ALLOWED_DOMAINS，空闲超时、命名空间、证书、确认动作走命令行参数），因此每个工具里重复的这些参数可以删掉：strip 在 core 上删除 52 处参数（schema 24,594 B → 17,793 B，约省 1.7k token），lean 只保留会话与状态恢复相关项，off 保持 agent-browser 原样。修改后需重启 MCP 生效。', browserFlagsStrip: 'strip · 全部删除', browserFlagsLean: 'lean · 保留会话项', browserFlagsOff: 'off · 保持原样',
        browserProfile: 'Chrome 配置', browserProfileHint: '配置名称（如 Default）或目录路径，让网页通道复用你的登录状态。',
        browserSession: '会话名', browserSessionHint: '隔离的会话键；不同会话名的 Cookie 与标签页彼此独立。',
        browserCdp: '连接我的浏览器', browserCdpHint: 'CDP 地址，例如 http://127.0.0.1:9222。用 --remote-debugging-port=9222 启动 Chrome 即可共享已登录的窗口。',
        browserStateFile: '已保存的登录状态', browserStateFileHint: '用 agent-browser state save 保存的 JSON 状态文件路径。',
        browserExecutablePath: '浏览器程序路径', browserExecutablePathHint: '网页通道自己启动浏览器时使用的可执行文件绝对路径，例如 Edge 的 msedge.exe 路径；留空则由 agent-browser 自行查找系统 Chrome。',
        browserHeaded: '显示浏览器窗口', browserHeadedHint: '打开可见的 Chromium 窗口，而不是无头运行。',
        browserAllowedDomains: '允许的域名', browserAllowedDomainsHint: '逗号分隔的域名模式（可用 *. 前缀）。注意：引擎要求全新的浏览器上下文，不能与 Chrome 配置或会话名同时使用。',
        browserIdleTimeout: '空闲超时', browserIdleTimeoutHint: '守护进程空闲多久后退出，例如 45s、30m、1h；0 表示永不退出。留空为引擎默认 1h。',
        browserNamespace: '命名空间', browserNamespaceHint: '隔离守护进程的 socket 与状态目录；不同命名空间互不干扰。字母、数字、下划线和连字符。',
        browserCaCert: '自定义 CA 证书', browserCaCertHint: 'PEM 文件绝对路径，让网页通道信任你的内网证书。',
        browserUseSystemCa: '使用系统证书库', browserUseSystemCaHint: '除内置根证书外，同时信任 Windows 系统证书库里的根证书。',
        browserDefaultTimeout: '默认调用超时（毫秒）', browserDefaultTimeoutHint: '每个网页工具调用的默认上限；0 表示用引擎默认 120000。1000–600000。',
        browserConfirmActions: '需要确认的动作', browserConfirmActionsHint: '逗号分隔的策略动作 ID，例如 flow_write:deploy、plugin:vault:credential.read。列出的动作必须人工确认，不会自动放行。',
        browserRestart: '网页通道设置在下一次 MCP 重启后生效。',
        stop: '停止与恢复', escTitle: '按 Esc 停止操作', escAlways: 'Esc 始终可用',
        stopHint: '停止后保持暂停，准备好再恢复。普通鼠标移动不会停止接管。',
        resume: '恢复控制', resumed: '已请求恢复；下一次桌面调用继续。', resumeHint: '按 Esc 停止后，用这个按钮恢复桌面操作，无需重启。',
        extraStop: '自定义停止方式', shortcutHint: '点击“录制快捷键”，再按下想用的按键或组合键，例如 F8 或 Ctrl + Alt + K。保存后生效；恢复默认后仅保留 Esc。',
        record: '录制快捷键', rerecord: '重新录制', cancelRecord: '取消录制', clearShortcut: '恢复默认（Esc）',
        noShortcut: 'Esc（默认）', listening: '请按下快捷键…（Esc 取消）', listeningCancel: '按 Esc 取消',
        unsupportedKey: '请使用字母、数字、功能键或常用按键，可搭配 Ctrl、Alt、Shift、Win。',
        recordCancelled: '已取消录制', recordTimedOut: '录制已超时，请点击按钮重试。',
        save: '保存更改', discard: '放弃更改', dirty: '有未保存的更改', clean: '更改后点击保存',
        saved: '已保存', failed: '保存失败', unavailable: '当前宿主未提供可写设置，请在本机 DSH 中打开此页面。',
        invalid: '请填写 1–120 字的单行提示文字，并将隐藏延时设为 200–3000 的整数。',
        invalidJoin: '：', invalidText: '需为 1–120 个字符的单行文字', invalidLabel: '需为 1–16 个字符的单行文字', invalidDelay: '需为 200–3000 的整数',
        invalidName: '只能包含字母、数字、连字符和下划线', invalidCdp: '需为端口、http(s):// 或 ws(s):// 地址', invalidPath: '需为绝对路径（如 C:\\dir 或 /dir）',
        invalidDuration: '需为时长，例如 45s、30m、1h，或 0 表示禁用', invalidDomains: '每项需为域名或 *.域名', invalidActions: '每项需为策略动作 ID（字母、数字、_:*.-）',
        invalidTimeout: '需为 0 或 1000–600000', invalidCallTimeout: '需为 10000–300000', invalidLeaseBase: '需为 0 或 100–10000',
        persistFailed: '宿主未确认设置已保存，请刷新后重试。', moreInfo: '更多说明',
        statusTitle: '状态', statusUnavailable: '状态不可用。', statusRefresh: '刷新',
        statusLaneBrowser: '浏览器通道', statusLaneDesktop: '桌面通道', statusLaneSession: '本次会话',
        statusEngine: '引擎', statusNative: '原生程序', statusNativeMode: '解析方式', statusProfile: '工具集', statusStrip: '精简',
        statusTools: '暴露的工具', statusPreset: '预设', statusMount: 'MCP 挂载', statusMounted: '已挂载', statusNotMounted: '未挂载',
        statusTakeover: '接管', statusTakeoverRunning: '正在接管', statusTakeoverPaused: '已暂停', statusTakeoverIdle: '空闲',
        statusElevation: '权限', elevatedYes: '已管理员提权', elevatedNo: '未提权（需以管理员身份重启 AryaCode）', elevatedUnknown: '未知',
        statusLease: '驱动锁目录', leaseYes: '存在', leaseNo: '缺失（以管理员身份启动 AryaCode 后会自动创建）',
        statusEngines: '引擎自检', engineOk: '正常', engineMissing: '缺失', statusDriver: '当前驱动者', statusNone: '无',
        statusMode: { packagebin: '随包二进制', platformpackage: '平台包', shim: 'JS 兜底', downloaded: '已下载' },
        see: '查看了屏幕', read: '读取了界面控件', windows: '查看了打开的窗口', findControl: '查找了界面控件',
        clickAction: '点击了目标', valueAction: '填写了控件内容', typeAction: '输入了文本', keyAction: '发送了按键',
        scrollAction: '滚动了页面', waitAction: '等待了界面响应', ocrAction: '识别了屏幕文字',
        launchAction: '请求启动应用', toolsAction: '查看了工具配置', working: '正在操作…', completed: '已完成',
        failedAction: '未完成', stoppedAction: '已停止', seriesTitle: '本轮桌面操作', sentOnly: '操作已发送，效果待确认',
        showDetails: '查看步骤和截图', seriesCount: '步操作', stepError: '操作失败', and: '，并',
        toggleControl: '切换了控件', expandControl: '展开了控件分组', scrollTo: '滚动到了目标', chooseOption: '选择了选项',
        focusTarget: '聚焦了目标', clearField: '清空了控件',
        openPage: '打开了网页', readPage: '读取了网页', lookPage: '查看了网页', clickPage: '点击了网页元素', typePage: '在网页中输入',
        keyPage: '发送了按键', shotPage: '截取了网页', evalPage: '执行了页面脚本', tabsPage: '管理了标签页', closePage: '关闭了浏览器',
        waitPage: '等待网页响应', infoPage: '读取了页面信息', scrollPage: '滚动了网页', navPage: '导航到新地址', selectPage: '选择了选项',
        togglePage: '切换了页面控件', flowRun: '运行了已保存的流程', flowSave: '保存了网页流程', flowInspect: '查看了网页流程',
        browse: '选择文件夹…', chooseFile: '选择文件…', noFiles: '该文件夹中没有匹配的文件', detectedBrowsers: '检测到的浏览器', noDetectedBrowsers: '未检测到浏览器，请手动选择文件',
        technical: '技术详情', copy: '复制', copied: '已复制', truncatedAt: '内容已截断至', readOnly: '只读', saveSaving: '正在保存…',
        overridden: '已覆盖', reset: '恢复默认', invalidValue: '值无效', invalidRange: '需为范围内的整数', invalidChord: '需为按键或组合键，例如 F8 或 Ctrl+Alt+K', toolsUnit: '个工具',
        cardEngineSession: '引擎会话', cardCallLimits: '调用限制', cardStopResume: '停止与恢复', cardIndicator: '指示器', cardOverlay: '覆盖层', cardGeometry: '位置与尺寸',
        cardLaunch: '启动方式', cardNetworkPolicy: '网络与策略', cardToolSurface: '工具面板',
        factEngine: '引擎', factProfile: '工具档案', factNative: '原生二进制', factTools: '工具', factCeiling: '单次上限', factRetry: '重试基数', factState: '状态',
      },
      en: {
        nav: 'Computer Use', title: 'Arya Computer Use', pluginDescription: 'Drives Windows apps through accessibility controls, shows a takeover indicator, and stops on Esc.',
        openSettings: 'Open settings', intro: 'See when the agent controls your desktop. Press Esc to stop.',
        loadingSettings: 'Loading settings', notLoaded: 'Settings are not loaded', reloadSettings: 'Reload',
        desktopTitle: 'Desktop lane', desktopHint: 'How the agent-desktop engine drives Windows apps: which tools are exposed, whether real input is allowed, and the call limits.',
        indicatorTitle: 'Takeover indicator', indicator: 'Frame the app window', indicatorHint: 'A rim marks the window the agent is driving, with a banner. Your own pointer is never highlighted.',
        cursorIndicator: 'Show a ghost cursor', cursorIndicatorHint: 'Draws a synthetic cursor where the agent acts. Your real pointer is never followed or highlighted.',
        appearance: 'More indicator options', progressAppearance: 'Overlay options', advanced: 'Advanced options', text: 'Banner text', position: 'Banner position', top: 'Top', bottom: 'Bottom',
        delay: 'Keep visible after an action', delayHint: 'Stay visible between consecutive actions. 200–3000 milliseconds.', ms: 'ms',
        cursorLabel: 'Agent name', cursorLabelHint: 'Used for the ghost cursor tag and the progress panel header. 1–16 characters.',
        remoteVisible: 'Visible in remote sessions and recordings', remoteVisibleHint: 'Show the takeover indicator and overlay in remote access, screen sharing and recordings; turning it off asks Windows to exclude them from capture.',
        preview: 'Preview indicator', previewed: 'Preview requested; resume first if you previously stopped with Esc.', previewHint: 'Save changes before previewing the actual screen indicator.',
        progressTitle: 'Progress overlay', progressOverlay: 'Show the progress overlay', progressOverlayHint: 'Show the current step, reasoning and replies on screen.',
        progressLocked: 'Lock the overlay', progressLockedHint: 'A locked overlay never steals focus and cannot be dragged; a shortcut unlocks it.',
        progressSync: 'Overlay size and position stay in sync with the takeover overlay.', openProgress: 'Show overlay',
        progressMode: 'Overlay content', progressModeHint: "Summary shows one short action line per step. Raw model text paints the assistant's unprocessed text stream on your desktop.", progressModeSummary: 'Summary', progressModeSource: 'Raw model text',
        progressOpacity: 'Background opacity (%)', progressWidth: 'Width (px)', progressHeight: 'Height (px)',
        progressPosition: 'Overlay position', progress_topRight: 'Top right', progress_topLeft: 'Top left', progress_bottomRight: 'Bottom right', progress_bottomLeft: 'Bottom left', progress_custom: 'Custom',
        progressX: 'X coordinate', progressY: 'Y coordinate', progressShortcut: 'Overlay unlock shortcut', progressShortcutHint: 'Press to temporarily unlock the overlay so you can drag it. Empty means none.',
        toolSurfaceTitle: 'Tool surface', toolPreset: 'Tool preset', toolPresetHint: 'lite lists all 28 tools up front; lazy exposes tools / snapshot / click and loads the rest on demand. Changes apply after the next MCP restart.', toolPresetLite: 'lite · all 28', toolPresetLazy: 'lazy · load on demand',
        behaviorTitle: 'Control style', headedDefault: 'Real mouse and keyboard', headedDefaultHint: 'Off by default: clicks go through accessibility patterns or a background posted click, so the pointer and the foreground stay yours, and text goes through set_value. Turn on to allow real keyboard and mouse input for the rest of the conversation (type, focus, and a click that has no other way), which moves the pointer and briefly focuses the target window. physical: true on one call is the narrower choice.',
        overlayDefault: 'Engine session overlay', overlayDefaultHint: "Starts the desktop session with the engine's own cursor overlay. Arya's ghost cursor does not depend on it; leave it off unless you want the engine marker too.",
        driverLock: 'One conversation drives at a time', driverLockHint: 'While one conversation is driving, desktop calls from other conversations receive a BUSY notice. Turn off to let the most recent conversation take over automatically.',
        engineCallTimeout: 'Per-call ceiling (ms)', engineCallTimeoutHint: 'An engine call longer than this returns a timeout envelope. 10000–300000; default 150000.',
        leaseRetryBase: 'Contention retry base (ms)', leaseRetryBaseHint: 'Base gap before retrying a held desktop lease; each retry doubles it (default 800 → 1600 → 3200). 0 answers contention immediately. 100–10000.',
        screenshotDir: 'Screenshot folder', screenshotDirHint: "Absolute folder where screenshot and ocr write PNG files. Empty uses the plugin's own screenshots folder.",
        browserTitle: 'Web lane', webToolsGroup: 'Which tools', webBrowserGroup: 'Which browser', webNetworkGroup: 'Network and trust',
        browserTools: 'Tool surface', browserToolsHint: 'Which agent-browser tool profiles the MCP server exposes (measured on 0.43.0): core 33, network 9, state 27, debug 40, tabs 13, react 8, mobile 15, webmcp 4, all 160. Changing this applies on the next MCP restart.',
        browserFlags: 'Trim tool schemas', browserFlagsHint: 'The plugin sets the host-wide flags when it starts the web lane — domains through AGENT_BROWSER_ALLOWED_DOMAINS, idle timeout, namespace, certificates and confirmation actions as server flags — so the copies repeated inside every tool can go: strip removes 52 argument slots on core (schemas 24,594 B → 17,793 B, about 1.7k tokens), lean keeps the session and state-restore ones, off leaves the agent-browser schemas untouched. Changes apply after the next MCP restart.', browserFlagsStrip: 'strip · remove all', browserFlagsLean: 'lean · keep session flags', browserFlagsOff: 'off · keep as shipped',
        browserProfile: 'Chrome profile', browserProfileHint: 'A profile name such as Default, or a directory path, so the web lane reuses your sign-ins.',
        browserSession: 'Session', browserSessionHint: 'An isolated session key; cookies and tabs stay separate per name.',
        browserCdp: 'Connect to my browser', browserCdpHint: 'A CDP endpoint such as http://127.0.0.1:9222. Start Chrome with --remote-debugging-port=9222 to share a signed-in window.',
        browserStateFile: 'Saved sign-in state', browserStateFileHint: 'Path to a JSON state file written by agent-browser state save.',
        browserExecutablePath: 'Browser executable path', browserExecutablePathHint: 'Absolute path to the executable the web lane launches when it starts its own browser, for example the Edge msedge.exe path. Leave empty to let agent-browser find system Chrome.',
        browserHeaded: 'Show the browser window', browserHeadedHint: 'Open a visible Chromium window instead of running headless.',
        browserAllowedDomains: 'Allowed domains', browserAllowedDomainsHint: 'Comma-separated domain patterns (a *. prefix is allowed). Note: the engine needs a fresh browser context for this, so it cannot combine with a Chrome profile or a session name.',
        browserIdleTimeout: 'Idle timeout', browserIdleTimeoutHint: 'How long the daemon may sit idle before exiting, for example 45s, 30m, 1h; 0 never exits. Empty is the engine default of 1h.',
        browserNamespace: 'Namespace', browserNamespaceHint: 'Isolates the daemon sockets and state directories; namespaces never touch each other. Letters, numbers, hyphens and underscores.',
        browserCaCert: 'Custom CA certificate', browserCaCertHint: 'Absolute path to a PEM file, so the web lane trusts your internal certificates.',
        browserUseSystemCa: 'Trust the system certificate store', browserUseSystemCaHint: 'Also trust the roots in the Windows system certificate store, not only the built-in ones.',
        browserDefaultTimeout: 'Default call timeout (ms)', browserDefaultTimeoutHint: 'The default ceiling for every web tool call; 0 uses the engine default of 120000. 1000–600000.',
        browserConfirmActions: 'Actions needing confirmation', browserConfirmActionsHint: 'Comma-separated policy action ids, for example flow_write:deploy, plugin:vault:credential.read. Listed actions require approval — they are never auto-approved.',
        browserRestart: 'Web lane settings apply after the next MCP restart.',
        stop: 'Stop and resume', escTitle: 'Press Esc to stop', escAlways: 'Esc always works',
        stopHint: 'Control stays paused until you resume. Ordinary mouse movement does not stop it.',
        resume: 'Resume control', resumed: 'Resume requested; the next desktop call continues.', resumeHint: 'After a stop with Esc, resume desktop control without restarting anything.',
        extraStop: 'Custom stop shortcut', shortcutHint: 'Click Record shortcut, then press a key or combination, such as F8 or Ctrl + Alt + K. Save to apply. Restoring the default keeps only Esc.',
        record: 'Record shortcut', rerecord: 'Record again', cancelRecord: 'Cancel recording', clearShortcut: 'Restore default (Esc)',
        noShortcut: 'Esc (default)', listening: 'Press your shortcut… (Esc to cancel)', listeningCancel: 'Press Esc to cancel',
        unsupportedKey: 'Use a letter, number, function key or common key, optionally with Ctrl, Alt, Shift or Win.',
        recordCancelled: 'Recording cancelled', recordTimedOut: 'Recording timed out. Click the button to try again.',
        save: 'Save changes', discard: 'Discard changes', dirty: 'Unsaved changes', clean: 'Save after making changes',
        saved: 'Saved', failed: 'Save failed', unavailable: 'Writable settings are unavailable. Open this page in your local DSH host.',
        invalid: 'Use 1–120 characters on one line and an integer hide delay between 200 and 3000.',
        invalidJoin: ': ', invalidText: 'needs 1–120 characters on one line', invalidLabel: 'needs 1–16 characters on one line', invalidDelay: 'needs an integer between 200 and 3000',
        invalidName: 'may only contain letters, numbers, hyphens and underscores', invalidCdp: 'must be a port, an http(s):// URL or a ws(s):// URL', invalidPath: 'must be an absolute path (like C:\\dir or /dir)',
        invalidDuration: 'must be a duration such as 45s, 30m or 1h, or 0 to disable', invalidDomains: 'each entry must be a domain or *.domain', invalidActions: 'each entry must be a policy action id (letters, digits, _:*.-)',
        invalidTimeout: 'must be 0 or between 1000 and 600000', invalidCallTimeout: 'must be between 10000 and 300000', invalidLeaseBase: 'must be 0 or between 100 and 10000',
        persistFailed: 'The host did not confirm the saved settings. Refresh and retry.', moreInfo: 'More information',
        statusTitle: 'Status', statusUnavailable: 'Status unavailable.', statusRefresh: 'Refresh',
        statusLaneBrowser: 'Browser lane', statusLaneDesktop: 'Desktop lane', statusLaneSession: 'This session',
        statusEngine: 'Engine', statusNative: 'Native binary', statusNativeMode: 'Resolved by', statusProfile: 'Tool profile', statusStrip: 'Trimming',
        statusTools: 'Exposed tools', statusPreset: 'Preset', statusMount: 'MCP mount', statusMounted: 'mounted', statusNotMounted: 'not mounted',
        statusTakeover: 'Takeover', statusTakeoverRunning: 'driving now', statusTakeoverPaused: 'paused', statusTakeoverIdle: 'idle',
        statusElevation: 'Elevation', elevatedYes: 'elevated (administrator)', elevatedNo: 'not elevated — restart AryaCode as administrator', elevatedUnknown: 'unknown',
        statusLease: 'Lease root', leaseYes: 'present', leaseNo: 'missing — start AryaCode as administrator and it is created',
        statusEngines: 'Engine self-check', engineOk: 'ok', engineMissing: 'missing', statusDriver: 'Driving now', statusNone: 'none',
        statusMode: { packagebin: 'shipped binary', platformpackage: 'platform package', shim: 'JS fallback', downloaded: 'downloaded' },
        see: 'Viewed the screen', read: 'Read interface controls', windows: 'Listed open windows', findControl: 'Looked for controls',
        clickAction: 'Clicked the target', valueAction: 'Filled in a control', typeAction: 'Entered text', keyAction: 'Sent a key press',
        scrollAction: 'Scrolled the page', waitAction: 'Waited for the interface', ocrAction: 'Read screen text',
        launchAction: 'Requested app launch', toolsAction: 'Viewed tool settings', working: 'Working…', completed: 'Completed',
        failedAction: 'Incomplete', stoppedAction: 'Stopped', seriesTitle: 'Desktop activity', sentOnly: 'Input sent; effect unconfirmed',
        showDetails: 'Steps and screenshots', seriesCount: 'steps', stepError: 'Action failed', and: ', then ',
        toggleControl: 'Toggled a control', expandControl: 'Expanded a control group', scrollTo: 'Scrolled to the target', chooseOption: 'Chose an option',
        focusTarget: 'Focused the target', clearField: 'Cleared a control',
        openPage: 'Opened a page', readPage: 'Read the page', lookPage: 'Looked at the page', clickPage: 'Clicked in the page', typePage: 'Typed in the page',
        keyPage: 'Sent a key press', shotPage: 'Captured the page', evalPage: 'Evaluated on the page', tabsPage: 'Managed tabs', closePage: 'Closed the browser',
        waitPage: 'Waited for the page', infoPage: 'Read page information', scrollPage: 'Scrolled the page', navPage: 'Navigated', selectPage: 'Selected an option',
        togglePage: 'Toggled a page control', flowRun: 'Ran a saved flow', flowSave: 'Saved a page flow', flowInspect: 'Reviewed page flows',
        browse: 'Browse…', chooseFile: 'Choose file…', noFiles: 'No matching files in that folder', detectedBrowsers: 'Detected browsers', noDetectedBrowsers: 'None detected — use Choose file',
        technical: 'Technical details', copy: 'Copy', copied: 'Copied', truncatedAt: 'truncated at ', readOnly: 'Read-only', saveSaving: 'Saving…',
        overridden: 'Overridden', reset: 'Reset to default', invalidValue: 'invalid value', invalidRange: 'needs a whole number in range', invalidChord: 'use a key or combination such as F8 or Ctrl + Alt + K', toolsUnit: 'tools',
        cardEngineSession: 'Engine session', cardCallLimits: 'Call limits', cardStopResume: 'Stop and resume', cardIndicator: 'Indicator', cardOverlay: 'Overlay', cardGeometry: 'Position & size',
        cardLaunch: 'Launch', cardNetworkPolicy: 'Network & policy', cardToolSurface: 'Tool surface',
        factEngine: 'Engine', factProfile: 'Tool profile', factNative: 'Native binary', factTools: 'Tools', factCeiling: 'Per-call ceiling', factRetry: 'Retry base', factState: 'State',
      },
    };
    // Translations: apply() binds the registered namespace once; Card refreshes it
    // from the slot-provided t on every render, so a language switch mid-session
    // repaints nested components too. The English table is the offline fallback.
    let tr = (key) => (Object.prototype.hasOwnProperty.call(dictionaries.en, key) ? dictionaries.en[key] : key);
    const hasKey = (key) => Object.prototype.hasOwnProperty.call(dictionaries.en, key);
    function shortcutFromEvent(event) {
      const code = event.code || '', special = { Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Pause: 'Pause', CapsLock: 'CapsLock', NumLock: 'NumLock', ScrollLock: 'ScrollLock' };
      let key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit[0-9]$/.test(code) ? code.slice(5) : /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code) ? code : special[code];
      if (!key && event.keyCode >= 65 && event.keyCode <= 90) key = String.fromCharCode(event.keyCode);
      if (!key && event.keyCode >= 48 && event.keyCode <= 57) key = String.fromCharCode(event.keyCode);
      if (!key && event.keyCode >= 112 && event.keyCode <= 135) key = 'F' + (event.keyCode - 111);
      return key ? [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Win', key].filter(Boolean).join('+') : null;
    }
    // Field specs for the host model. The parse mirrors mcp/settings.mjs — the host
    // re-checks every write, so a draft the host would reject is flagged inline here
    // first, and an invalid draft blocks Save (SettingsFormModel.shell().invalid).
    const rxPath = /^(?:[A-Za-z]:[\\/]|\/)/;
    const rxDuration = /^(?:0|[0-9]+(?:\.[0-9]+)?(?:ms|s|m|h|d)?)$/i;
    const rxDomain = /^(?:\*\.)?[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
    const rxAction = /^[A-Za-z0-9_:*.-]+$/;
    const rxName = /^[\p{L}\p{N}_-]+$/u;
    const rxCdp = /^(?:\d{1,5}|https?:\/\/\S+|wss?:\/\/\S+)$/;
    const rxChord = /^[A-Za-z0-9]+(?:\+[A-Za-z0-9]+)*$/;
    const rxEntries = (text, rx) => text.split(/[,\s]+/).filter(Boolean).every((entry) => rx.test(entry));
    const boolField = (field) => ({ field, format: (v) => String(v === true), parse: (text) => ({ kind: 'set', value: text === 'true' }) });
    const choiceField = (field, values) => ({ field, format: (v) => String(v ?? ''), parse: (text) => (values.includes(text) ? { kind: 'set', value: text } : undefined) });
    const intField = (field, min, max, allowZero = false) => ({ field, format: (v) => String(v ?? ''), parse: (text) => {
      const s = text.trim();
      if (!s) return { kind: 'clear' };
      if (!/^-?\d+$/.test(s)) return undefined;
      const n = Number(s);
      if (allowZero && n === 0) return { kind: 'set', value: 0 };
      return n >= min && n <= max ? { kind: 'set', value: n } : undefined;
    } });
    const textField = (field, accept, emptyInvalid = false) => ({ field, format: (v) => String(v ?? ''), parse: (text) => {
      const s = text.trim();
      if (!s) return emptyInvalid ? undefined : { kind: 'clear' };
      return accept(s) ? { kind: 'set', value: s } : undefined;
    } });
    const specs = [
      boolField('headedDefault'), boolField('overlayDefault'), boolField('driverLockEnabled'),
      boolField('indicatorEnabled'), boolField('cursorIndicatorEnabled'), boolField('remoteIndicatorVisible'),
      boolField('progressOverlayEnabled'), boolField('progressOverlayLocked'),
      boolField('browserHeaded'), boolField('browserUseSystemCa'),
      choiceField('progressOverlayMode', ['summary', 'source']),
      choiceField('toolPreset', ['lite', 'lazy']),
      choiceField('browserToolFlags', ['strip', 'lean', 'off']),
      choiceField('indicatorPosition', ['top', 'bottom']),
      choiceField('browserTools', ['core', 'network', 'state', 'debug', 'tabs', 'react', 'mobile', 'webmcp', 'all']),
      choiceField('progressOverlayPosition', ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'custom']),
      intField('indicatorIdleMs', 200, 3000),
      intField('browserDefaultTimeoutMs', 1000, 600000, true),
      intField('engineCallTimeoutMs', 10000, 300000),
      intField('leaseRetryBaseMs', 100, 10000, true),
      intField('progressOverlayOpacity', 20, 100),
      intField('progressOverlayWidth', 240, 1600),
      intField('progressOverlayHeight', 160, 1600),
      intField('progressOverlayX', -32768, 32767),
      intField('progressOverlayY', -32768, 32767),
      textField('indicatorText', (s) => s.length <= 120 && !/[\r\n\x00-\x1f]/.test(s), true),
      textField('pointerLabel', (s) => s.length <= 16 && !/[\r\n\x00-\x1f]/.test(s), true),
      textField('browserSession', (s) => rxName.test(s)),
      textField('browserNamespace', (s) => rxName.test(s)),
      textField('browserCdp', (s) => rxCdp.test(s)),
      textField('browserIdleTimeout', (s) => rxDuration.test(s)),
      textField('browserAllowedDomains', (s) => rxEntries(s, rxDomain)),
      textField('browserConfirmActions', (s) => rxEntries(s, rxAction)),
      textField('browserProfile', () => true),
      textField('browserStateFile', (s) => rxPath.test(s)),
      textField('browserCaCert', (s) => rxPath.test(s)),
      textField('browserExecutablePath', (s) => rxPath.test(s)),
      textField('screenshotDir', (s) => rxPath.test(s)),
      textField('stopShortcut', (s) => rxChord.test(s)),
      textField('progressLockShortcut', (s) => rxChord.test(s)),
    ];
    // Label/hint dictionary keys that differ from the field name, plus placeholders
    // and numeric input hints. The host model throws on undeclared fields, so the
    // spec list above and the fields rendered below must stay in lockstep.
    const meta = {
      engineCallTimeoutMs: { label: 'engineCallTimeout', hint: 'engineCallTimeoutHint', numeric: true },
      leaseRetryBaseMs: { label: 'leaseRetryBase', hint: 'leaseRetryBaseHint', numeric: true },
      indicatorIdleMs: { label: 'delay', hint: 'delayHint', numeric: true },
      indicatorText: { label: 'text' },
      pointerLabel: { label: 'cursorLabel', hint: 'cursorLabelHint' },
      progressOverlayOpacity: { label: 'progressOpacity', numeric: true },
      progressOverlayWidth: { label: 'progressWidth', numeric: true },
      progressOverlayHeight: { label: 'progressHeight', numeric: true },
      progressOverlayX: { label: 'progressX', numeric: true },
      progressOverlayY: { label: 'progressY', numeric: true },
      browserDefaultTimeoutMs: { label: 'browserDefaultTimeout', hint: 'browserDefaultTimeoutHint', numeric: true },
      browserCdp: { placeholder: 'http://127.0.0.1:9222' },
      browserIdleTimeout: { placeholder: '30m' },
      browserAllowedDomains: { placeholder: 'example.com, *.example.org' },
      browserSession: { placeholder: 'arya' },
      browserNamespace: { placeholder: 'arya' },
      browserConfirmActions: { placeholder: 'flow_write:deploy, plugin:vault:credential.read' },
      browserProfile: { placeholder: 'Default' },
      stopShortcut: { label: 'extraStop', hint: 'shortcutHint' },
      progressLockShortcut: { label: 'progressShortcut', hint: 'progressShortcutHint' },
    };
    const invalidKeys = {
      indicatorText: 'invalidText', pointerLabel: 'invalidLabel', indicatorIdleMs: 'invalidDelay',
      browserSession: 'invalidName', browserNamespace: 'invalidName', browserCdp: 'invalidCdp',
      browserStateFile: 'invalidPath', browserExecutablePath: 'invalidPath', browserCaCert: 'invalidPath', screenshotDir: 'invalidPath',
      browserIdleTimeout: 'invalidDuration', browserAllowedDomains: 'invalidDomains', browserConfirmActions: 'invalidActions',
      browserDefaultTimeoutMs: 'invalidTimeout', engineCallTimeoutMs: 'invalidCallTimeout', leaseRetryBaseMs: 'invalidLeaseBase',
      progressOverlayOpacity: 'invalidRange', progressOverlayWidth: 'invalidRange', progressOverlayHeight: 'invalidRange',
      progressOverlayX: 'invalidRange', progressOverlayY: 'invalidRange',
      stopShortcut: 'invalidChord', progressLockShortcut: 'invalidChord',
    };
    // House visual language: hairline rows inside bordered cards (the
    // ChangedFiles.module.css:2 recipe), bili pill tabs, compact right-aligned
    // number inputs (General's font-size pattern), icon-card position pickers
    // (General's Appearance pattern). Host tokens only — no feature stylesheet.
    const hair = '0.5px solid var(--dsw-alias-border-l2,#8885)';
    const rowStyle = { display: 'flex', gap: '14px', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', flexWrap: 'wrap' };
    const mainStyle = { flex: '1 1 260px', minWidth: '220px' };
    const titleStyle = { fontSize: '13.5px', fontWeight: 500 };
    const descStyle = { margin: '3px 0 0', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary,#61666b)' };
    const groupStyle = { fontSize: '11.5px', fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-tertiary,#81858c)' };
    const controlsStyle = { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' };
    const monoStyle = { fontSize: '12px', fontFamily: 'var(--ds-font-family-code,ui-monospace,monospace)', color: 'var(--dsw-alias-label-secondary,#61666b)', overflowWrap: 'anywhere', textAlign: 'right' };
    const cardStyle = { border: hair, borderRadius: 'var(--dsw-radius-lg,12px)', background: 'var(--dsw-alias-bg-layer-1,transparent)', marginBottom: '14px', overflow: 'hidden' };
    const tabStyle = (active) => ({ padding: '5px 12px', borderRadius: 'var(--dsw-radius-md,8px)', border: '0.5px solid var(--dsw-alias-border-l3,#9998)', background: active ? 'var(--dsw-alias-bg-layer-3,#eee)' : 'transparent', color: 'inherit', font: 'inherit', fontSize: '13px', cursor: 'pointer' });
    const row = (key, titleKey, descKey, control) => h('div', { key, style: rowStyle },
      h('div', { style: mainStyle }, h('span', { style: titleStyle }, tr(titleKey)), descKey ? h('p', { style: descStyle }, tr(descKey)) : null),
      control);
    // A house card: bold internal title with an optional right slot, then
    // hairline-separated rows padded to the border — the first-party card shape.
    const card = (key, titleKey, rows, end) => h('div', { key, style: cardStyle },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px 10px' } },
        h('span', { style: { fontSize: '14px', fontWeight: 600 } }, tr(titleKey)),
        end ? h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' } }, end) : null),
      ...rows.filter(Boolean).map((child, index) => h('div', { style: { padding: '0 14px', borderTop: index ? hair : 'none' } }, child)));
    const valueProps = (name, model, shell, extra, idp) => {
      const st = model.field(name), m = meta[name] || {};
      const hintKey = m.hint !== undefined ? m.hint : hasKey(name + 'Hint') ? name + 'Hint' : undefined;
      return {
        id: idp + '-' + name,
        label: tr(m.label || name),
        hint: hintKey ? tr(hintKey) : undefined,
        text: st.text,
        overridden: st.overridden,
        invalid: st.invalid,
        overriddenLabel: tr('overridden'),
        resetLabel: tr('reset'),
        invalidLabel: tr(invalidKeys[name] || 'invalidValue'),
        disabled: !shell.writable,
        onEdit: (text) => model.edit(name, text),
        onReset: () => model.resetField(name),
        ...(m.numeric ? { numeric: true } : {}),
        ...(m.placeholder ? { placeholder: m.placeholder } : {}),
        ...(extra || {}),
      };
    };
    // Native folder dialog — the one OS picker the host exposes
    // (ctx.remote.directoryPicker.pick(); packages/client/ui-workspace/src/client/
    // navigation.ts:405). A cancelled dialog (value null) keeps the draft untouched.
    const pickFolder = (picker) => Promise.resolve(picker.pick()).then((response) => (response && response.ok && typeof response.value === 'string' && response.value ? response.value : null));
    // Honest two-step for file fields: no file chooser exists on the host, so the
    // dialog picks the containing folder and the filename comes from
    // directoryPicker.list() filtered by extension — never typed blind.
    const listFiles = (picker, accept, setFiles, setOpen) => {
      pickFolder(picker).then((folder) => {
        if (!folder) return null;
        return picker.list(folder).then((listing) => {
          const rows = listing && listing.ok && listing.value && Array.isArray(listing.value.entries)
            ? listing.value.entries.filter((entry) => accept.test(entry.name)).map((entry) => ({ id: entry.path, label: h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', maxWidth: '360px' } }, h(P.FileTypeIcon, { path: entry.name, size: 16 }), h(P.PathLabel, { path: entry.path })) }))
            : [];
          setFiles(rows.length ? rows : [{ id: '__none', label: tr('noFiles'), disabled: true }]);
          setOpen(true);
        });
      }).catch(() => { setFiles([{ id: '__none', label: tr('noFiles'), disabled: true }]); setOpen(true); });
    };
    function MenuField({ name, model, shell, titleKey, hintKey, items }) {
      const [open, setOpen] = React.useState(false);
      const st = model.field(name);
      const current = items.find((item) => item.id === st.text);
      return row(name, titleKey, hintKey,
        h('div', { style: controlsStyle },
          st.invalid ? h(P.Tag, { tone: 'danger' }, tr(invalidKeys[name] || 'invalidValue')) : null,
          h(P.Menu, { open, onClose: () => setOpen(false), selectedId: st.text, align: 'end', side: 'bottom', portal: true, items,
            onSelect: (id) => { model.edit(name, id); setOpen(false); },
            anchor: h(P.Button, { variant: 'outline', size: 'sm', disabled: !shell.writable, onClick: () => setOpen((v) => !v) }, current && current.short !== undefined ? current.short : st.text) })));
    }
    function FolderField({ name, model, shell, picker, idp }) {
      return h('div', { key: name, style: { padding: '2px 0 9px' } },
        h(P.SettingsValueField, valueProps(name, model, shell, undefined, idp)),
        picker ? h('div', { style: { ...controlsStyle, marginTop: '6px' } },
          h(P.Button, { variant: 'ghost', size: 'sm', icon: h(P.IconFolderOpenOutlineRegular, { size: 14 }), disabled: !shell.writable,
            onClick: () => { pickFolder(picker).then((folder) => { if (folder) model.edit(name, folder); }).catch(() => {}); } }, tr('browse'))) : null);
    }
    function FileField({ name, model, shell, picker, accept, idp }) {
      const [open, setOpen] = React.useState(false), [files, setFiles] = React.useState([]);
      return h('div', { key: name, style: { padding: '2px 0 9px' } },
        h(P.SettingsValueField, valueProps(name, model, shell, undefined, idp)),
        picker ? h('div', { style: { ...controlsStyle, marginTop: '6px' } },
          h(P.Menu, { open, onClose: () => setOpen(false), align: 'start', side: 'bottom', portal: true, items: files,
            onSelect: (id) => { if (id !== '__none') model.edit(name, id); setOpen(false); },
            anchor: h(P.Button, { variant: 'ghost', size: 'sm', icon: h(P.IconFolderOpenOutlineRegular, { size: 14 }), disabled: !shell.writable,
              onClick: () => listFiles(picker, accept, setFiles, setOpen) }, tr('chooseFile')) })) : null);
    }
    // browserExecutablePath: a menu of the browsers the host status route found on
    // this machine (index.js detectedBrowsers), with the two-step file picker as the
    // fallback for installs it could not locate.
    function ExecutableField({ name, model, shell, picker, browsers, idp }) {
      const [detected, setDetected] = React.useState(false);
      const [open, setOpen] = React.useState(false), [files, setFiles] = React.useState([]);
      const current = model.field(name).text;
      const detectedItems = (browsers || []).length
        ? browsers.map((entry) => ({ id: entry.path, label: h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', maxWidth: '380px' } }, h(P.FileTypeIcon, { path: entry.path, size: 16 }), h('span', null, entry.name), h(P.PathLabel, { path: entry.path })) }))
        : [{ id: '__none', label: tr('noDetectedBrowsers'), disabled: true }];
      return h('div', { key: name, style: { padding: '2px 0 9px' } },
        h(P.SettingsValueField, valueProps(name, model, shell, undefined, idp)),
        h('div', { style: { ...controlsStyle, marginTop: '6px' } },
          h(P.Menu, { open: detected, onClose: () => setDetected(false), align: 'start', side: 'bottom', portal: true, items: detectedItems,
            selectedId: (browsers || []).some((entry) => entry.path === current) ? current : undefined,
            onSelect: (id) => { model.edit(name, id); setDetected(false); },
            anchor: h(P.Button, { variant: 'outline', size: 'sm', disabled: !shell.writable, onClick: () => setDetected((v) => !v) } , tr('detectedBrowsers')) }),
          h(P.Menu, { open, onClose: () => setOpen(false), align: 'start', side: 'bottom', portal: true, items: files,
            onSelect: (id) => { if (id !== '__none') model.edit(name, id); setOpen(false); },
            anchor: h(P.Button, { variant: 'ghost', size: 'sm', icon: h(P.IconFolderOpenOutlineRegular, { size: 14 }), disabled: !shell.writable,
              onClick: () => listFiles(picker, /\.(?:exe)$/i, setFiles, setOpen) }, tr('chooseFile')) })));
    }
    function ShortcutRow({ name, model, shell }) {
      const [recording, setRecording] = React.useState(false), [note, setNote] = React.useState('');
      const st = model.field(name), m = meta[name] || {};
      React.useEffect(() => {
        if (!recording) return;
        if (!shell.writable) { setRecording(false); return; }
        const cancel = () => { setRecording(false); setNote(tr('recordCancelled')); };
        const keydown = (event) => {
          if (event.isComposing) return;
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.key === 'Escape' || event.code === 'Escape') { cancel(); return; }
          if (event.repeat || ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(event.key)) return;
          const chord = shortcutFromEvent(event);
          if (!chord) { setNote(tr('unsupportedKey')); return; }
          model.edit(name, chord); setNote(''); setRecording(false);
        };
        const timer = setTimeout(() => { setRecording(false); setNote(tr('recordTimedOut')); }, 15000);
        window.addEventListener('keydown', keydown, true);
        window.addEventListener('blur', cancel);
        return () => { clearTimeout(timer); window.removeEventListener('keydown', keydown, true); window.removeEventListener('blur', cancel); };
      }, [recording, shell.writable]);
      return h('div', { key: name, 'data-arya-shortcut': true, style: rowStyle },
        h('div', { style: mainStyle },
          h('span', { style: titleStyle }, tr(m.label || name)),
          m.hint ? h('p', { style: descStyle }, tr(m.hint)) : null,
          st.invalid ? h('p', { style: { ...descStyle, marginTop: '4px' } }, h(P.Tag, { tone: 'danger' }, tr(invalidKeys[name] || 'invalidChord'))) : null),
        h('div', { style: controlsStyle },
          h(P.ShortcutKeys, { keys: st.text ? st.text.split('+') : ['Esc'] }),
          !st.text ? h('span', { style: descStyle }, tr('noShortcut')) : null,
          recording ? h('span', { style: descStyle }, tr('listening')) : null,
          h(P.Button, { variant: 'outline', size: 'sm', disabled: !shell.writable, onClick: () => { setNote(''); setRecording((v) => !v); } }, tr(recording ? 'cancelRecord' : st.text ? 'rerecord' : 'record')),
          st.text ? h(P.Button, { variant: 'ghost', size: 'sm', disabled: !shell.writable, onClick: () => { model.edit(name, ''); setNote(''); } }, tr('clearShortcut')) : null,
          note ? h('span', { style: descStyle }, note) : null));
    }
    // Status: three house stat cards (the bili Overview pattern) — a StateDot and
    // title header with fact chips, mono fact lines, and the collapsed technical
    // disclosure. A failure is exactly one card and never touches the form.
    function StatusSection({ status, statusError, writable, onResume, load }) {
      const [open, setOpen] = React.useState(false), [copied, setCopied] = React.useState(false);
      const engines = status?.engines || {}, lanes = status?.lanes || {}, takeover = status?.takeover || {}, versions = status?.engines?.versions || {};
      const modeName = (mode) => (mode ? ((tr('statusMode') || {})[String(mode).replace(/-/g, '')] || mode) : tr('statusNone'));
      const browser = lanes.browser, desktop = lanes.desktop;
      const chip = (tone, text) => h(P.Tag, { tone }, text);
      const fact = (key, labelKey, value) => h('div', { key, style: { display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0' } },
        h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary,#61666b)' } }, tr(labelKey)),
        h('span', { style: monoStyle }, value));
      const statCard = (key, state, titleKey, facts, chips, foot) => h('div', { key, style: cardStyle },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '11px 14px 8px' } },
          h(P.StateDot, { state }), h('span', { style: { fontSize: '13.5px', fontWeight: 600 } }, tr(titleKey)),
          chips && chips.length ? h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '6px' } }, ...chips) : null),
        h('div', { style: { padding: '2px 14px 12px' } }, ...facts.filter(Boolean), foot || null));
      return h('div', { 'data-arya-status': 'true' },
        statusError && !status
          ? h('div', { style: { ...cardStyle, display: 'flex', gap: '9px', alignItems: 'center', padding: '12px 14px' } }, h(P.StateDot, { state: 'error' }), h('span', { style: titleStyle }, tr('statusUnavailable')))
          : h(React.Fragment, null,
            statCard('lane-browser', browser && browser.native ? 'done' : 'warning', 'statusLaneBrowser', [
              fact('f-engine', 'factEngine', 'agent-browser ' + (versions['agent-browser'] || '?')),
              browser ? fact('f-profile', 'factProfile', (browser.toolsProfile || '?') + ' · ' + (browser.stripMode || '?')) : null,
              browser ? fact('f-native', 'factNative', modeName(browser.nativeMode)) : null,
            ]),
            statCard('lane-desktop', desktop && desktop.nativeMode !== 'shim' ? 'done' : 'warning', 'statusLaneDesktop', [
              fact('f-engine', 'factEngine', 'agent-desktop ' + (versions['agent-desktop'] || '?')),
              desktop ? fact('f-tools', 'factTools', desktop.toolsExposed + ' / ' + desktop.toolsTotal + ' · ' + desktop.toolPreset) : null,
              desktop ? fact('f-ceiling', 'factCeiling', desktop.engineCallTimeoutMs + ' ' + tr('ms')) : null,
              desktop ? fact('f-retry', 'factRetry', desktop.leaseRetryBaseMs + ' ' + tr('ms')) : null,
            ], [engines.elevated === true ? chip('success', tr('elevatedYes')) : engines.elevated === false ? chip('danger', tr('elevatedNo')) : chip('quiet', tr('elevatedUnknown')),
              engines.lease ? (engines.lease.present ? chip('quiet', tr('leaseYes')) : chip('danger', tr('leaseNo'))) : null].filter(Boolean)),
            statCard('lane-session', takeover.running ? 'ongoing' : takeover.paused ? 'warning' : 'idle', 'statusLaneSession', [
              fact('f-state', 'factState', tr(takeover.running ? 'statusTakeoverRunning' : takeover.paused ? 'statusTakeoverPaused' : 'statusTakeoverIdle')),
            ], null, takeover.paused ? h('div', { style: { ...controlsStyle, marginTop: '6px' } },
              h(P.Button, { variant: 'outline', size: 'sm', 'data-arya-resume': true, disabled: !writable, onClick: onResume }, tr('resume'))) : null)),
        h(P.DisclosureRow, { icon: h(P.IconDataOutlineRegular, { size: 14 }), title: tr('technical'), open, expandable: true, onToggle: () => setOpen((v) => !v) },
          status ? h('div', null,
            h(P.JsonBlock, { label: 'status json', payload: status, truncatedLabel: (total) => tr('truncatedAt') + total }),
            h(P.Button, { variant: 'ghost', size: 'sm', onClick: () => { Promise.resolve(P.writeClipboard(JSON.stringify(status, null, 2))).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); } }, copied ? tr('copied') : tr('copy')))
            : h('span', { style: descStyle }, tr('statusUnavailable'))));
    }
    function useShell(props, model) {
      // The reserved hooks compartment arrives bound as useCard (ui-slots
      // InjectFace); the plain store member is the fallback for hosts whose slot
      // runtime predates the compartment.
      if (typeof props.useCard === 'function') return props.useCard((s) => s) || model.shell();
      return React.useSyncExternalStore(props.store.subscribe, props.store.getSnapshot);
    }
    function SettingsPage(props) {
      const { model, savePatch, picker, as = 'section', idPrefix = 'arya' } = props;
      const shell = useShell(props, model);
      const writable = shell.writable;
      const [message, setMessage] = React.useState('');
      const [status, setStatus] = React.useState(null), [statusError, setStatusError] = React.useState(false);
      const load = React.useCallback(() => {
        fetch(STATUS_PATH).then((response) => (response.ok ? response.json() : Promise.reject(Error(String(response.status)))))
          .then((body) => { setStatus(body); setStatusError(false); })
          .catch(() => setStatusError(true));
      }, []);
      React.useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);
      // One-shot host actions (preview, show overlay, resume) save staged drafts
      // first, then bump the token field through the same write ladder.
      const runAction = async (patch, successKey) => {
        setMessage('');
        if (model.shell().dirty) { await model.save(); if (model.shell().failed) { setMessage(tr('failed')); return; } }
        try { await savePatch(patch); setMessage(tr(successKey)); } catch (error) { setMessage(tr('failed') + ': ' + String((error && error.message) || error)); }
      };
      const positionCustom = model.field('progressOverlayPosition').text === 'custom';
      const browsers = status?.engines?.browsers || [];
      const switchRow = (name, titleKey, descKey) => row(name, titleKey, descKey,
        h(P.Switch, { checked: model.field(name).text === 'true', label: tr(titleKey), disabled: !writable, onChange: (next) => model.edit(name, String(next)) }));
      const segRow = (name, titleKey, options, descKey) => row(name, titleKey, descKey === undefined ? (hasKey(name + 'Hint') ? name + 'Hint' : null) : descKey,
        h(P.SegmentedControl, { id: idPrefix + '-' + name, label: tr(titleKey), value: model.field(name).text, options, disabled: !writable, onChange: (next) => model.edit(name, next) }));
      const valueRow = (name, extra) => h(P.SettingsValueField, { key: name, ...valueProps(name, model, shell, extra, idPrefix) });
      // Compact right-aligned number rows (General's font-size pattern): the model
      // still stages, validates and fences every edit.
      const numRow = (name, disabledExtra) => {
        const st = model.field(name), m = meta[name] || {};
        const hintKey = m.hint !== undefined ? m.hint : hasKey(name + 'Hint') ? name + 'Hint' : null;
        return h('div', { key: name, 'data-arya-num': name, style: rowStyle },
          h('div', { style: mainStyle },
            h('span', { style: titleStyle }, tr(m.label || name)),
            hintKey ? h('p', { style: descStyle }, tr(hintKey)) : null,
            st.invalid ? h('p', { style: { ...descStyle, marginTop: '4px' } }, tr(invalidKeys[name] || 'invalidRange')) : null),
          h('div', { style: controlsStyle },
            st.overridden ? h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
              h(P.Tag, { tone: 'quiet' }, tr('overridden')),
              h(P.Button, { variant: 'ghost', size: 'sm', disabled: !writable, onClick: () => model.resetField(name) }, tr('reset'))) : null,
            h('input', {
              id: idPrefix + '-' + name, value: st.text, disabled: !writable || disabledExtra === true,
              'aria-invalid': st.invalid ? 'true' : 'false', 'aria-label': tr(m.label || name),
              style: { width: '120px', padding: '5px 8px', border: '0.5px solid var(--dsw-alias-border-l4,#9996)', borderRadius: 'var(--dsw-radius-md,8px)', background: 'var(--dsw-alias-bg-layer-1,transparent)', color: 'inherit', font: 'inherit', fontSize: '13px' },
              onChange: (event) => model.edit(name, event.target.value),
            })));
      };
      // Icon-card position pickers (General's Appearance pattern).
      const iconCardsRow = (name, titleKey, descKey, options) => {
        const st = model.field(name);
        return h('div', { key: name, 'data-arya-iconcards': name, style: rowStyle },
          h('div', { style: mainStyle }, h('span', { style: titleStyle }, tr(titleKey)), descKey ? h('p', { style: descStyle }, tr(descKey)) : null),
          h('div', { style: { ...controlsStyle, gap: '6px' } }, options.map((option) => {
            const active = st.text === option.value;
            return h('button', {
              key: option.value, type: 'button', disabled: !writable, 'aria-pressed': active ? 'true' : 'false',
              onClick: () => model.edit(name, option.value),
              style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '58px', padding: '8px 10px', border: active ? hair : '0.5px solid var(--dsw-alias-border-l3,#9998)', borderRadius: 'var(--dsw-radius-md,8px)', background: active ? 'var(--dsw-alias-bg-layer-3,#eee)' : 'transparent', color: 'inherit', font: 'inherit', fontSize: '11.5px', cursor: 'pointer' },
            }, h('span', { style: { fontSize: '16px', lineHeight: 1 }, 'aria-hidden': 'true' }, option.glyph), option.label);
          })));
      };
      // One screenful per lane (the bili pill tabs); switching tabs never
      // unmounts the form, so staged drafts survive.
      const tabs = [['desktop', 'desktopTitle'], ['indicator', 'indicatorTitle'], ['progress', 'progressTitle'], ['browser', 'browserTitle'], ['status', 'statusTitle']];
      const [tab, setTab] = React.useState('desktop');
      return h(as, { 'data-arya-settings': 'true' },
        h(P.SettingsForm, {
          labels: { unavailable: tr('unavailable'), readOnly: tr('readOnly'), saveFailed: tr('failed'), save: tr('save'), saving: tr('saveSaving') },
          state: shell, onSave: () => model.save(), onDiscard: () => model.discard(),
        },
          // Header: the Remote & Mobile pattern — title + version chip, package chip right.
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
            h('h2', { style: { margin: '4px 0 0', fontSize: '17px', fontWeight: 600 } }, tr('title')),
            h(P.Tag, { tone: 'quiet' }, 'v' + ((status && status.version) || '1.0.14')),
            h('span', { style: { marginLeft: 'auto', ...monoStyle, border: '0.5px solid var(--dsw-alias-border-l4,#9996)', borderRadius: 'var(--dsw-radius-sm,6px)', padding: '3px 8px' } }, 'dsh-plugin-arya-computer-use')),
          h('p', { style: descStyle }, tr('intro')),
          h('div', { role: 'tablist', 'data-arya-tabs': true, style: { display: 'flex', gap: '6px', margin: '14px 0 16px', flexWrap: 'wrap' } },
            tabs.map(([id, titleKey]) => h('button', { key: id, type: 'button', role: 'tab', 'data-arya-tab': id, 'aria-selected': tab === id ? 'true' : 'false', style: tabStyle(tab === id), onClick: () => setTab(id) }, tr(titleKey)))),
          tab === 'desktop' ? h('div', { role: 'tabpanel', 'data-arya-desktop-settings': true },
            card('engine-session', 'cardEngineSession', [
              switchRow('headedDefault', 'headedDefault', 'headedDefaultHint'),
              switchRow('overlayDefault', 'overlayDefault', 'overlayDefaultHint'),
              switchRow('driverLockEnabled', 'driverLock', 'driverLockHint'),
              segRow('toolPreset', 'toolPreset', [{ value: 'lite', label: tr('toolPresetLite') }, { value: 'lazy', label: tr('toolPresetLazy') }]),
            ]),
            card('call-limits', 'cardCallLimits', [
              numRow('engineCallTimeoutMs'),
              numRow('leaseRetryBaseMs'),
              h(FolderField, { name: 'screenshotDir', model, shell, picker, idp: idPrefix }),
            ]),
            // The stop contract: Esc is always live; the custom chord is recorded,
            // never typed. Resume lives in the session card of Status.
            card('stop-resume', 'cardStopResume', [
              row('esc', 'escTitle', 'stopHint', h(P.Tag, { tone: 'neutral' }, tr('escAlways'))),
              h(ShortcutRow, { name: 'stopShortcut', model, shell }),
            ])) : null,
          tab === 'indicator' ? h('div', { role: 'tabpanel', 'data-arya-indicator-settings': true },
            card('indicator', 'cardIndicator', [
              switchRow('indicatorEnabled', 'indicator', 'indicatorHint'),
              switchRow('cursorIndicatorEnabled', 'cursorIndicator', 'cursorIndicatorHint'),
              switchRow('remoteIndicatorVisible', 'remoteVisible', 'remoteVisibleHint'),
              iconCardsRow('indicatorPosition', 'position', null, [{ value: 'top', glyph: '↑', label: tr('top') }, { value: 'bottom', glyph: '↓', label: tr('bottom') }]),
              numRow('indicatorIdleMs'),
              valueRow('indicatorText'),
              valueRow('pointerLabel'),
            ], h(P.Button, { variant: 'outline', size: 'sm', disabled: !writable, onClick: () => runAction({ previewToken: Date.now() }, 'previewed') }, tr('preview')))) : null,
          tab === 'progress' ? h('div', { role: 'tabpanel', 'data-arya-progress-settings': true },
            card('overlay', 'cardOverlay', [
              switchRow('progressOverlayEnabled', 'progressOverlay', 'progressOverlayHint'),
              switchRow('progressOverlayLocked', 'progressLocked', 'progressLockedHint'),
              segRow('progressOverlayMode', 'progressMode', [{ value: 'summary', label: tr('progressModeSummary') }, { value: 'source', label: tr('progressModeSource') }], 'progressModeHint'),
              h(ShortcutRow, { name: 'progressLockShortcut', model, shell }),
            ], h(P.Button, { variant: 'outline', size: 'sm', 'data-arya-open-progress': true, disabled: !writable, onClick: () => runAction({ progressOverlayEnabled: true, progressPreviewToken: Date.now() }, 'previewed') }, tr('openProgress'))),
            card('geometry', 'cardGeometry', [
              numRow('progressOverlayOpacity'),
              numRow('progressOverlayWidth'),
              numRow('progressOverlayHeight'),
              iconCardsRow('progressOverlayPosition', 'progressPosition', null, [
                { value: 'top-left', glyph: '↖', label: tr('progress_topLeft') },
                { value: 'top-right', glyph: '↗', label: tr('progress_topRight') },
                { value: 'bottom-left', glyph: '↙', label: tr('progress_bottomLeft') },
                { value: 'bottom-right', glyph: '↘', label: tr('progress_bottomRight') },
                { value: 'custom', glyph: '⌖', label: tr('progress_custom') }]),
              numRow('progressOverlayX', !positionCustom),
              numRow('progressOverlayY', !positionCustom),
            ])) : null,
          tab === 'browser' ? h('div', { role: 'tabpanel', 'data-arya-browser-settings': true },
            card('launch', 'cardLaunch', [
              switchRow('browserHeaded', 'browserHeaded', 'browserHeadedHint'),
              h(ExecutableField, { name: 'browserExecutablePath', model, shell, picker, browsers, idp: idPrefix }),
              h(FolderField, { name: 'browserProfile', model, shell, picker, idp: idPrefix }),
              valueRow('browserSession'),
              valueRow('browserCdp'),
              h(FileField, { name: 'browserStateFile', model, shell, picker, accept: /\.json$/i, idp: idPrefix }),
            ]),
            card('network-policy', 'cardNetworkPolicy', [
              valueRow('browserAllowedDomains'),
              valueRow('browserNamespace'),
              valueRow('browserIdleTimeout'),
              h(FileField, { name: 'browserCaCert', model, shell, picker, accept: /\.(?:pem|crt)$/i, idp: idPrefix }),
              switchRow('browserUseSystemCa', 'browserUseSystemCa', 'browserUseSystemCaHint'),
              numRow('browserDefaultTimeoutMs'),
              valueRow('browserConfirmActions'),
              h('p', { style: { ...descStyle, padding: '4px 0 10px' } }, tr('browserRestart')),
            ]),
            card('tool-surface', 'cardToolSurface', [
              h(MenuField, { name: 'browserTools', model, shell, titleKey: 'browserTools', hintKey: 'browserToolsHint', items: [
                ['core', 33], ['network', 9], ['state', 27], ['debug', 40], ['tabs', 13], ['react', 8], ['mobile', 15], ['webmcp', 4], ['all', 160],
              ].map(([id, count]) => ({ id, short: id + ' · ' + count, label: id + ' · ' + count + ' ' + tr('toolsUnit') })) }),
              segRow('browserToolFlags', 'browserFlags', [{ value: 'strip', label: tr('browserFlagsStrip') }, { value: 'lean', label: tr('browserFlagsLean') }, { value: 'off', label: tr('browserFlagsOff') }], 'browserFlagsHint'),
            ])) : null,
          tab === 'status' ? h('div', { role: 'tabpanel', 'data-arya-status-tab': true },
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', margin: '0 0 10px' } },
              h(P.Button, { variant: 'ghost', size: 'sm', icon: h(P.IconRefreshOutlineRegular, { size: 14 }), onClick: load }, tr('statusRefresh'))),
            h(StatusSection, { status, statusError, writable, load, onResume: () => runAction({ resumeToken: Date.now() }, 'resumed') })) : null,
          message ? h('p', { key: 'message', role: 'status', 'aria-live': 'polite', style: descStyle }, message) : null));
    }
    // Hosts without the primitives catalog keep a working plain form over the same
    // save ladder — the settings stay editable and the chat rows never depend on it.
    function LegacyCard({ scope, savePatch, as = 'li' }) {
      const state = React.useSyncExternalStore((fn) => scope.subscribe(fn), () => scope.getSnapshot());
      if ((state.status !== undefined && state.status !== 'ready') || !state.value) return h(as, { 'data-arya-unavailable': true }, h('p', { role: 'status' }, tr(state.status === 'loading' ? 'loadingSettings' : 'notLoaded')), h('button', { type: 'button', onClick: () => window.location.reload() }, tr('reloadSettings')));
      const saved = { ...defaults, ...state.value };
      const keys = Object.keys(defaults).filter((key) => !/Token$/.test(key));
      const [draft, setDraft] = React.useState(saved);
      const dirty = keys.some((key) => !equal(draft[key], saved[key]));
      const [message, setMessage] = React.useState('');
      const change = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
      const save = () => {
        const patch = {};
        for (const key of keys) if (!equal(draft[key], saved[key])) patch[key] = draft[key];
        savePatch(patch).then(() => setMessage(tr('saved'))).catch((error) => setMessage(tr('failed') + ': ' + String((error && error.message) || error)));
      };
      return h(as, { 'data-arya-settings': 'true' },
        h('h2', null, tr('title')), h('p', null, tr('intro')),
        ...keys.map((key) => h('label', { key, style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '4px 0' } },
          h('span', { style: { minWidth: '240px' } }, hasKey(key) ? tr(key) : key),
          typeof defaults[key] === 'boolean' ? h('input', { type: 'checkbox', checked: !!draft[key], onChange: (event) => change(key, event.target.checked) })
            : typeof defaults[key] === 'number' ? h('input', { type: 'number', value: draft[key], onChange: (event) => change(key, Number(event.target.value)) })
              : h('input', { type: 'text', size: 40, value: draft[key], onChange: (event) => change(key, event.target.value) }))),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
          h('button', { type: 'button', disabled: !dirty, onClick: () => { setDraft(saved); setMessage(''); } }, tr('discard')),
          h('button', { type: 'button', disabled: !dirty, onClick: save }, tr('save'))),
        message ? h('p', { role: 'status' }, message) : null);
    }
    function Card(props) {
      if (typeof props.t === 'function') tr = props.t;
      if (props.view === 'summary') return h('span', { 'data-arya-summary': true }, tr('pluginDescription'), ' ', h('span', { style: { color: 'var(--dsw-alias-label-link,#71a7ff)' } }, tr('openSettings')));
      if (!P || !props.model) return h(LegacyCard, props);
      return h(SettingsPage, props);
    }
    // Chat rows, keyed by wire tool name per lane (AGENTS.md rule 9). The desktop
    // table used to cover 16 of the 28 exposed tools and the web table 29 names;
    // both now cover every tool the lanes can expose (28 + 34 = 62 keys), so no
    // call falls back to the generic card.
    const actionKeys = { snapshot: 'see', screenshot: 'see', list_windows: 'windows', find: 'findControl', get: 'read', is: 'read', click: 'clickAction', set_value: 'valueAction', type: 'typeAction', press: 'keyAction', scroll: 'scrollAction', wait: 'waitAction', ocr: 'ocrAction', launch: 'launchAction', batch: 'seriesTitle', tools: 'toolsAction', check: 'toggleControl', uncheck: 'toggleControl', toggle: 'toggleControl', expand: 'expandControl', collapse: 'expandControl', scroll_to: 'scrollTo', select: 'chooseOption', focus: 'focusTarget', focus_window: 'focusTarget', double_click: 'clickAction', right_click: 'clickAction', clear: 'clearField' };
    const browserActionKeys = { open: 'openPage', read: 'readPage', snapshot: 'lookPage', click: 'clickPage', dblclick: 'clickPage', fill: 'typePage', type: 'typePage', press: 'keyPage', screenshot: 'shotPage', eval: 'evalPage', tab_new: 'tabsPage', tab_list: 'tabsPage', tab_switch: 'tabsPage', tab_close: 'tabsPage', close: 'closePage', wait_ms: 'waitPage', wait_for_selector: 'waitPage', wait_for_text: 'waitPage', wait_for_load: 'waitPage', get_text: 'readPage', get_url: 'infoPage', get_title: 'infoPage', scroll: 'scrollPage', back: 'navPage', forward: 'navPage', reload: 'navPage', select: 'selectPage', check: 'togglePage', uncheck: 'togglePage', flow_run: 'flowRun', flow_save: 'flowSave', flow_list: 'flowInspect', flow_steps: 'flowInspect', tools_profiles: 'toolsAction' };
    const isBrowserTool = (name) => /^mcp__arya_browser__/.test(name || '');
    const shortTool = (name) => String(name || '').replace(/^mcp__arya_desktop__/, '').replace(/^mcp__arya_browser__agent_browser_/, '');
    const desktopTool = (name) => /^mcp__arya_desktop__(?!tools$)[a-z_]+$/.test(name || '') || (/^mcp__arya_browser__agent_browser_[a-z_]+$/.test(name || '') && name !== 'mcp__arya_browser__agent_browser_close');
    const objectArgs = (value) => { if (typeof value === 'string') try { return JSON.parse(value); } catch { return {}; } return value && typeof value === 'object' ? value : {}; };
    function receipt(message) {
      for (const part of message?.content || []) if (part.type === 'text' && typeof part.text === 'string') try { return JSON.parse(part.text); } catch {}
      return {};
    }
    const resultStatus = (message) => message?.isError ? ((message.content || []).some((part) => part.type === 'text' && /COMPUTER_USE_STOPPED_BY_USER|COMPUTER_USE_STOPPED_IN_DSH/.test(part.text)) ? 'stopped' : 'failed') : 'completed';
    const mouseIcon = () => h('svg', { viewBox: '0 0 24 24', width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true, style: { verticalAlign: 'middle', flexShrink: 0 } }, h('rect', { x: 6, y: 2, width: 12, height: 20, rx: 6 }), h('path', { d: 'M12 2v7M6 10h12' }));
    const activityCss = `.arya-activity{color:var(--dsw-alias-label-secondary,inherit);font-size:13px;line-height:1.6;margin:7px 0}.arya-activity>summary{cursor:pointer;display:flex;align-items:center;gap:8px;list-style:none}.arya-activity>summary::-webkit-details-marker{display:none}.arya-activity .arya-activity-label{color:var(--dsw-alias-label-primary,inherit)}.arya-activity .arya-activity-state{font-size:12px;opacity:.72;margin-left:4px}.arya-activity[open]{padding-bottom:8px}.arya-activity ol{margin:10px 0 4px 22px;padding-left:16px}.arya-activity li{padding:3px 0}.arya-activity .arya-activity-note{font-size:12px;opacity:.75}.arya-activity button{color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l2,#8885);border-radius:6px;padding:3px 8px;cursor:pointer}`;
    function actionText(call, t) {
      const args = objectArgs(call.args), action = shortTool(call.name);
      let label = t((isBrowserTool(call.name) ? browserActionKeys[action] : actionKeys[action]) || 'seriesTitle');
      if (action === 'find') { const query = args.name || args.text || args.value; if (query) label += '「' + String(query).slice(0, 60) + '」'; }
      if (action === 'launch' && args.app) label += '「' + String(args.app).slice(0, 60) + '」';
      return label;
    }
    function seriesText(calls, t) {
      const actions = [...new Set(calls.filter((c) => c.status === 'completed').map((c) => actionText(c, t)))];
      return actions.slice(-3).join(t('and')) || t('seriesTitle');
    }
    function activityBody(call, renderFactorySlot, loadImage, t) {
      const data = receipt(call.message), images = (call.message?.content || []).filter((x) => x.type === 'image' && x.attachment);
      const disposition = data?.data?.disposition || {};
      return h(React.Fragment, null,
        disposition.delivery === 'delivered_unverified' && h('div', { className: 'arya-activity-note' }, t('sentOnly')),
        ['failed', 'stopped'].includes(call.status) && h('div', { role: 'status' }, t(call.status === 'stopped' ? 'stoppedAction' : 'stepError')),
        images.length > 0 && renderFactorySlot && loadImage && renderFactorySlot('conversation.images.content', { images, loadImage, align: 'start' }));
    }
    function MouseToolRow({ toolName, phase, block, renderFactorySlot, loadImage, inspect, t }) {
      const message = phase === 'result' ? block.message : undefined;
      const status = phase === 'result' ? resultStatus(message) : 'working';
      const call = { name: toolName, args: block.call?.arguments ?? block.arguments, message, status };
      const stateKey = status === 'failed' ? 'failedAction' : status === 'stopped' ? 'stoppedAction' : status;
      return h('details', { className: 'arya-activity', 'data-arya-action': true },
        h('style', null, activityCss),
        h('summary', null,
          mouseIcon(),
          h('span', { className: 'arya-activity-label' }, status === 'working' ? t('working') : actionText(call, t)),
          h('span', { className: 'arya-activity-state' }, t(stateKey)),
          activityBody(call, renderFactorySlot, loadImage, t),
          inspect && h('button', { type: 'button', onClick: inspect }, t('showDetails'))));
    }
    function reduceSeries(state, event) {
      const data = event.data || {};
      if (event.type === 'tool/call' && desktopTool(data.name)) return { ...state, calls: [...state.calls, { id: data.callId, name: data.name, args: data.arguments, seq: event.seq, status: 'working' }] };
      if (event.type === 'tool/result') return { ...state, calls: state.calls.map((call) => call.id === data.message?.callId ? { ...call, message: data.message, status: resultStatus(data.message) } : call) };
      if (event.type === 'turn/end') return { ...state, ended: true, reason: data.reason?.kind || 'completed' };
      return state;
    }
    const seriesDefinition = {
      kind: 'arya-series', target: 'chat',
      match: (event) => ['turn/start', 'turn/end', 'tool/call', 'tool/result'].includes(event.type) && Number.isInteger(event.data?.turn) ? { id: String(event.data.turn), role: 'start' } : null,
      start: (_context, match) => reduceSeries({ calls: [], seq: match.event.seq, ended: false }, match.event),
      update: (context, match) => reduceSeries(context.state, match.event),
      buildViewNode: (context) => !context.state?.ended || !context.state.calls.length ? null : { key: context.key, kind: 'arya-series', id: context.id, target: 'chat', anchorSeq: context.state.calls[0].seq, location: context.start?.location ?? { kind: 'unresolved' }, visibility: 'visible', data: context.state },
    };
    function SeriesRow({ node, t, renderFactorySlot, loadImage }) {
      const state = node.data, status = state.reason === 'aborted' || state.calls.some((c) => c.status === 'stopped') ? 'stoppedAction' : state.reason === 'error' || state.calls.some((c) => c.status !== 'completed') ? 'failedAction' : 'completed';
      return h('details', { className: 'arya-activity', 'data-arya-series': true }, h('style', null, activityCss), h('summary', null, mouseIcon(), h('span', { className: 'arya-activity-label' }, seriesText(state.calls, t)), h('span', { className: 'arya-activity-state' }, t(status) + ' · ' + state.calls.length + ' ' + t('seriesCount'))), h('ol', null, ...state.calls.map((call) => h('li', { key: call.id }, actionText(call, t), activityBody(call, renderFactorySlot, loadImage, t)))));
    }
    function registerActivity(ctx) {
      // Keys are wire Tool names, one per lane. A bare key collides with a first-party toolview at priority 0
      // (issue #1: the '' prefix produced key "read", which the shipped read-toolview owns). A cross-product of the
      // two action tables collides too, on the names they share (snapshot, screenshot, click, type, press, scroll),
      // because each would register the same key twice. The injection is a generator, so any collision aborts every
      // later key — which is why the web-lane rows silently fell back to the generic card.
      const keys = [...Object.keys(actionKeys).map((name) => 'mcp__arya_desktop__' + name), ...Object.keys(browserActionKeys).map((name) => 'mcp__arya_browser__agent_browser_' + name)];
      ctx.slots.inject('tool.call.toolview', function* () { for (const key of keys) yield ctx.slots.register({ name: 'tool.call.toolview', key, locale: NS }, MouseToolRow); });
      ctx.inject(['uiConversation'], (owner) => {
        owner.uiConversation.events.register(seriesDefinition);
        ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'arya-series', locale: NS }, SeriesRow));
      });
    }
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries));
      registerActivity(ctx);
      const t = ctx.locale.bind ? ctx.locale.bind(NS) : (key) => key;
      tr = t;
      let mounted = false;
      let modernRemote;
      // The native dialogs (ui-directory-picker-native; owner always allowed).
      // Captured separately from the mount triggers on purpose: the picker must not
      // gate the mount, or hosts without that compartment lose the settings page
      // entirely — without a picker the path fields simply stay typed by hand.
      // Both paths must be declared, exactly as ui-workspace's own required list
      // does ('remote' AND 'remote.directoryPicker'): 'remote' is the service that
      // resolves and fires the callback, the qualified subpath whitelists the read —
      // reading .directoryPicker with only 'remote' declared throws "cannot get
      // property remote.directoryPicker without inject", and one crashed render
      // abdicates the entry for good.
      let picker;
      ctx.inject(['remote', 'remote.directoryPicker'], (owner) => { picker = owner.remote.directoryPicker; return () => { picker = undefined; }; });
      ctx.inject(['remote', 'remote.settings'], (owner) => { modernRemote = owner.remote.settings; return () => { modernRemote = undefined; }; });
      const mount = (scope, owner, namespace) => {
        if (mounted) return; mounted = true;
        const connection = typeof scope.mutate === 'function' ? undefined : owner.connection;
        // The four-host write ladder, op-shaped now: the settings kit stages
        // set/unset ops and fences them with a revision, so the ladder takes ops.
        // Oldest hosts only have per-field set — an unset becomes the default.
        const writeOps = async (ops, expectedRevision) => {
          const current = scope.getSnapshot();
          if (current.status !== undefined && current.status !== 'ready') throw Error(t('notLoaded'));
          const revision = expectedRevision === undefined ? current.revision : expectedRevision;
          if (modernRemote && owner.configForms) {
            const response = await modernRemote.mutate(namespace, ops, revision);
            if (response.ok) owner.configForms.describe().acceptView(response.value);
            else await owner.configForms.describe().load();
            if (!response.ok) throw Error(response.error?.message || response.error?.code || t('persistFailed'));
          } else if (typeof scope.mutate === 'function') {
            const accepted = await scope.mutate(ops, scope.getSnapshot().revision);
            if (!accepted) throw Error(t('persistFailed'));
          } else if (connection?.api?.settings?.mutate) {
            const snapshot = scope.getSnapshot();
            const response = await connection.api.settings.mutate({ ns: namespace, ops, ...(snapshot.revision === undefined ? {} : { expectedRevision: snapshot.revision }) });
            if (!response.result?.ok) throw Error(response.result?.message || response.result?.error || t('persistFailed'));
            await scope.load();
          } else {
            for (const op of ops) await scope.set(op.path[0], op.op === 'set' ? op.value : defaults[op.path[0]]);
          }
          const value = scope.getSnapshot().value ?? {};
          for (const op of ops) {
            if (op.op === 'set' && !equal(value[op.path[0]], op.value)) throw Error(t('persistFailed'));
            if (op.op === 'unset' && value[op.path[0]] !== undefined && !equal(value[op.path[0]], defaults[op.path[0]])) throw Error(t('persistFailed'));
          }
        };
        const savePatch = async (patch) => writeOps(Object.entries(patch).map(([field, value]) => ({ op: 'set', path: [field], value })));
        // The host model for this namespace: staged drafts, per-field validation,
        // Overridden tags and revision-fenced writes come from it; writeOps stays
        // its write scope. Without the catalog there is no model and Card renders
        // the plain form over savePatch instead.
        const model = P ? new P.SettingsFormModel({
          getSnapshot: () => scope.getSnapshot(),
          subscribe: (listener) => (typeof scope.subscribe === 'function' ? scope.subscribe(listener) : () => {}),
          mutate: async (ops, expectedRevision) => { try { await writeOps(ops, expectedRevision); return true; } catch { return false; } },
        }, specs) : null;
        if (model) {
          // The kit exposes edit/resetField/discard ONLY through actions()
          // (form-model.ts:274); save IS an instance method (:300) so it stays
          // untouched and runAction can await it. Our controls call these on the
          // model object, so bind the three as own members. Unbound they threw
          // `model.edit is not a function` on every switch/menu/value edit, and
          // the SettingsForm unmount cleanup (onDiscard → model.discard) threw
          // through the host slot that renders the modal.
          const actions = model.actions();
          for (const key of ['edit', 'resetField', 'discard']) model[key] = actions[key];
        }
        const store = model ? model.bind(() => model.shell()) : null;
        const face = (asTag, idPrefix) => () => ({ scope, savePatch, model, store, picker, as: asTag, idPrefix, ...(model ? { hooks: { card: store } } : {}) });
        ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'computer-use', order: 16, label: () => t('nav'), locale: NS, inject: face('section', 'arya-page') }, Card));
        ctx.slots.inject('plugins.item', () => ctx.slots.register({ name: 'plugins.item', id: 'arya-computer-use', order: 30, label: () => t('nav'), locale: NS, inject: face('section', 'arya-plugin') }, Card));
        ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ name: 'settings.plugin.item', id: 'arya-computer-use', order: 30, locale: NS, inject: face('li', 'arya') }, Card));
      };
      ctx.inject(['configForms'], (owner) => mount(owner.configForms.get('arya-computer-use'), owner, 'arya-computer-use'));
      ctx.inject(['settingsScope', 'connection'], (owner) => mount(owner.settingsScope.bind({ namespace: 'arya-computer-use' }), owner, 'arya-computer-use'));
    }
    return { apply, inject: ['slots', 'locale'] };
  },
});
