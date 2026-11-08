# Arya Computer Use - hide the console windows the automation sidecars hand to
# the desktop.
#
# Windows gives a console window named after the executable to any console
# process that was not started with CREATE_NO_WINDOW. Both engines ship a JS
# shim (agent-browser/bin/agent-browser.js, agent-desktop/bin/agent-desktop)
# that runs the native helper with `stdio: 'inherit'` and `windowsHide: false`,
# and a native helper that outlives the call (the browser daemon) keeps its
# console for the whole session. The plugin starts the natives itself wherever
# it can, so the shim never runs, but a lane restart or a helper started by
# something else still puts a black console on screen - and closing it kills the
# helper, which is why it comes back.
#
# This watcher hides those windows instead of closing them. Hiding only removes
# the chrome: stdio is piped, the helper keeps running and stays reachable.
# Nothing else is touched - the window must be a classic console AND its title
# or its image path must name one of the two engine helpers.
#
# Started hidden by index.js for the lifetime of the host process
# (-ParentPid). -Once -Report prints what would be hidden and changes nothing.

param(
  [int]$ParentPid = 0,
  [int]$IntervalMs = 600,
  [switch]$Once,
  [switch]$Report
)

$ErrorActionPreference = 'Stop'

# Console window titles on Windows default to the application path, and the
# vendor shim does not overwrite them. A few releases rename the helper, so the
# match stays on the package name plus its bin directory.
$script:TitlePattern = 'agent-(browser|desktop)(-win32-(x64|arm64))?\.exe'
$script:PathPattern = '\\node_modules\\(agent-browser|agent-desktop)\\bin\\'

Add-Type -Namespace AryaCU -Name Win32 -MemberDefinition @'
    public delegate bool EnumWindowsProc(System.IntPtr hWnd, System.IntPtr lParam);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, System.IntPtr lParam);

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    public static extern int GetWindowTextW(System.IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    public static extern int GetClassNameW(System.IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool IsWindowVisible(System.IntPtr hWnd);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);
'@

# Returns the visible console windows that belong to one of the engine helpers.
function Get-EngineConsoles {
  $found = New-Object System.Collections.ArrayList

  $callback = [AryaCU.Win32+EnumWindowsProc] {
    param([IntPtr]$hWnd, [IntPtr]$lParam)

    if (-not [AryaCU.Win32]::IsWindowVisible($hWnd)) { return $true }

    $class = New-Object System.Text.StringBuilder 256
    [void][AryaCU.Win32]::GetClassNameW($hWnd, $class, 256)
    # ConPTY terminals and Windows Terminal use their own classes; only the
    # classic console host is a candidate.
    if ($class.ToString() -ne 'ConsoleWindowClass') { return $true }

    $title = New-Object System.Text.StringBuilder 1024
    [void][AryaCU.Win32]::GetWindowTextW($hWnd, $title, 1024)
    $text = $title.ToString()

    $ownerPid = 0
    [void][AryaCU.Win32]::GetWindowThreadProcessId($hWnd, [ref]$ownerPid)

    $hit = $text -match $script:TitlePattern
    if (-not $hit -and $ownerPid -gt 0) {
      # The title can be blanked by the shim's parent; fall back to the image
      # path when the process is readable (the host runs elevated, so it is).
      try {
        $path = (Get-Process -Id $ownerPid -ErrorAction Stop).Path
        if ($path -and $path -match $script:PathPattern) { $hit = $true }
      } catch { }
    }

    if ($hit) {
      [void]$found.Add([pscustomobject]@{ Handle = $hWnd; Title = $text; OwnerPid = $ownerPid })
    }
    return $true
  }

  [void][AryaCU.Win32]::EnumWindows($callback, [IntPtr]::Zero)
  return @($found.ToArray())
}

while ($true) {
  try {
    foreach ($window in Get-EngineConsoles) {
      if ($Report) {
        '{0} {1} {2}' -f $window.OwnerPid, $window.Handle, $window.Title
      } else {
        [void][AryaCU.Win32]::ShowWindow($window.Handle, 0) # SW_HIDE
      }
    }
  } catch {
    if ($Once) { throw }
  }

  if ($Once) { break }

  Start-Sleep -Milliseconds ([Math]::Max(200, $IntervalMs))

  # Leave with the host: an orphaned watcher would keep polling forever.
  if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
}
