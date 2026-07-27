param(
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$Root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$CacheRoot = Join-Path $Root '.image-cache'
$LogFile = Join-Path $Root 'LOCAL_SERVER.log'
New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null

function Write-ServerLog([string]$Message) {
  try {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  } catch {}
}

function Get-MimeType([string]$Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.htm'  { 'text/html; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.js'   { 'application/javascript; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.txt'  { 'text/plain; charset=utf-8' }
    '.png'  { 'image/png' }
    '.jpg'  { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.webp' { 'image/webp' }
    '.gif'  { 'image/gif' }
    '.svg'  { 'image/svg+xml' }
    '.ico'  { 'image/x-icon' }
    '.pdf'  { 'application/pdf' }
    '.xlsx' { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    '.xls'  { 'application/vnd.ms-excel' }
    '.docx' { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    '.zip'  { 'application/zip' }
    default { 'application/octet-stream' }
  }
}

function Send-Bytes($Context, [byte[]]$Bytes, [string]$ContentType, [int]$StatusCode = 200, [string]$CacheControl = 'no-cache') {
  $response = $Context.Response
  $response.StatusCode = $StatusCode
  $response.ContentType = $ContentType
  $response.ContentLength64 = $Bytes.Length
  $response.Headers['Cache-Control'] = $CacheControl
  $response.Headers['X-Content-Type-Options'] = 'nosniff'
  if ($Context.Request.HttpMethod -ne 'HEAD') {
    $response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  }
  $response.OutputStream.Close()
}

function Send-Text($Context, [string]$Text, [int]$StatusCode = 200) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  Send-Bytes $Context $bytes 'text/plain; charset=utf-8' $StatusCode 'no-store'
}

function Get-Hash([string]$Value) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Serve-ImageProxy($Context) {
  $url = $Context.Request.QueryString['url']
  if ([string]::IsNullOrWhiteSpace($url)) {
    Send-Text $Context 'Thiếu tham số url.' 400
    return
  }

  $uri = $null
  if (-not [System.Uri]::TryCreate($url, [System.UriKind]::Absolute, [ref]$uri) -or ($uri.Scheme -ne 'http' -and $uri.Scheme -ne 'https')) {
    Send-Text $Context 'URL ảnh không hợp lệ.' 400
    return
  }

  $key = Get-Hash $uri.AbsoluteUri
  $dataPath = Join-Path $CacheRoot ($key + '.bin')
  $mimePath = Join-Path $CacheRoot ($key + '.mime')

  if (Test-Path -LiteralPath $dataPath) {
    $bytes = [System.IO.File]::ReadAllBytes($dataPath)
    $mime = if (Test-Path -LiteralPath $mimePath) { (Get-Content -LiteralPath $mimePath -Raw).Trim() } else { 'image/jpeg' }
    Send-Bytes $Context $bytes $mime 200 'public, max-age=2592000'
    return
  }

  try {
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $true
    $client = New-Object System.Net.Http.HttpClient($handler)
    try {
      $client.Timeout = [TimeSpan]::FromSeconds(35)
      $client.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0 InventoryExport/14.0')
      $result = $client.GetAsync($uri).GetAwaiter().GetResult()
      if (-not $result.IsSuccessStatusCode) {
        throw "Máy chủ ảnh phản hồi HTTP $([int]$result.StatusCode)."
      }
      $bytes = $result.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
      $mime = $result.Content.Headers.ContentType.MediaType
      if ([string]::IsNullOrWhiteSpace($mime) -or -not $mime.StartsWith('image/')) {
        $mime = Get-MimeType $uri.AbsolutePath
        if (-not $mime.StartsWith('image/')) { $mime = 'image/jpeg' }
      }
      [System.IO.File]::WriteAllBytes($dataPath, $bytes)
      [System.IO.File]::WriteAllText($mimePath, $mime, [System.Text.Encoding]::UTF8)
      Send-Bytes $Context $bytes $mime 200 'public, max-age=2592000'
    } finally {
      $client.Dispose()
      $handler.Dispose()
    }
  } catch {
    Write-ServerLog "IMAGE ERROR $($uri.AbsoluteUri) :: $($_.Exception.Message)"
    Send-Text $Context 'Không tải được ảnh từ nguồn.' 502
  }
}

function Serve-StaticFile($Context) {
  $relative = [System.Uri]::UnescapeDataString($Context.Request.Url.AbsolutePath).TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
  $relative = $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)

  try {
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
  } catch {
    Send-Text $Context 'Đường dẫn không hợp lệ.' 400
    return
  }

  if (-not $fullPath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
    Send-Text $Context 'Không được phép truy cập.' 403
    return
  }
  if (Test-Path -LiteralPath $fullPath -PathType Container) {
    $fullPath = Join-Path $fullPath 'index.html'
  }
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    Send-Text $Context 'Không tìm thấy tệp.' 404
    return
  }

  try {
    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $mime = Get-MimeType $fullPath
    $cache = if ($mime.StartsWith('image/') -or $mime -eq 'application/pdf') { 'public, max-age=86400' } else { 'no-cache' }
    Send-Bytes $Context $bytes $mime 200 $cache
  } catch {
    Write-ServerLog "STATIC ERROR $fullPath :: $($_.Exception.Message)"
    Send-Text $Context 'Không thể đọc tệp.' 500
  }
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
  Write-ServerLog "START $prefix root=$Root"
} catch {
  Write-ServerLog "START ERROR $prefix :: $($_.Exception.Message)"
  exit 1
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $path = $context.Request.Url.AbsolutePath
      if ($path -eq '/__health') {
        Send-Text $context 'OK' 200
      } elseif ($path -eq '/__image') {
        Serve-ImageProxy $context
      } else {
        Serve-StaticFile $context
      }
    } catch {
      Write-ServerLog "REQUEST ERROR :: $($_.Exception.Message)"
      try { Send-Text $context 'Lỗi máy chủ nội bộ.' 500 } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
  Write-ServerLog 'STOP'
}
