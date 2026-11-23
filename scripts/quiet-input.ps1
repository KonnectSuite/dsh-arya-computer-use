# Arya Computer Use — background input without the user's mouse or keyboard.
#
# PostMessage-only delivery: no cursor movement, no foreground change. Used by
# mcp/quiet-input.mjs when a control exposes no semantic pattern (click) or when
# the engine cannot confirm a window's focus (key). Compiles its C# helper on
# first use and caches the assembly under %LOCALAPPDATA%\dsh-plugin-arya-desktop\cache.
#
# Payload: base64 of one JSON object:
#   pointer: {"mode":"click|right|double","hwnd":<decimal>,"x":<screen px>,"y":<screen px>}
#   key:     {"mode":"key","hwnd":<decimal>,"vk":<virtual-key code>}
#   text:    {"mode":"text","hwnd":<decimal>,"text":"a string"}
# Output: one JSON object on stdout, including cursor/foreground before/after so
# the caller can prove nothing physical happened.
param(
  [Parameter(Mandatory = $true)][string]$Payload
)

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class AryaQuietInput
{
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct GUITHREADINFO
    {
        public int cbSize;
        public int flags;
        public IntPtr hwndActive;
        public IntPtr hwndFocus;
        public IntPtr hwndCapture;
        public IntPtr hwndMenuOwner;
        public IntPtr hwndMoveSize;
        public IntPtr hwndVscScroll;
        public RECT rcCaret;
    }

    [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] static extern IntPtr ChildWindowFromPointEx(IntPtr parent, POINT p, uint flags);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool PostMessage(IntPtr h, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread, ref GUITHREADINFO info);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);

    // DPI awareness. Element bounds come from UIA in physical pixels, so a
    // DPI-unaware helper would get virtualized coordinates back from
    // ScreenToClient on a scaled display and post the click into the wrong
    // child window. This host may sit at 100% scaling, where the bug is
    // invisible, which is exactly why it has to be set.
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("shcore.dll")] static extern int SetProcessDpiAwareness(int value);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    const uint WM_MOUSEMOVE = 0x0200, WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202,
        WM_LBUTTONDBLCLK = 0x0203,
        WM_RBUTTONDOWN = 0x0204, WM_RBUTTONUP = 0x0205,
        WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101, WM_CHAR = 0x0102,
        VK_RETURN = 0x0d, VK_ESCAPE = 0x1b, VK_TAB = 0x09,
        VK_LEFT = 0x25, VK_UP = 0x26, VK_RIGHT = 0x27, VK_DOWN = 0x28,
        CWP_SKIPINVISIBLE = 0x0001, CWP_SKIPTRANSPARENT = 0x0004;

    // DPI_AWARENESS_CONTEXT_* are macros, not exports: pass the literals.
    static readonly IntPtr DPI_PER_MONITOR_AWARE_V2 = new IntPtr(-4);
    static readonly IntPtr DPI_SYSTEM_AWARE = new IntPtr(-2);

    static int dpiState = 0;

    // Returns 4 = PerMonitorV2, 3 = per-monitor (shcore), 2 = system aware,
    // 1 = nothing took. Called before any coordinate is converted.
    public static int Init()
    {
        if (dpiState != 0) return dpiState;
        try
        {
            if (SetProcessDpiAwarenessContext(DPI_PER_MONITOR_AWARE_V2)) { dpiState = 4; return dpiState; }
            if (SetProcessDpiAwarenessContext(DPI_SYSTEM_AWARE)) { dpiState = 3; return dpiState; }
        }
        catch { }
        try
        {
            if (SetProcessDpiAwareness(2) == 0) { dpiState = 2; return dpiState; }
        }
        catch { }
        try
        {
            if (SetProcessDPIAware()) { dpiState = 1; return dpiState; }
        }
        catch { }
        dpiState = -1;
        return dpiState;
    }

    static string Clean(string value)
    {
        if (value == null) return "";
        return value.Replace("\\", "/").Replace("\"", "'").Replace("\r", " ").Replace("\n", " ");
    }

    static string Describe(IntPtr h)
    {
        if (h == IntPtr.Zero) return "\"hwnd\":0";
        var cls = new StringBuilder(256);
        GetClassName(h, cls, 256);
        var title = new StringBuilder(256);
        GetWindowText(h, title, 256);
        RECT r;
        GetWindowRect(h, out r);
        uint pid;
        GetWindowThreadProcessId(h, out pid);
        return string.Format(
            "\"hwnd\":{0},\"class\":\"{1}\",\"title\":\"{2}\",\"pid\":{3},\"rect\":[{4},{5},{6},{7}]",
            h.ToInt64(), Clean(cls.ToString()), Clean(title.ToString()), pid,
            r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
    }

    public static string DescribeWindow(long hwnd)
    {
        IntPtr h = new IntPtr(hwnd);
        if (!IsWindow(h))
        {
            return "{\"ok\":false,\"error\":\"window handle is not a live window\",\"hwnd\":" + hwnd + "}";
        }
        return "{\"ok\":true," + Describe(h) + "}";
    }

    static IntPtr DeepestChildAt(IntPtr root, int sx, int sy, StringBuilder trace)
    {
        IntPtr current = root;
        for (int depth = 0; depth < 16; depth++)
        {
            POINT client;
            client.X = sx;
            client.Y = sy;
            if (!ScreenToClient(current, ref client)) break;
            IntPtr child = ChildWindowFromPointEx(current, client, CWP_SKIPINVISIBLE | CWP_SKIPTRANSPARENT);
            if (child == IntPtr.Zero || child == current) break;
            if (trace.Length > 0) trace.Append('>');
            trace.Append(child.ToInt64());
            current = child;
        }
        return current;
    }

    static IntPtr LParam(int x, int y)
    {
        return (IntPtr)((y << 16) | (x & 0xFFFF));
    }

    static void AppendState(StringBuilder sb, POINT before, POINT after, IntPtr fgBefore, IntPtr fgAfter)
    {
        sb.Append(",\"cursor\":{\"before\":[").Append(before.X).Append(',').Append(before.Y)
            .Append("],\"after\":[").Append(after.X).Append(',').Append(after.Y).Append("]}")
            .Append(",\"foreground\":{\"before\":").Append(fgBefore.ToInt64())
            .Append(",\"after\":").Append(fgAfter.ToInt64()).Append('}')
            .Append(",\"cursor_moved\":").Append(before.X != after.X || before.Y != after.Y ? "true" : "false")
            .Append(",\"foreground_changed\":").Append(fgBefore != fgAfter ? "true" : "false");
    }

    public static string Execute(long rootHandle, int screenX, int screenY, string mode)
    {
        IntPtr root = new IntPtr(rootHandle);
        if (!IsWindow(root))
        {
            return "{\"ok\":false,\"error\":\"window handle is not a live window\",\"hwnd\":" + rootHandle + "}";
        }
        int dpi = Init();
        POINT cursorBefore;
        GetCursorPos(out cursorBefore);
        IntPtr foregroundBefore = GetForegroundWindow();
        var trace = new StringBuilder();
        IntPtr target = DeepestChildAt(root, screenX, screenY, trace);
        if (!IsWindow(target) || !IsWindowVisible(target)) target = root;
        POINT client;
        client.X = screenX;
        client.Y = screenY;
        ScreenToClient(target, ref client);
        IntPtr position = LParam(client.X, client.Y);

        bool right = string.Equals(mode, "right", StringComparison.OrdinalIgnoreCase);
        bool twice = string.Equals(mode, "double", StringComparison.OrdinalIgnoreCase);
        uint down = right ? WM_RBUTTONDOWN : WM_LBUTTONDOWN;
        uint up = right ? WM_RBUTTONUP : WM_LBUTTONUP;
        IntPtr downFlags = (IntPtr)(right ? 0x0002 : 0x0001);

        bool ok = true;
        ok &= PostMessage(target, WM_MOUSEMOVE, IntPtr.Zero, position);
        ok &= PostMessage(target, down, downFlags, position);
        ok &= PostMessage(target, up, IntPtr.Zero, position);
        if (twice && !right)
        {
            System.Threading.Thread.Sleep(40);
            ok &= PostMessage(target, WM_LBUTTONDBLCLK, downFlags, position);
            ok &= PostMessage(target, WM_LBUTTONUP, IntPtr.Zero, position);
        }
        int lastError = Marshal.GetLastWin32Error();

        POINT cursorAfter;
        GetCursorPos(out cursorAfter);
        IntPtr foregroundAfter = GetForegroundWindow();
        string report = new StringBuilder()
            .Append("{\"ok\":").Append(ok ? "true" : "false")
            .Append(",\"mode\":\"").Append(Clean(mode))
            .Append("\",\"mechanism\":\"post_message\"")
            .Append(",\"dpi_aware\":").Append(dpi)
            .Append(",\"target\":{").Append(Describe(target)).Append("}")
            .Append(",\"root\":{").Append(Describe(root)).Append("}")
            .Append(",\"descend\":\"").Append(trace.ToString()).Append("\"")
            .Append(",\"client_point\":[").Append(client.X).Append(',').Append(client.Y).Append(']')
            .ToString();
        var sb = new StringBuilder(report);
        AppendState(sb, cursorBefore, cursorAfter, foregroundBefore, foregroundAfter);
        sb.Append(",\"post_failed\":").Append(ok ? "false" : "true")
            .Append(",\"last_error\":").Append(lastError)
            .Append('}');
        return sb.ToString();
    }

    static bool IsExtended(uint vk)
    {
        switch (vk)
        {
            case 0x21: case 0x22:           // PRIOR, NEXT
            case 0x23: case 0x24:           // END, HOME
            case 0x25: case 0x26:           // LEFT, UP
            case 0x27: case 0x28:           // RIGHT, DOWN
            case 0x2C: case 0x2D: case 0x2E: // SNAPSHOT, INSERT, DELETE
                return true;
            default:
                return false;
        }
    }

    // The control that owns the keyboard focus inside this window's thread, which
    // is exactly where a real keystroke would land. Falls back to the frame.
    static IntPtr FocusOf(IntPtr root, out string path)
    {
        uint threadPid;
        uint thread = GetWindowThreadProcessId(root, out threadPid);
        var info = new GUITHREADINFO();
        info.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
        if (GetGUIThreadInfo(thread, ref info) && info.hwndFocus != IntPtr.Zero && IsWindow(info.hwndFocus))
        {
            path = "thread_focus";
            return info.hwndFocus;
        }
        path = "root";
        return root;
    }

    // Where a posted KEY must land, which is NOT always the focused control.
    // A standard dialog box (class #32770: a message box, a common file dialog) runs
    // its own GetMessage/IsDialogMessage loop, and that loop reads navigation keys
    // from the DIALOG window's own queue: Escape cancels it, Enter presses the
    // default button, Tab and the arrows move between controls. Its keyboard focus is
    // a BUTTON child, and a button window proc ignores a posted WM_KEYDOWN — which is
    // why an earlier run measured "keys do not dismiss a message box": the key was
    // aimed at the focused button instead of the dialog. Printable characters and
    // Space still go to the focused control, because that is what needs them.
    static IntPtr KeyTargetOf(IntPtr root, uint vk, out string path)
    {
        var cls = new StringBuilder(256);
        if (GetClassName(root, cls, 256) > 0 && cls.ToString() == "#32770"
            && (vk == VK_ESCAPE || vk == VK_RETURN || vk == VK_TAB
                || vk == VK_LEFT || vk == VK_RIGHT || vk == VK_UP || vk == VK_DOWN))
        {
            path = "dialog_root";
            return root;
        }
        return FocusOf(root, out path);
    }

    // Post a key to the control that owns the keyboard focus inside the window,
    // except for a dialog box's navigation keys, which go to the dialog itself (see
    // KeyTargetOf). The top-level frame would drop a keystroke its child edit control
    // is supposed to receive, and posting (not sending) keeps the app's own
    // GetMessage/IsDialogMessage path in charge, so default buttons, accelerators
    // and TranslateMessage all still work. No cursor movement, no foreground.
    public static string ExecuteKey(long rootHandle, int virtualKey, string mode)
    {
        IntPtr root = new IntPtr(rootHandle);
        if (!IsWindow(root))
        {
            return "{\"ok\":false,\"error\":\"window handle is not a live window\",\"hwnd\":" + rootHandle + "}";
        }
        if (virtualKey <= 0 || virtualKey > 0xFF)
        {
            return "{\"ok\":false,\"error\":\"vk must be a Windows virtual-key code (1-255)\",\"vk\":" + virtualKey + "}";
        }
        int dpi = Init();
        POINT cursorBefore;
        GetCursorPos(out cursorBefore);
        IntPtr foregroundBefore = GetForegroundWindow();

        string focusPath;
        IntPtr target = KeyTargetOf(root, (uint)virtualKey, out focusPath);

        uint vk = (uint)virtualKey;
        uint scan = MapVirtualKey(vk, 0); // MAPVK_VK_TO_VSC
        uint extended = IsExtended(vk) ? 0x01000000u : 0u;
        uint baseParam = 1u | (scan << 16) | extended;
        IntPtr downParam = (IntPtr)unchecked((int)baseParam);
        IntPtr upParam = (IntPtr)unchecked((int)(baseParam | 0xC0000000u));

        bool ok = true;
        ok &= PostMessage(target, WM_KEYDOWN, new IntPtr(vk), downParam);
        ok &= PostMessage(target, WM_KEYUP, new IntPtr(vk), upParam);
        // A standard dialog box translates Escape and Enter at the CHARACTER level:
        // its message loop runs IsDialogMessage, and that is what turns WM_CHAR 0x1B
        // into IDCANCEL and WM_CHAR 0x0D into the default button. A bare WM_KEYDOWN
        // never reaches that translation, which is why a posted Escape was measured to
        // do nothing to a WinForms message box even when aimed at the dialog window
        // itself. A real keyboard supplies the character through TranslateMessage, so
        // post it too — but only at the dialog root, where the dialog manager consumes
        // it before any control sees it; posting a character to a focused button as
        // well could actuate that button twice.
        bool charPosted = false;
        if (focusPath == "dialog_root" && (vk == VK_ESCAPE || vk == VK_RETURN || vk == VK_TAB))
        {
            charPosted = PostMessage(target, WM_CHAR, new IntPtr(vk), (IntPtr)unchecked((int)(1u | (scan << 16))));
            ok &= charPosted;
        }
        int lastError = Marshal.GetLastWin32Error();

        POINT cursorAfter;
        GetCursorPos(out cursorAfter);
        IntPtr foregroundAfter = GetForegroundWindow();
        var sb = new StringBuilder()
            .Append("{\"ok\":").Append(ok ? "true" : "false")
            .Append(",\"mode\":\"").Append(Clean(mode))
            .Append("\",\"mechanism\":\"post_message\"")
            .Append(",\"dpi_aware\":").Append(dpi)
            .Append(",\"vk\":").Append(vk)
            .Append(",\"scan\":").Append(scan)
            .Append(",\"extended\":").Append(extended != 0 ? "true" : "false")
            .Append(",\"focus_path\":\"").Append(focusPath).Append('"')
            .Append(",\"char_posted\":").Append(charPosted ? "true" : "false")
            .Append(",\"target\":{").Append(Describe(target)).Append("}")
            .Append(",\"root\":{").Append(Describe(root)).Append("}");
        AppendState(sb, cursorBefore, cursorAfter, foregroundBefore, foregroundAfter);
        sb.Append(",\"post_failed\":").Append(ok ? "false" : "true")
            .Append(",\"last_error\":").Append(lastError)
            .Append('}');
        return sb.ToString();
    }

    // Post a string as WM_CHAR messages, which is how a keyboard reaches a control
    // after translation. Posting characters rather than synthesizing keystrokes
    // keeps the pointer where the user left it and never takes the foreground, and
    // unlike a posted virtual-key code it carries case and punctuation.
    //
    // The target is the control hit-tested from the element's own live rectangle
    // when one is supplied, and the thread's focused control otherwise: aiming at
    // whatever holds focus is how a string meant for one edit lands in another.
    // A surface with no Win32 message loop (XAML/WinUI) does not process WM_CHAR,
    // so the caller must verify the value it asked for instead of trusting this.
    public static string ExecuteText(long rootHandle, string text, string mode, int screenX, int screenY)
    {
        IntPtr root = new IntPtr(rootHandle);
        if (!IsWindow(root))
        {
            return "{\"ok\":false,\"error\":\"window handle is not a live window\",\"hwnd\":" + rootHandle + "}";
        }
        if (string.IsNullOrEmpty(text))
        {
            return "{\"ok\":false,\"error\":\"text is empty\",\"hwnd\":" + rootHandle + "}";
        }
        int dpi = Init();
        POINT cursorBefore;
        GetCursorPos(out cursorBefore);
        IntPtr foregroundBefore = GetForegroundWindow();

        IntPtr target;
        string targetSource;
        if (screenX != -99999 && screenY != -99999)
        {
            var trace = new StringBuilder();
            target = DeepestChildAt(root, screenX, screenY, trace);
            if (!IsWindow(target) || !IsWindowVisible(target)) target = root;
            targetSource = target == root ? "root_hit_test" : "hit_test";
        }
        else
        {
            string focusPath;
            target = FocusOf(root, out focusPath);
            targetSource = focusPath;
        }

        const int MaxChars = 4000;
        bool truncated = text.Length > MaxChars;
        string body = truncated ? text.Substring(0, MaxChars) : text;

        bool ok = true;
        int posted = 0;
        foreach (char ch in body)
        {
            if (ch == '\r') continue;
            if (ch == '\n')
            {
                uint scan = MapVirtualKey(VK_RETURN, 0);
                ok &= PostMessage(target, WM_KEYDOWN, new IntPtr(VK_RETURN), (IntPtr)(int)(1u | (scan << 16)));
                ok &= PostMessage(target, WM_KEYUP, new IntPtr(VK_RETURN), (IntPtr)unchecked((int)(1u | (scan << 16) | 0xC0000000u)));
                posted++;
                continue;
            }
            // WM_CHAR: wParam is the UTF-16 code unit, lParam repeat count 1.
            ok &= PostMessage(target, WM_CHAR, new IntPtr((int)ch), (IntPtr)1);
            posted++;
        }
        int lastError = Marshal.GetLastWin32Error();

        POINT cursorAfter;
        GetCursorPos(out cursorAfter);
        IntPtr foregroundAfter = GetForegroundWindow();
        var sb = new StringBuilder()
            .Append("{\"ok\":").Append(ok ? "true" : "false")
            .Append(",\"mode\":\"").Append(Clean(mode))
            .Append("\",\"mechanism\":\"post_message\"")
            .Append(",\"dpi_aware\":").Append(dpi)
            .Append(",\"chars_posted\":").Append(posted)
            .Append(",\"truncated\":").Append(truncated ? "true" : "false")
            .Append(",\"target_source\":\"").Append(targetSource).Append('"')
            .Append(",\"target\":{").Append(Describe(target)).Append("}")
            .Append(",\"root\":{").Append(Describe(root)).Append("}");
        AppendState(sb, cursorBefore, cursorAfter, foregroundBefore, foregroundAfter);
        sb.Append(",\"post_failed\":").Append(ok ? "false" : "true")
            .Append(",\"last_error\":").Append(lastError)
            .Append('}');
        return sb.ToString();
    }
}
'@

$cacheDir = Join-Path $env:LOCALAPPDATA 'dsh-plugin-arya-desktop\cache'
$cacheDll = Join-Path $cacheDir 'arya-quiet-input.dll'

function Get-SourceHash([string]$text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').Substring(0, 16)
}

$stampFile = Join-Path $cacheDir 'arya-quiet-input.stamp'
$stamp = Get-SourceHash $source
$loaded = $false

if (Test-Path $cacheDll) {
  try {
    $cachedStamp = if (Test-Path $stampFile) { (Get-Content $stampFile -Raw).Trim() } else { '' }
    if ($cachedStamp -eq $stamp) {
      Add-Type -Path $cacheDll
      $loaded = $true
    }
  } catch {
    $loaded = $false
  }
}

if (-not $loaded) {
  $tempDll = Join-Path $cacheDir ("arya-quiet-input-" + $PID + ".dll")
  try { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null } catch { }
  Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $tempDll | Out-Null
  Add-Type -Path $tempDll
  try {
    Move-Item -Path $tempDll -Destination $cacheDll -Force
    Set-Content -Path $stampFile -Value $stamp -Encoding ASCII
  } catch {
    try { Remove-Item -Path $tempDll -Force -ErrorAction SilentlyContinue } catch { }
  }
}

try {
  $request = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Payload)) | ConvertFrom-Json
  $mode = [string]$request.mode
  if ($mode -eq 'key') {
    $vk = if ($request.vk) { [int]$request.vk } elseif ($request.virtualKey) { [int]$request.virtualKey } else { 0 }
    $report = [AryaQuietInput]::ExecuteKey([long]$request.hwnd, $vk, $mode)
  } elseif ($mode -eq 'text') {
    # Braced on purpose: an `else` after a single-statement chain binds to the
    # wrong branch, and a silently dead text mode is worse than a loud failure.
    # -99999 means "no rectangle supplied": the helper then aims at the focused
    # control instead of hit-testing the element's own bounds.
    $text = if ($null -ne $request.text) { [string]$request.text } else { '' }
    $tx = if ($null -ne $request.x) { [int]$request.x } else { -99999 }
    $ty = if ($null -ne $request.y) { [int]$request.y } else { -99999 }
    $report = [AryaQuietInput]::ExecuteText([long]$request.hwnd, $text, $mode, $tx, $ty)
  } elseif ($mode -eq 'describe') {
    # Read-only: what kind of window is this (class/title/rect). The adapter uses it
    # to decide whether a target is a standard dialog box (#32770) before it trusts a
    # key's effect, and it posts nothing in the process.
    $report = [AryaQuietInput]::DescribeWindow([long]$request.hwnd)
  } else {
    $report = [AryaQuietInput]::Execute([long]$request.hwnd, [int]$request.x, [int]$request.y, $mode)
  }
  Write-Output $report
} catch {
  $message = $_.Exception.Message.Replace('\', '/').Replace('"', "'")
  Write-Output ('{"ok":false,"error":"' + $message + '"}')
}
