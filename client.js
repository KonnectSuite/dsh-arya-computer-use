// Browser module: Arya Computer Use settings UI + chat activity rows.
// Derived from dsh-computer-use-win (MIT, Yu-tao-Li) — browser-policy, tool-preset,
// and community sections removed; behavior switches (headed/overlay/driver lock) added.
window.__ModuleLoader__.load({
  id: '@konnectsuite/dsh-plugin-arya-computer-use',
  factory: (require) => {
    const React = require('react'), h = React.createElement;
    const NS = 'aryaComputerUse.settings';
    const defaults = {
      progressOverlayEnabled: true, progressOverlayMode: 'source', progressOverlayOpacity: 60,
      progressOverlayWidth: 360, progressOverlayHeight: 240, progressOverlayPosition: 'top-right',
      progressOverlayX: 80, progressOverlayY: 80, progressOverlayLocked: true, progressLockShortcut: '',
      progressPreviewToken: 0, indicatorEnabled: true, cursorIndicatorEnabled: true,
      remoteIndicatorVisible: true, indicatorText: 'Arya is controlling your computer', pointerLabel: 'Arya', indicatorPosition: 'top',
      indicatorIdleMs: 800, stopShortcut: '', resumeToken: 0, previewToken: 0,
      headedDefault: false, overlayDefault: true, driverLockEnabled: true,
    };
    const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    const dictionaries = {
      zh: {
        nav: '电脑操控', title: 'Arya 电脑操控', pluginDescription: '通过无障碍控件驱动 Windows 应用，接管时显示提示并可用 Esc 停止。',
        openSettings: '打开设置', intro: '查看接管提示，使用 Esc 停止桌面操作。',
        loadingSettings: '正在加载设置', notLoaded: '设置尚未加载', reloadSettings: '刷新',
        indicatorTitle: '接管提示', indicator: '为应用窗口描边框', indicatorHint: '用边框标出 agent 正在操作的窗口，并显示提示条。不会高亮你自己的鼠标。',
        cursorIndicator: '显示虚拟光标', cursorIndicatorHint: '在 agent 操作的位置画一个虚拟光标。不会跟随或高亮你的真实鼠标。',
        appearance: '提示的更多选项', text: '提示文字', position: '提示位置', top: '顶部', bottom: '底部',
        delay: '操作后保留提示', delayHint: '连续动作保持显示，减少闪烁。200–3000 毫秒。', ms: '毫秒',
  cursorLabel: '虚拟光标名称', cursorLabelHint: '显示在虚拟光标旁的名字，1–16 个字符。',
        remoteVisible: '远程与录屏可见', remoteVisibleHint: '让远程桌面、屏幕共享和录屏看到接管提示与浮窗。关闭后请求 Windows 把它们排除在捕获之外。',
        preview: '预览接管提示', previewed: '已请求预览；如果之前按 Esc 暂停，请先恢复控制。', previewHint: '请先保存更改，再预览屏幕上的实际效果。',
        progressTitle: '操作浮窗', progressOverlay: '显示操作浮窗', progressOverlayHint: '在屏幕上显示当前步骤、模型的思考与回复。',
        progressLocked: '锁定浮窗', progressLockedHint: '锁定后浮窗不抢焦点、不可拖动；可用快捷键解锁。',
        progressSync: '浮窗位置与大小与接管浮窗同步。', openProgress: '显示浮窗',
        progressOpacity: '背景不透明度（%）', progressWidth: '宽度（像素）', progressHeight: '高度（像素）',
        progressPosition: '浮窗位置', progress_topRight: '右上', progress_topLeft: '左上', progress_bottomRight: '右下', progress_bottomLeft: '左下', progress_custom: '自定义',
        progressX: 'X 坐标', progressY: 'Y 坐标', progressShortcut: '浮窗解锁快捷键', progressShortcutHint: '按下后临时解锁浮窗以便拖动。留空表示不设置。',
        behaviorTitle: '操作方式', headedDefault: 'Real mouse and keyboard', headedDefaultHint: 'Off by default: input goes through background accessibility patterns and never moves your pointer or steals focus. Turn on to use real keyboard/mouse input, which briefly focuses the target window.',
        overlayDefault: '引擎会话叠加层', overlayDefaultHint: '启动桌面会话时启用引擎自带的光标叠加层。Arya 的虚拟光标不依赖它。',
        driverLock: '单会话驱动', driverLockHint: '同一时间只允许一个对话操作桌面；其他对话调用桌面工具会收到 BUSY 提示。关闭后最近使用的对话自动接管。',
        stop: '停止与恢复', escTitle: '按 Esc 停止操作', escAlways: 'Esc 始终可用',
        stopHint: '停止后保持暂停，准备好再恢复。普通鼠标移动不会停止接管。',
        extraStop: '自定义停止方式', shortcutHint: '点击“录制快捷键”，再按下想用的按键或组合键，例如 F8 或 Ctrl + Alt + K。保存后生效；恢复默认后仅保留 Esc。',
        record: '录制快捷键', rerecord: '重新录制', cancelRecord: '取消录制', clearShortcut: '恢复默认（Esc）',
        noShortcut: 'Esc（默认）', listening: '请按下快捷键…（Esc 取消）', listeningCancel: '按 Esc 取消',
        unsupportedKey: '请使用字母、数字、功能键或常用按键，可搭配 Ctrl、Alt、Shift、Win。',
        recordCancelled: '已取消录制', recordTimedOut: '录制已超时，请点击按钮重试。',
        save: '保存更改', discard: '放弃更改', dirty: '有未保存的更改', clean: '更改后点击保存',
        saved: '已保存', failed: '保存失败', unavailable: '当前宿主未提供可写设置，请在本机 DSH 中打开此页面。',
        invalid: '请填写 1–120 字的单行提示文字，并将隐藏延时设为 200–3000 的整数。',
        persistFailed: '宿主未确认设置已保存，请刷新后重试。', moreInfo: '更多说明',
        see: '查看了屏幕', read: '读取了界面控件', windows: '查看了打开的窗口', findControl: '查找了界面控件',
        clickAction: '点击了目标', valueAction: '填写了控件内容', typeAction: '输入了文本', keyAction: '发送了按键',
        scrollAction: '滚动了页面', waitAction: '等待了界面响应', ocrAction: '识别了屏幕文字',
        launchAction: '请求启动应用', toolsAction: '查看了工具配置', working: '正在操作…', completed: '已完成',
        failedAction: '未完成', stoppedAction: '已停止', seriesTitle: '本轮桌面操作', sentOnly: '操作已发送，效果待确认',
        showDetails: '查看步骤和截图', seriesCount: '步操作', stepError: '操作失败', and: '，并',
      },
      en: {
        nav: 'Computer Use', title: 'Arya Computer Use', pluginDescription: 'Drives Windows apps through accessibility controls, shows a takeover indicator, and stops on Esc.',
        openSettings: 'Open settings', intro: 'See when the agent controls your desktop. Press Esc to stop.',
        loadingSettings: 'Loading settings', notLoaded: 'Settings are not loaded', reloadSettings: 'Reload',
        indicatorTitle: 'Takeover indicator', indicator: 'Frame the app window', indicatorHint: 'A rim marks the window the agent is driving, with a banner. Your own pointer is never highlighted.',
        cursorIndicator: 'Show a ghost cursor', cursorIndicatorHint: 'Draws a synthetic cursor where the agent acts. Your real pointer is never followed or highlighted.',
        appearance: 'More indicator options', text: 'Banner text', position: 'Banner position', top: 'Top', bottom: 'Bottom',
        delay: 'Keep visible after an action', delayHint: 'Stay visible between consecutive actions. 200–3000 milliseconds.', ms: 'ms',
  cursorLabel: 'Ghost cursor name', cursorLabelHint: 'The tag drawn beside the ghost cursor. 1–16 characters.',
        remoteVisible: 'Visible in remote sessions and recordings', remoteVisibleHint: 'Show the takeover indicator and overlay in remote access, screen sharing and recordings; turning it off asks Windows to exclude them from capture.',
        preview: 'Preview indicator', previewed: 'Preview requested; resume first if you previously stopped with Esc.', previewHint: 'Save changes before previewing the actual screen indicator.',
        progressTitle: 'Progress overlay', progressOverlay: 'Show the progress overlay', progressOverlayHint: 'Show the current step, reasoning and replies on screen.',
        progressLocked: 'Lock the overlay', progressLockedHint: 'A locked overlay never steals focus and cannot be dragged; a shortcut unlocks it.',
        progressSync: 'Overlay size and position stay in sync with the takeover overlay.', openProgress: 'Show overlay',
        progressOpacity: 'Background opacity (%)', progressWidth: 'Width (px)', progressHeight: 'Height (px)',
        progressPosition: 'Overlay position', progress_topRight: 'Top right', progress_topLeft: 'Top left', progress_bottomRight: 'Bottom right', progress_bottomLeft: 'Bottom left', progress_custom: 'Custom',
        progressX: 'X coordinate', progressY: 'Y coordinate', progressShortcut: 'Overlay unlock shortcut', progressShortcutHint: 'Press to temporarily unlock the overlay so you can drag it. Empty means none.',
        behaviorTitle: 'Control style', headedDefault: 'Real mouse and keyboard', headedDefaultHint: 'Off by default: input goes through background accessibility patterns and never moves your pointer or steals focus. Turn on to use real keyboard/mouse input, which briefly focuses the target window.',
        overlayDefault: 'Engine session overlay', overlayDefaultHint: "Starts the desktop session with the engine's own cursor overlay. Arya's ghost cursor does not depend on it; leave it off unless you want the engine marker too.",
        driverLock: 'One conversation drives at a time', driverLockHint: 'While one conversation is driving, desktop calls from other conversations receive a BUSY notice. Turn off to let the most recent conversation take over automatically.',
        stop: 'Stop and resume', escTitle: 'Press Esc to stop', escAlways: 'Esc always works',
        stopHint: 'Control stays paused until you resume. Ordinary mouse movement does not stop it.',
        extraStop: 'Custom stop shortcut', shortcutHint: 'Click Record shortcut, then press a key or combination, such as F8 or Ctrl + Alt + K. Save to apply. Restoring the default keeps only Esc.',
        record: 'Record shortcut', rerecord: 'Record again', cancelRecord: 'Cancel recording', clearShortcut: 'Restore default (Esc)',
        noShortcut: 'Esc (default)', listening: 'Press your shortcut… (Esc to cancel)', listeningCancel: 'Press Esc to cancel',
        unsupportedKey: 'Use a letter, number, function key or common key, optionally with Ctrl, Alt, Shift or Win.',
        recordCancelled: 'Recording cancelled', recordTimedOut: 'Recording timed out. Click the button to try again.',
        save: 'Save changes', discard: 'Discard changes', dirty: 'Unsaved changes', clean: 'Save after making changes',
        saved: 'Saved', failed: 'Save failed', unavailable: 'Writable settings are unavailable. Open this page in your local DSH host.',
        invalid: 'Use 1–120 characters on one line and an integer hide delay between 200 and 3000.',
        persistFailed: 'The host did not confirm the saved settings. Refresh and retry.', moreInfo: 'More information',
        see: 'Viewed the screen', read: 'Read interface controls', windows: 'Listed open windows', findControl: 'Looked for controls',
        clickAction: 'Clicked the target', valueAction: 'Filled in a control', typeAction: 'Entered text', keyAction: 'Sent a key press',
        scrollAction: 'Scrolled the page', waitAction: 'Waited for the interface', ocrAction: 'Read screen text',
        launchAction: 'Requested app launch', toolsAction: 'Viewed tool settings', working: 'Working…', completed: 'Completed',
        failedAction: 'Incomplete', stoppedAction: 'Stopped', seriesTitle: 'Desktop activity', sentOnly: 'Input sent; effect unconfirmed',
        showDetails: 'Steps and screenshots', seriesCount: 'steps', stepError: 'Action failed', and: ', then ',
      },
    };
    function shortcutFromEvent(event) {
      const code = event.code || '', special = { Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Pause: 'Pause', CapsLock: 'CapsLock', NumLock: 'NumLock', ScrollLock: 'ScrollLock' };
      let key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit[0-9]$/.test(code) ? code.slice(5) : /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code) ? code : special[code];
      if (!key && event.keyCode >= 65 && event.keyCode <= 90) key = String.fromCharCode(event.keyCode);
      if (!key && event.keyCode >= 48 && event.keyCode <= 57) key = String.fromCharCode(event.keyCode);
      if (!key && event.keyCode >= 112 && event.keyCode <= 135) key = 'F' + (event.keyCode - 111);
      return key ? [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Win', key].filter(Boolean).join('+') : null;
    }
    const css = `
      [data-arya-settings]{--arya-card:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-2,Canvas));--arya-sunken:var(--dsw-alias-bg-module-platform,color-mix(in srgb,CanvasText 4%,Canvas));--arya-control:var(--dsw-alias-bg-layer-1,Canvas);--arya-fg:var(--dsw-alias-label-primary,CanvasText);--arya-muted:var(--dsw-alias-label-secondary,#61666b);--arya-subtle:var(--dsw-alias-label-tertiary,#81858c);--arya-line:var(--dsw-alias-border-l2,rgba(128,128,128,.2));--arya-line-strong:var(--dsw-alias-border-l3,rgba(128,128,128,.3));--arya-hover:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1));--arya-accent:var(--dsw-alias-state-business-primary,#4176e6);--arya-primary:var(--dsw-alias-button-primary-fill,#0f1115);--arya-primary-fg:var(--dsw-alias-label-primary-foreground,#fff);--arya-tip-bg:var(--dsw-alias-tooltip-bg,#2b2f36);--arya-tip-fg:#fff;color:var(--arya-fg);font:14px/1.55 var(--dsw-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif);max-width:720px;list-style:none;box-sizing:border-box;margin:0;padding:0 0 8px}
      [data-arya-settings] *{box-sizing:border-box}
      [data-arya-settings] h2{font-size:18px;line-height:1.4;font-weight:600;margin:0}
      [data-arya-settings] h3{font-size:15px;line-height:22px;font-weight:600;margin:0}
      [data-arya-settings] p{margin:4px 0 0;color:var(--arya-muted);font-size:13px;line-height:1.55}
      [data-arya-settings] .arya-header{padding:0 0 12px}
      [data-arya-settings] .arya-header>p{color:var(--arya-subtle)}
      [data-arya-settings] .arya-section{padding:0 0 18px}
      [data-arya-settings] .arya-section-head{display:flex;align-items:center;gap:6px;margin:0 0 6px}
      [data-arya-settings] .arya-section-head .arya-end{margin-left:auto;display:flex;gap:6px}
      [data-arya-settings] .arya-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px}
      [data-arya-settings] .arya-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;padding:8px 0 2px}
      [data-arya-settings] .arya-item{display:flex;gap:10px;align-items:flex-start;min-width:0}
      [data-arya-settings] .arya-item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
      [data-arya-settings] .arya-item-title{font-size:13.5px;font-weight:500;line-height:1.5}
      [data-arya-settings] .arya-art{flex:none;display:flex;align-items:center;justify-content:center;min-width:56px;padding-top:2px}
      [data-arya-settings] .arya-art svg{width:56px;height:35px}
      [data-arya-settings] .arya-art svg *{fill:none;stroke:var(--arya-muted);stroke-width:1.4}
      [data-arya-settings] .arya-art svg .a-acc{stroke:var(--arya-accent);fill:color-mix(in srgb,var(--arya-accent) 16%,transparent)}
      [data-arya-settings] .arya-art svg .a-glow{stroke:var(--arya-accent);opacity:.55}
      [data-arya-settings] .arya-art svg .a-ink{stroke:var(--arya-subtle);opacity:.6}
      [data-arya-settings] .arya-art svg .a-ink2{stroke:var(--arya-subtle);opacity:.35}
      [data-arya-settings] .arya-art svg .a-win{fill:var(--arya-control)}
      [data-arya-settings] .arya-art svg .a-bar{fill:var(--arya-sunken);stroke:none}
      [data-arya-settings] .arya-art svg .a-pill{fill:var(--arya-control)}
      [data-arya-settings] .arya-art svg .a-dot{fill:var(--arya-accent);stroke:none}
      [data-arya-settings] .arya-art svg .a-text{fill:var(--arya-subtle);stroke:none}
      [data-arya-settings] .arya-art svg .a-key{fill:var(--arya-sunken)}
      [data-arya-settings] .arya-art svg .a-cap{fill:var(--arya-muted);stroke:none;font-size:9px}
      [data-arya-settings] .arya-art svg .a-tag{fill:var(--arya-primary-fg);stroke:none;font-size:7px}
      [data-arya-settings] input[type=radio],[data-arya-settings] input[type=checkbox]{accent-color:var(--arya-accent);width:16px;height:16px;flex:none;margin:2px 0 0}
      [data-arya-settings] input[type=checkbox][role=switch]{width:34px;height:20px;border-radius:10px;appearance:none;background:var(--arya-sunken);border:.5px solid var(--arya-line-strong);position:relative;cursor:pointer;transition:background .15s;margin:0;flex:none}
      [data-arya-settings] input[type=checkbox][role=switch]:checked{background:var(--arya-accent);border-color:var(--arya-accent)}
      [data-arya-settings] input[type=checkbox][role=switch]:after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:7px;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.35)}
      [data-arya-settings] input[type=checkbox][role=switch]:checked:after{left:16px}
      [data-arya-settings] input[type=checkbox][role=switch]:disabled{opacity:.5;cursor:default}
      [data-arya-settings] summary{cursor:pointer;color:var(--arya-fg);font-size:13px;font-weight:500;list-style:none;display:flex;align-items:center;gap:7px;padding:11px 0;width:fit-content}
      [data-arya-settings] summary::-webkit-details-marker{display:none}
      [data-arya-settings] summary:before{content:'';width:0;height:0;border-style:solid;border-width:4.5px 0 4.5px 6px;border-color:transparent transparent transparent currentColor;opacity:.55;transition:transform .15s}
      [data-arya-settings] details[open]>summary:before{transform:rotate(90deg)}
      [data-arya-settings] select,[data-arya-settings] input[type=number],[data-arya-settings] input[type=text]{background:var(--arya-control);color:var(--arya-fg);border:.5px solid var(--arya-line-strong);border-radius:var(--dsw-radius-sm,8px);padding:5px 8px;font:inherit;min-width:0;width:100%}
      [data-arya-settings] .arya-number{display:flex;align-items:center;gap:6px}
      [data-arya-settings] .arya-number input{width:96px}
      [data-arya-settings] .arya-segment{display:inline-flex;border:.5px solid var(--arya-line-strong);border-radius:var(--dsw-radius-sm,8px);overflow:hidden}
      [data-arya-settings] .arya-segment label{display:flex;align-items:center;gap:6px;padding:5px 12px;font-size:13px;cursor:pointer;border-left:.5px solid var(--arya-line)}
      [data-arya-settings] .arya-segment label:first-child{border-left:0}
      [data-arya-settings] .arya-segment label:has(input:checked){background:var(--arya-hover)}
      [data-arya-settings] .arya-segment input{position:absolute;opacity:0;pointer-events:none}
      [data-arya-settings] button{font:inherit;color:var(--arya-fg);background:var(--arya-control);border:.5px solid var(--arya-line-strong);border-radius:var(--dsw-radius-sm,8px);padding:5px 12px;cursor:pointer;transition:background .15s}
      [data-arya-settings] button:hover:enabled{background:var(--arya-hover)}
      [data-arya-settings] button:disabled{opacity:.5;cursor:default}
      [data-arya-settings] button.arya-small{font-size:12.5px;padding:3px 9px}
      [data-arya-settings] button.arya-primary{background:var(--arya-primary);color:var(--arya-primary-fg);border-color:transparent}
      [data-arya-settings] .arya-footer{display:flex;align-items:center;gap:10px;border-top:.5px solid var(--arya-line);padding-top:12px}
      [data-arya-settings] .arya-status{flex:1;font-size:13px;color:var(--arya-muted)}
      [data-arya-settings] .arya-status[data-tone=success]{color:var(--arya-accent)}
      [data-arya-settings] .arya-status[data-tone=error]{color:#e05656}
      [data-arya-settings] .arya-actions{display:flex;gap:8px}
      [data-arya-settings] .arya-info{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:8px;color:var(--arya-subtle);cursor:help;vertical-align:baseline;margin-left:3px}
      [data-arya-settings] .arya-info:hover,[data-arya-settings] .arya-info:focus-visible{color:var(--arya-fg);background:var(--arya-hover);outline:none}
      [data-arya-settings] .arya-info svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.5}
      [data-arya-settings] .arya-tip{position:fixed;z-index:1000;max-width:280px;padding:8px 11px;border-radius:var(--dsw-radius-sm,8px);background:var(--arya-tip-bg);color:var(--arya-tip-fg);font-size:12.5px;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.28);visibility:hidden}
      [data-arya-settings] .arya-tip[data-open]{visibility:visible}
      [data-arya-settings] .arya-caption{font-size:12px;color:var(--arya-subtle)}
      [data-arya-settings] .arya-shortcut-value{display:flex;flex-wrap:wrap;align-items:center;gap:3px;min-height:24px;font-size:12.5px;color:var(--arya-fg)}
      [data-arya-settings] .arya-shortcut-value kbd{font:inherit;font-size:12px;padding:2px 7px;border:.5px solid var(--arya-line-strong);border-bottom-width:1.5px;border-radius:5px;background:var(--arya-sunken)}
      [data-arya-settings] .arya-shortcut-value small{color:var(--arya-subtle);font-size:11.5px;margin-left:4px}
      [data-arya-settings] .arya-shortcut-value[data-recording]{outline:2px solid var(--arya-accent);outline-offset:2px;border-radius:6px}
      [data-arya-settings] .arya-hint{font-size:12px;color:var(--arya-subtle);margin:2px 0 0}
      [data-arya-settings] .arya-nowrap{white-space:nowrap}
      @media (max-width:640px){[data-arya-settings] .arya-grid,[data-arya-settings] .arya-fields{grid-template-columns:minmax(0,1fr)}}
    `;
    function Info({ id, label, text }) {
      const anchor = React.useRef(null), tip = React.useRef(null), timer = React.useRef(0);
      const [open, setOpen] = React.useState(false), [pinned, setPinned] = React.useState(false);
      const show = (next, delay) => { clearTimeout(timer.current); timer.current = setTimeout(() => { setOpen(next); if (!next) setPinned(false); }, delay); };
      const toggle = () => { if (pinned) show(false, 0); else { clearTimeout(timer.current); setOpen(true); setPinned(true); } };
      React.useEffect(() => () => clearTimeout(timer.current), []);
      React.useLayoutEffect(() => {
        const icon = anchor.current, el = tip.current;
        if (!open || !icon || !el) return;
        try { el.showPopover(); } catch {}
        const r = icon.getBoundingClientRect(), width = el.offsetWidth, height = el.offsetHeight, view = document.documentElement, gap = 8, edge = 8;
        let side = 'top', left = r.left + r.width / 2 - width / 2, top = r.top - gap - height;
        if (top < edge) { if (r.left - gap - width >= edge) { side = 'left'; left = r.left - gap - width; top = r.top + r.height / 2 - height / 2; } else { side = 'bottom'; top = r.bottom + gap; } }
        left = Math.max(edge, Math.min(left, view.clientWidth - edge - width)); top = Math.max(edge, Math.min(top, view.clientHeight - edge - height));
        Object.assign(el.style, { left: left + 'px', top: top + 'px' }); el.dataset.side = side;
        const close = () => { clearTimeout(timer.current); setOpen(false); setPinned(false); };
        const key = (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
        const press = (event) => { if (!icon.contains(event.target)) close(); };
        window.addEventListener('scroll', close, true); window.addEventListener('resize', close); window.addEventListener('keydown', key, true); window.addEventListener('pointerdown', press, true);
        return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', press, true); try { el.hidePopover(); } catch {} };
      }, [open]);
      return h('span', { className: 'arya-info', ref: anchor, tabIndex: 0, role: 'button', 'aria-label': label, 'aria-describedby': id, 'data-open': open || undefined,
        onPointerEnter: () => show(true, 120), onPointerLeave: () => { if (!pinned) show(false, 250); }, onFocus: () => show(true, 0), onBlur: () => { if (!pinned) show(false, 0); },
        onClick: (event) => { event.preventDefault(); if (!tip.current?.contains(event.target)) toggle(); }, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } } },
        h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false }, h('circle', { cx: 8, cy: 8, r: 6.4 }), h('path', { d: 'M8 7.3v3.9M8 4.9v.2' })),
        h('span', { className: 'arya-tip', id, role: 'tooltip', ref: tip, popover: 'manual', 'data-open': open || undefined }, text));
    }
    const drawing = (...children) => h('svg', { viewBox: '0 0 112 70', 'aria-hidden': true, focusable: false }, ...children);
    const box = (className, x, y, width, height, rx = 0) => h('rect', { className, x, y, width, height, rx });
    const arrow = (x, y) => h('path', { className: 'a-ptr', d: `M${x} ${y}v15.5l3.8-3.6 2.7 6.1 2.6-1.1-2.7-6h5.4z` });
    const monitor = () => [box('a-desk', 9, 5, 94, 52, 4), h('path', { className: 'a-bar', d: 'M9.4 50h93.2v3.6a3.4 3.4 0 0 1-3.4 3.4H12.8a3.4 3.4 0 0 1-3.4-3.4z' }), box('a-ink', 54.5, 52, 3, 3, .8), h('path', { className: 'a-ink', d: 'M50 57h12l1.5 6h-15z' }), box('a-ink', 41, 63, 30, 2, 1)];
    const banner = (y) => [box('a-pill', 33, y, 46, 9, 4.5), h('circle', { className: 'a-dot', cx: 38.5, cy: y + 4.5, r: 1.8 }), box('a-text', 42.5, y + 3.55, 23, 1.9, .95), box('a-key', 68, y + 2, 8, 5, 1.2)];
    const arts = {
      indicator: (on, bottom) => drawing(...monitor(), box('a-win', 22, 15, 48, 27, 2.5), h('path', { className: 'a-bar', d: 'M22 17.5a2.5 2.5 0 0 1 2.5-2.5h43a2.5 2.5 0 0 1 2.5 2.5v2.5H22z' }), box('a-ink', 26, 25, 30, 2.2, 1.1), box('a-ink', 26, 30, 22, 2.2, 1.1), box('a-frame', 22, 15, 48, 27, 2.5),
        ...(on ? [box('a-glow a-soft', 12, 8, 88, 46, 2.5), box('a-glow', 9.8, 5.8, 92.4, 50.4, 3.6), ...banner(bottom ? 40 : 9.5)] : [])),
      cursor: (on) => drawing(box('a-ink', 14, 13, 42, 3, 1.5), box('a-ink', 14, 20, 30, 3, 1.5), box('a-ink', 14, 27, 36, 3, 1.5), arrow(48, 25),
        ...(on ? [box('a-acc', 60, 44, 26, 11, 5.5), h('text', { className: 'a-tag', x: 73, y: 51.9, textAnchor: 'middle' }, 'DSH')] : [])),
      esc: () => drawing(box('a-ink2', 33, 19, 46, 34, 7), box('a-win', 33, 16, 46, 34, 7), box('a-frame', 33, 16, 46, 34, 7), h('text', { className: 'a-cap', x: 56, y: 37.2, textAnchor: 'middle' }, 'Esc')),
      progress: (on) => drawing(...monitor(), box('a-win', 22, 15, 48, 27, 2.5), box('a-ink', 26, 25, 30, 2.2, 1.1), box('a-frame', 22, 15, 48, 27, 2.5),
        ...(on ? [box('a-acc', 58, 12, 40, 26, 3), box('a-text', 62, 17, 26, 2, 1), box('a-text', 62, 22, 30, 2, 1), box('a-text', 62, 27, 20, 2, 1)] : [])),
      keyboard: (on) => drawing(box('a-win', 14, 10, 84, 34, 4), box('a-ink', 20, 16, 72, 2.4, 1.2), box('a-ink', 20, 22, 60, 2.4, 1.2), box('a-frame', 14, 10, 84, 34, 4),
        box(on ? 'a-acc' : 'a-ink2', 30, 50, 52, 12, 3), ...(on ? [box('a-text', 34, 53, 6, 2, 1), box('a-text', 42, 53, 6, 2, 1), box('a-text', 50, 53, 6, 2, 1), box('a-text', 58, 53, 6, 2, 1), box('a-text', 66, 53, 6, 2, 1)] : []), arrow(84, 46)),
      lock: (on) => drawing(box('a-acc', 40, 26, 32, 24, 4), h('path', { className: on ? 'a-acc' : 'a-ink2', d: 'M47 26v-6a9 9 0 0 1 18 0v6' }), box('a-text', 47, 36, 18, 2.4, 1.2)),
      shield: (on) => drawing(h('path', { className: on ? 'a-acc' : 'a-ink2', d: 'M56 8l30 10v20c0 18-12 26-30 32-18-6-30-14-30-32V18z' }), h('path', { className: 'a-text', d: 'M44 38l9 9 17-18' })),
    };
    function Card({ scope, t, savePatch, as = 'li', idPrefix = 'arya', view }) {
      if (view === 'summary') return h('span', { 'data-arya-summary': true }, t('pluginDescription'), ' ', h('span', { style: { color: 'var(--dsw-alias-label-link,#71a7ff)' } }, t('openSettings')));
      return h(SettingsGate, { scope, t, savePatch, as, idPrefix });
    }
    function SettingsGate(props) {
      const state = React.useSyncExternalStore((fn) => props.scope.subscribe(fn), () => props.scope.getSnapshot());
      if ((state.status !== undefined && state.status !== 'ready') || !state.value) return h(props.as, { 'data-arya-unavailable': true }, h('p', { role: 'status' }, props.t(state.status === 'loading' ? 'loadingSettings' : 'notLoaded')), h('button', { type: 'button', onClick: () => window.location.reload() }, props.t('reloadSettings')));
      return h(SettingsCard, props);
    }
    function SettingsCard({ scope, t, savePatch, as = 'li', idPrefix = 'arya' }) {
      const state = React.useSyncExternalStore((listener) => scope.subscribe(listener), () => scope.getSnapshot());
      const available = state.status === undefined ? state.value !== undefined : state.status === 'ready';
      const writable = available && state.writable;
      const saved = { ...defaults, ...state.value };
      const [draft, setDraft] = React.useState(saved), [dirty, setDirty] = React.useState(false);
      const [saving, setSaving] = React.useState(false), [message, setMessage] = React.useState(''), [tone, setTone] = React.useState('');
      const [recording, setRecording] = React.useState(false), [recordMessage, setRecordMessage] = React.useState('');
      const savedKey = JSON.stringify(Object.fromEntries(Object.keys(defaults).map((key) => [key, saved[key]])));
      React.useEffect(() => { if (!dirty) setDraft(saved); }, [savedKey, dirty]);
      const change = (field, value) => { const next = { ...draft, [field]: value }; setDraft(next); setDirty(Object.keys(defaults).some((key) => !equal(next[key], saved[key]))); setMessage(''); };
      React.useEffect(() => {
        if (!recording) return;
        if (!writable || saving) { setRecording(false); return; }
        const cancel = () => { setRecording(false); setRecordMessage('recordCancelled'); };
        const keydown = (event) => {
          if (event.isComposing) return;
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.key === 'Escape' || event.code === 'Escape') { cancel(); return; }
          if (event.repeat || ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(event.key)) return;
          const shortcut = shortcutFromEvent(event);
          if (!shortcut) { setRecordMessage('unsupportedKey'); return; }
          change('stopShortcut', shortcut); setRecordMessage(''); setRecording(false);
        };
        const timer = setTimeout(() => { setRecording(false); setRecordMessage('recordTimedOut'); }, 15000);
        window.addEventListener('keydown', keydown, true); window.addEventListener('blur', cancel);
        return () => { clearTimeout(timer); window.removeEventListener('keydown', keydown, true); window.removeEventListener('blur', cancel); };
      }, [recording, writable, saving, savedKey]);
      const run = async (patch, success) => {
        setSaving(true); setMessage('');
        try { await savePatch(patch); setMessage(t(success)); setTone('success'); return true; }
        catch (error) { setMessage(t('failed') + ': ' + String(error.message || error)); setTone('error'); return false; }
        finally { setSaving(false); }
      };
      const overlayKeys = Object.keys(defaults).filter((key) => key.startsWith('progress'));
      const applyOverlayPatch = async (patch) => {
        const next = { ...draft, ...patch }; setDraft(next);
        if (await run(patch, 'saved')) {
          const base = { ...saved, ...patch };
          setDirty(Object.keys(defaults).some((key) => !equal(next[key], base[key])));
        } else setDirty(true);
      };
      const applyOverlaySwitch = (field, value) => applyOverlayPatch({ [field]: value });
      const openProgress = () => applyOverlayPatch({ ...Object.fromEntries(overlayKeys.map((key) => [key, draft[key]])), progressOverlayEnabled: true, progressPreviewToken: Date.now() });
      const save = async () => {
        if (!draft.indicatorText.trim() || draft.indicatorText.length > 120 || /[\r\n\x00-\x1f]/.test(draft.indicatorText) || !draft.pointerLabel.trim() || draft.pointerLabel.trim().length > 16 || /[\r\n\x00-\x1f]/.test(draft.pointerLabel) || !Number.isInteger(draft.indicatorIdleMs) || draft.indicatorIdleMs < 200 || draft.indicatorIdleMs > 3000) { setMessage(t('invalid')); setTone('error'); return; }
        const patch = Object.fromEntries(Object.keys(defaults).filter((key) => !equal(draft[key], saved[key])).map((key) => [key, draft[key]]));
        if (await run(patch, 'saved')) setDirty(false);
      };
      const disabled = saving || !writable || recording, indicatorDisabled = disabled || !draft.indicatorEnabled;
      const radio = (field, value, label) => h('label', { key: value }, h('input', { type: 'radio', name: idPrefix + '-' + field, id: idPrefix + '-' + field + '-' + value, value, checked: draft[field] === value, disabled: indicatorDisabled, onChange: () => change(field, value) }), label);
      const button = (label, props) => h('button', { type: 'button', ...props }, t(label));
      const info = (key) => h(Info, { id: idPrefix + '-tip-' + key, label: t('moreInfo'), text: t(key) });
      const head = (id, title, hint, ...end) => h('div', { className: 'arya-section-head' }, h('h3', { id }, t(title)), hint && info(hint), end.length > 0 && h('div', { className: 'arya-end' }, ...end));
      const item = (art, ...main) => h('div', { className: 'arya-item' }, art, h('div', { className: 'arya-item-main' }, ...main));
      const title = (text, hint, props) => { const cut = /[\u2e80-\u9fff\uff00-\uffef]$/.test(text) ? text.length - 2 : text.lastIndexOf(' ') + 1; return h(props?.htmlFor ? 'label' : 'span', { className: 'arya-item-title', ...props }, text.slice(0, cut), h('span', { className: 'arya-nowrap' }, text.slice(cut), hint && info(hint))); };
      const toggle = (field, label, locked) => h('input', { id: idPrefix + '-' + field, type: 'checkbox', role: 'switch', 'aria-label': t(label), checked: draft[field], disabled: disabled || locked, onChange: (e) => ['progressOverlayEnabled', 'progressOverlayLocked'].includes(field) ? applyOverlaySwitch(field, e.target.checked) : change(field, e.target.checked) });
      const switchItem = (field, label, hint, art, locked) => item(h('label', { className: 'arya-art', htmlFor: idPrefix + '-' + field, 'aria-hidden': true }, art), title(t(label), hint, { htmlFor: idPrefix + '-' + field }), toggle(field, label, locked));
      const field = (label, control) => h('div', { className: 'arya-field' }, label, control);
      const keycap = (key, label) => h('kbd', { className: 'arya-key', key }, label);
      const shortcutKeys = recording ? [h('span', { key: 'listen' }, t('listening')), h('small', { key: 'cancel' }, t('listeningCancel'))]
        : draft.stopShortcut ? draft.stopShortcut.split('+').flatMap((key, i) => i ? [h('span', { className: 'arya-plus', key: '+' + i }, ' + '), keycap(i, key)] : [keycap(i, key)])
        : [keycap('esc', 'Esc'), h('small', { key: 'default' }, t('noShortcut').slice(3))];
      return h(as, { 'data-arya-settings': 'true' }, h('style', null, css),
        h('header', { className: 'arya-header' }, h('h2', null, t('title')), h('p', null, t('intro'))),
        h('section', { className: 'arya-section', 'aria-labelledby': idPrefix + '-indicator-title' },
          head(idPrefix + '-indicator-title', 'indicatorTitle', 'indicatorHint', button('preview', { className: 'arya-small', disabled: disabled || dirty || (!draft.indicatorEnabled && !draft.cursorIndicatorEnabled), onClick: () => run({ previewToken: Date.now() }, 'previewed'), title: dirty ? t('previewHint') : undefined })),
          h('div', { className: 'arya-grid' },
            switchItem('indicatorEnabled', 'indicator', 'indicatorHint', arts.indicator(draft.indicatorEnabled, draft.indicatorPosition === 'bottom')),
            switchItem('cursorIndicatorEnabled', 'cursorIndicator', 'cursorIndicatorHint', arts.cursor(draft.cursorIndicatorEnabled))),
          h('details', { className: 'arya-detail' }, h('summary', null, t('appearance')),
            h('div', { className: 'arya-fields' },
              field(title(t('position'), null, { id: idPrefix + '-position-label' }), h('div', { className: 'arya-segment', role: 'radiogroup', 'aria-labelledby': idPrefix + '-position-label' }, radio('indicatorPosition', 'top', t('top')), radio('indicatorPosition', 'bottom', t('bottom')))),
              field(title(t('delay'), 'delayHint', { htmlFor: idPrefix + '-delay' }), h('div', { className: 'arya-number' }, h('input', { id: idPrefix + '-delay', type: 'number', min: 200, max: 3000, step: 100, value: draft.indicatorIdleMs, disabled: indicatorDisabled, onChange: (e) => change('indicatorIdleMs', Number(e.target.value)) }), h('span', null, t('ms')))),
              field(title(t('text'), null, { htmlFor: idPrefix + '-text' }), h('input', { id: idPrefix + '-text', type: 'text', maxLength: 120, value: draft.indicatorText, disabled: indicatorDisabled, onChange: (e) => change('indicatorText', e.target.value) })),
              field(title(t('cursorLabel'), 'cursorLabelHint', { htmlFor: idPrefix + '-pointerLabel' }), h('input', { id: idPrefix + '-pointerLabel', type: 'text', maxLength: 16, value: draft.pointerLabel, disabled: disabled || !draft.cursorIndicatorEnabled, onChange: (e) => change('pointerLabel', e.target.value) })),
              field(title(t('remoteVisible'), 'remoteVisibleHint', { htmlFor: idPrefix + '-remoteIndicatorVisible' }), toggle('remoteIndicatorVisible', 'remoteVisible'))))),
        h('section', { className: 'arya-section', 'data-arya-progress-settings': true, 'aria-labelledby': idPrefix + '-progress-title' },
          head(idPrefix + '-progress-title', 'progressTitle', null, button('openProgress', { 'data-arya-open-progress': true, className: 'arya-small', disabled, onClick: openProgress })),
          h('div', { className: 'arya-grid' }, switchItem('progressOverlayEnabled', 'progressOverlay', 'progressOverlayHint', arts.progress(draft.progressOverlayEnabled)), switchItem('progressOverlayLocked', 'progressLocked', 'progressLockedHint', arts.lock(draft.progressOverlayLocked))),
          h('details', { className: 'arya-detail', 'data-arya-progress-details': true }, h('summary', null, t('appearance')),
            h('p', { className: 'arya-hint' }, t('progressSync')),
            h('div', { className: 'arya-fields' },
              ...[['progressOverlayOpacity', 'progressOpacity', 20, 100], ['progressOverlayWidth', 'progressWidth', 240, 1600], ['progressOverlayHeight', 'progressHeight', 160, 1600]].map(([key, label, min, max]) => field(title(t(label), null, { htmlFor: idPrefix + '-' + key }), h('input', { id: idPrefix + '-' + key, type: 'number', min, max, value: draft[key], disabled, onChange: (e) => change(key, Number(e.target.value)) }))),
              field(title(t('progressPosition'), null, { htmlFor: idPrefix + '-progressOverlayPosition' }), h('select', { id: idPrefix + '-progressOverlayPosition', value: draft.progressOverlayPosition, disabled, onChange: (e) => change('progressOverlayPosition', e.target.value) }, ...['top-right', 'top-left', 'bottom-right', 'bottom-left', 'custom'].map((key, index) => h('option', { key, value: key }, t(['progress_topRight', 'progress_topLeft', 'progress_bottomRight', 'progress_bottomLeft', 'progress_custom'][index]))))),
              ...[['progressOverlayX', 'progressX'], ['progressOverlayY', 'progressY']].map(([key, label]) => field(title(t(label), null, { htmlFor: idPrefix + '-' + key }), h('input', { id: idPrefix + '-' + key, type: 'number', min: -32768, max: 32767, value: draft[key], disabled: disabled || draft.progressOverlayPosition !== 'custom', onChange: (e) => change(key, Number(e.target.value)) }))),
              field(title(t('progressShortcut'), 'progressShortcutHint', { htmlFor: idPrefix + '-progressLockShortcut' }), h('input', { id: idPrefix + '-progressLockShortcut', type: 'text', value: draft.progressLockShortcut, placeholder: 'Ctrl+Alt+P', maxLength: 50, disabled, onChange: (e) => change('progressLockShortcut', e.target.value) }))))),
        h('section', { className: 'arya-section', 'aria-labelledby': idPrefix + '-behavior-title' },
          head(idPrefix + '-behavior-title', 'behaviorTitle'),
          h('div', { className: 'arya-grid' },
            switchItem('headedDefault', 'headedDefault', 'headedDefaultHint', arts.keyboard(draft.headedDefault)),
            switchItem('overlayDefault', 'overlayDefault', 'overlayDefaultHint', arts.cursor(draft.overlayDefault)),
            switchItem('driverLockEnabled', 'driverLock', 'driverLockHint', arts.shield(draft.driverLockEnabled)))),
        h('section', { className: 'arya-section', 'aria-labelledby': idPrefix + '-stop-title' },
          head(idPrefix + '-stop-title', 'stop', null, button('clearShortcut', { className: 'arya-small', disabled: disabled || !draft.stopShortcut, onClick: () => { change('stopShortcut', ''); setRecordMessage(''); } })),
          h('div', { className: 'arya-grid' },
            item(h('div', { className: 'arya-art', 'aria-hidden': true }, arts.esc()), title(t('escTitle'), 'stopHint'), h('span', { className: 'arya-caption' }, t('escAlways'))),
            h('div', { className: 'arya-item', 'data-arya-shortcut': 'true' },
              h('output', { className: 'arya-art arya-shortcut-value', 'data-recording': recording, 'aria-live': 'polite', 'aria-label': t('extraStop') }, ...shortcutKeys),
              h('div', { className: 'arya-item-main' }, title(t('extraStop'), 'shortcutHint'),
                button(recording ? 'cancelRecord' : draft.stopShortcut ? 'rerecord' : 'record', { className: 'arya-small', disabled: saving || !writable, onClick: () => { setRecordMessage(''); setRecording(!recording); } })))),
          recordMessage && h('p', { role: 'status', className: 'arya-hint' }, t(recordMessage))),
        !writable && h('p', { role: 'status', 'data-tone': 'error' }, t(available ? 'unavailable' : 'notLoaded')),
        h('footer', { className: 'arya-footer' }, h('span', { className: 'arya-status', role: 'status', 'aria-live': 'polite', 'data-tone': message ? tone : undefined }, message || t(dirty ? 'dirty' : 'clean')),
          h('div', { className: 'arya-actions' }, button('discard', { disabled: !dirty || saving || recording, onClick: () => { setDraft(saved); setDirty(false); setMessage(''); setRecordMessage(''); } }), button('save', { className: 'arya-primary', disabled: !dirty || disabled, onClick: save }))));
    }
    const actionKeys = { snapshot: 'see', screenshot: 'see', list_windows: 'windows', find: 'findControl', get: 'read', is: 'read', click: 'clickAction', set_value: 'valueAction', type: 'typeAction', press: 'keyAction', scroll: 'scrollAction', wait: 'waitAction', ocr: 'ocrAction', launch: 'launchAction', batch: 'seriesTitle', tools: 'toolsAction' };
    const shortTool = (name) => String(name || '').replace(/^mcp__arya_desktop__/, '');
    const desktopTool = (name) => /^mcp__arya_desktop__(?!tools$)[a-z_]+$/.test(name || '');
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
      let label = t(actionKeys[action] || 'seriesTitle');
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
      const names = Object.keys(actionKeys);
      ctx.slots.inject('tool.call.toolview', function* () { for (const name of names) for (const prefix of ['mcp__arya_desktop__', '']) yield ctx.slots.register({ name: 'tool.call.toolview', key: prefix + name, locale: NS }, MouseToolRow); });
      ctx.inject(['uiConversation'], (owner) => {
        owner.uiConversation.events.register(seriesDefinition);
        ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'arya-series', locale: NS }, SeriesRow));
      });
    }
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries));
      registerActivity(ctx);
      const t = ctx.locale.bind ? ctx.locale.bind(NS) : (key) => key;
      let mounted = false;
      let modernRemote;
      ctx.inject(['remote', 'remote.settings'], (owner) => { modernRemote = owner.remote.settings; return () => { modernRemote = undefined; }; });
      const mount = (scope, owner, namespace) => {
        if (mounted) return; mounted = true;
        const connection = typeof scope.mutate === 'function' ? undefined : owner.connection;
        const savePatch = async (patch) => {
          const current = scope.getSnapshot();
          if (current.status !== undefined && current.status !== 'ready') throw Error(t('notLoaded'));
          if (modernRemote && owner.configForms) {
            const response = await modernRemote.mutate(namespace, Object.entries(patch).map(([field, value]) => ({ op: 'set', path: [field], value })), current.revision);
            if (response.ok) owner.configForms.describe().acceptView(response.value);
            else await owner.configForms.describe().load();
            if (!response.ok) throw Error(response.error?.message || response.error?.code || t('persistFailed'));
          } else if (typeof scope.mutate === 'function') {
            const accepted = await scope.mutate(Object.entries(patch).map(([field, value]) => ({ op: 'set', path: [field], value })), scope.getSnapshot().revision);
            if (!accepted) throw Error(t('persistFailed'));
          } else if (connection?.api?.settings?.mutate) {
            const snapshot = scope.getSnapshot();
            const response = await connection.api.settings.mutate({ ns: namespace, ops: Object.entries(patch).map(([field, value]) => ({ op: 'set', path: [field], value })), ...(snapshot.revision === undefined ? {} : { expectedRevision: snapshot.revision }) });
            if (!response.result?.ok) throw Error(response.result?.message || response.result?.error || t('persistFailed'));
            await scope.load();
          } else {
            for (const [field, value] of Object.entries(patch)) await scope.set(field, value);
          }
          const value = scope.getSnapshot().value ?? {};
          if (Object.entries(patch).some(([key, next]) => !equal(value[key], next))) throw Error(t('persistFailed'));
        };
        ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'computer-use', order: 16, label: () => t('nav'), locale: NS, inject: () => ({ scope, savePatch, as: 'section', idPrefix: 'arya-page' }) }, Card));
        ctx.slots.inject('plugins.item', () => ctx.slots.register({ name: 'plugins.item', id: 'arya-computer-use', order: 30, label: () => t('nav'), locale: NS, inject: () => ({ scope, savePatch, as: 'section', idPrefix: 'arya-plugin' }) }, Card));
        ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ name: 'settings.plugin.item', id: 'arya-computer-use', order: 30, locale: NS, inject: () => ({ scope, savePatch }) }, Card));
      };
      ctx.inject(['configForms'], (owner) => mount(owner.configForms.get('arya-computer-use'), owner, 'arya-computer-use'));
      ctx.inject(['settingsScope', 'connection', 'remote'], (owner) => mount(owner.settingsScope.bind({ namespace: 'arya-computer-use' }), owner, 'arya-computer-use'));
    }
    return { apply, inject: ['slots', 'locale'] };
  },
});
