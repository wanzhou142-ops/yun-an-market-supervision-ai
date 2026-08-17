# 一键创建 Dify 知识库并上传 zones 文档（需公司内网 + API Key）
# 用法：
#   cd big-screen\dify\scripts
#   $env:DIFY_API_BASE = "http://zkt.medlibbot.com:8380/v1"
#   $env:DIFY_API_KEY  = "app-xxxxxxxx"
#   .\setup-kb.ps1

param(
  [string]$ApiBase = $env:DIFY_API_BASE,
  [string]$ApiKey  = $env:DIFY_API_KEY,
  [string]$ZonesDir = (Resolve-Path "..\..\..\shared\knowledge-base\zones").Path
)

$ErrorActionPreference = "Stop"

if (-not $ApiBase -or -not $ApiKey) {
  Write-Host "请设置 DIFY_API_BASE 和 DIFY_API_KEY 环境变量" -ForegroundColor Red
  exit 1
}

$headers = @{
  Authorization = "Bearer $ApiKey"
}

function New-Dataset($name) {
  $body = @{
    name = $name
    indexing_technique = "high_quality"
  } | ConvertTo-Json
  $r = Invoke-RestMethod -Method Post -Uri "$ApiBase/datasets" -Headers $headers -ContentType "application/json" -Body $body
  return $r.id
}

function Add-Doc($datasetId, $filePath) {
  $boundary = [System.Guid]::NewGuid().ToString()
  $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
  $fileName = [System.IO.Path]::GetFileName($filePath)
  $enc = [System.Text.Encoding]::UTF8
  $LF = "`r`n"
  $bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"data`"",
    "Content-Type: application/json",
    "",
    '{"indexing_technique":"high_quality","process_rule":{"mode":"automatic"}}',
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
    "Content-Type: application/octet-stream",
    ""
  )
  $bodyStart = ($bodyLines -join $LF) + $LF
  $bodyEnd = $LF + "--$boundary--" + $LF
  $bodyStartBytes = $enc.GetBytes($bodyStart)
  $bodyEndBytes = $enc.GetBytes($bodyEnd)
  $bodyAll = New-Object byte[] ($bodyStartBytes.Length + $fileBytes.Length + $bodyEndBytes.Length)
  [Buffer]::BlockCopy($bodyStartBytes, 0, $bodyAll, 0, $bodyStartBytes.Length)
  [Buffer]::BlockCopy($fileBytes, 0, $bodyAll, $bodyStartBytes.Length, $fileBytes.Length)
  [Buffer]::BlockCopy($bodyEndBytes, 0, $bodyAll, $bodyStartBytes.Length + $fileBytes.Length, $bodyEndBytes.Length)
  Invoke-RestMethod -Method Post -Uri "$ApiBase/datasets/$datasetId/document/create_by_file" -Headers @{ Authorization = "Bearer $ApiKey" } -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyAll | Out-Null
  Write-Host "  + $fileName"
}

Write-Host "=== 创建知识库（共 5 个）===" -ForegroundColor Cyan

$kbWelcome = New-Dataset "KB-welcome-序厅"
$kbCosmetic = New-Dataset "KB-corridor-cosmetic-化妆品"
$kbDrug = New-Dataset "KB-corridor-drug-药品"
$kbDevice = New-Dataset "KB-corridor-device-器械"
$kbPharmacy = New-Dataset "KB-pharmacy-模拟药店"

Write-Host "KB-welcome: $kbWelcome"
Write-Host "KB-cosmetic: $kbCosmetic"
Write-Host "KB-drug: $kbDrug"
Write-Host "KB-device: $kbDevice"
Write-Host "KB-pharmacy: $kbPharmacy"

Write-Host "`n=== 上传文档 ===" -ForegroundColor Cyan
Add-Doc $kbWelcome (Join-Path $ZonesDir "序厅1-展厅形象墙.docx")
Add-Doc $kbWelcome (Join-Path $ZonesDir "序厅2-习近平总书记重要论述.docx")

foreach ($f in @("科普篇","法规篇","案例篇")) {
  Add-Doc $kbCosmetic (Join-Path $ZonesDir "化妆品展区-$f.docx")
  Add-Doc $kbDrug (Join-Path $ZonesDir "药品展区-$f.docx")
  Add-Doc $kbDevice (Join-Path $ZonesDir "医疗器械展区-$f.docx")
}

Add-Doc $kbPharmacy (Join-Path $ZonesDir "模拟药店简介.docx")

Write-Host "`n=== 完成 ===" -ForegroundColor Green
Write-Host @"

下一步（Dify 控制台）：
1. 导入/更新 Chatflow：big-screen/dify/workflows/普法助手-阶段B.yml
2. 打开各「知识检索」节点，挂对应知识库：
   - 检索-序厅          → KB-welcome-序厅
   - 检索-模拟药店      → KB-pharmacy-模拟药店
   - 检索-化妆品区      → KB-corridor-cosmetic-化妆品
   - 检索-药品区        → KB-corridor-drug-药品
   - 检索-器械区        → KB-corridor-device-器械
   - 检索-宣传廊三库    → 同时勾选 cosmetic + drug + device 三个库（不单独建库）
3. 等索引完成 → 发布 → API Key 写入 frontend/.env.local

Dataset ID 对照：
  welcome=$kbWelcome
  cosmetic=$kbCosmetic
  drug=$kbDrug
  device=$kbDevice
  pharmacy=$kbPharmacy
"@
