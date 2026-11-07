<#
  Arya Computer Use — OCR helper.

  Reads text from a PNG via the WinRT Windows.Media.Ocr engine (the same
  engine family wincu uses). Run as a standalone powershell.exe process:
  FullLanguage, outside the DSH pwsh sandbox.

  Output: one JSON object on stdout:
    { ok, engine, width, height, lines: [ { text, x, y, width, height,
      words: [ { text, x, y, width, height } ] } ] }
  Coordinates are PNG pixels (screenshot pixels), not UIA refs.
#>
param(
    [Parameter(Mandatory = $true)][string]$ImagePath
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Load the WinRT activation types.
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType = WindowsRuntime]

# WinRT async bridge: IAsyncOperation<T> arrives as a raw __ComObject (no
# instance AsTask, reflection can't see its interfaces), so pass the result
# type explicitly and invoke the generic static AsTask extension — the
# canonical WinRT-from-PowerShell pattern. Requires FullLanguage powershell.exe
# (the adapter spawns it directly, outside the DSH pwsh sandbox).
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1

function Await($op, $resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $null = $task.Wait(-1)
    return $task.Result
}

function EmitJson($obj) {
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $obj -Depth 6 -Compress))
}

if (-not (Test-Path -LiteralPath $ImagePath)) {
    EmitJson @{ ok = $false; error = "image not found: $ImagePath" }
    exit 1
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
    EmitJson @{ ok = $false; error = 'no OCR engine for user profile languages' }
    exit 1
}

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$lines = @()
foreach ($line in $result.Lines) {
    $words = @()
    foreach ($word in $line.Words) {
        $r = $word.BoundingRect
        $words += @{
            text   = $word.Text
            x      = [math]::Round($r.X)
            y      = [math]::Round($r.Y)
            width  = [math]::Round($r.Width)
            height = [math]::Round($r.Height)
        }
    }
    $lb = $line.BoundingRect
    $lines += @{
        text   = $line.Text
        x      = [math]::Round($lb.X)
        y      = [math]::Round($lb.Y)
        width  = [math]::Round($lb.Width)
        height = [math]::Round($lb.Height)
        words  = $words
    }
}

EmitJson @{
    ok     = $true
    engine = $engine.RecognizerLanguage.LanguageTag
    width  = $bitmap.PixelWidth
    height = $bitmap.PixelHeight
    lines  = $lines
}
