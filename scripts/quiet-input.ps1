# Arya Computer Use — background pointer input.
#
# PostMessage-only click at an element centre: no cursor movement, no
# foreground change. Used by mcp/quiet-input.mjs when a control exposes no
# semantic click pattern. Compiles its C# helper on first use and caches the
# assembly under %LOCALAPPDATA%\dsh-plugin-arya-desktop\cache.
#
# Payload: base64 of {"mode":"click|right|double","hwnd":<decimal>,"x":<screen>,"y":<screen>}
# Output: one JSON object on stdout.
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

    [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] static extern IntPtr ChildWindowFromPointEx(IntPtr parent, POINT p, uint flags);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool PostMessage(IntPtr h, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

    const uint WM_MOUSEMOVE = 0x0200, WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202,
        WM_LBUTTONDBLCLK = 0x0203,
        WM_RBUTTONDOWN = 0x0204, WM_RBUTTONUP = 0x0205,
        CWP_SKIPINVISIBLE = 0x0001, CWP_SKIPTRANSPARENT = 0x0004;

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

    public static string Execute(long rootHandle, int screenX, int screenY, string mode)
    {
        IntPtr root = new IntPtr(rootHandle);
        if (!IsWindow(root))
        {
            return "{\"ok\":false,\"error\":\"window handle is not a live window\",\"hwnd\":" + rootHandle + "}";
        }
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
            .Append(",\"target\":{").Append(Describe(target)).Append("}")
            .Append(",\"root\":{").Append(Describe(root)).Append("}")
            .Append(",\"descend\":\"").Append(trace.ToString()).Append("\"")
            .Append(",\"client_point\":[").Append(client.X).Append(',').Append(client.Y).Append(']')
            .Append(",\"cursor\":{\"before\":[").Append(cursorBefore.X).Append(',').Append(cursorBefore.Y)
            .Append("],\"after\":[").Append(cursorAfter.X).Append(',').Append(cursorAfter.Y).Append("]}")
            .Append(",\"foreground\":{\"before\":").Append(foregroundBefore.ToInt64())
            .Append(",\"after\":").Append(foregroundAfter.ToInt64()).Append('}')
            .Append(",\"cursor_moved\":").Append(cursorBefore.X != cursorAfter.X || cursorBefore.Y != cursorAfter.Y ? "true" : "false")
            .Append(",\"foreground_changed\":").Append(foregroundBefore != foregroundAfter ? "true" : "false")
            .Append(",\"post_failed\":").Append(ok ? "false" : "true")
            .Append(",\"last_error\":").Append(lastError)
            .Append('}')
            .ToString();
        return report;
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
  $report = [AryaQuietInput]::Execute([long]$request.hwnd, [int]$request.x, [int]$request.y, [string]$request.mode)
  Write-Output $report
} catch {
  $message = $_.Exception.Message.Replace('\', '/').Replace('"', "'")
  Write-Output ('{"ok":false,"error":"' + $message + '"}')
}
