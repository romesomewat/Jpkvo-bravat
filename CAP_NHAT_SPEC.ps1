$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SpecDir = Join-Path $Root "spec"
$ManifestJs = Join-Path $Root "spec-manifest.js"
$ManifestJson = Join-Path $Root "spec-manifest.json"
$AllowedExtensions = @(".pdf", ".jpg", ".jpeg", ".png", ".webp")

if (-not (Test-Path -LiteralPath $SpecDir)) {
    New-Item -ItemType Directory -Path $SpecDir | Out-Null
}

function Convert-ToUrlPath([string]$RelativePath) {
    $segments = $RelativePath -split "[\\/]"
    $encoded = foreach ($segment in $segments) {
        [System.Uri]::EscapeDataString($segment)
    }
    return ($encoded -join "/")
}

$Map = [ordered]@{}
$Files = Get-ChildItem -LiteralPath $SpecDir -File -Recurse |
    Where-Object { $AllowedExtensions -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object FullName

foreach ($File in $Files) {
    $Code = $File.BaseName.Trim().ToUpperInvariant()
    if ([string]::IsNullOrWhiteSpace($Code)) { continue }

    $Relative = $File.FullName.Substring($SpecDir.Length).TrimStart('\', '/')
    $Url = "spec/" + (Convert-ToUrlPath $Relative)

    if (-not $Map.Contains($Code)) {
        $Map[$Code] = $Url
    }
}

$Json = $Map | ConvertTo-Json -Depth 5
if ([string]::IsNullOrWhiteSpace($Json)) { $Json = "{}" }

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ManifestJson, $Json + [Environment]::NewLine, $Utf8NoBom)
$Js = "/* Tự động tạo từ thư mục spec. Không sửa tay. */`nwindow.INVENTORY_SPEC_MANIFEST = " + $Json + ";`n"
[System.IO.File]::WriteAllText($ManifestJs, $Js, $Utf8NoBom)

Write-Host ("Đã cập nhật {0} file bản vẽ kỹ thuật." -f $Map.Count)
