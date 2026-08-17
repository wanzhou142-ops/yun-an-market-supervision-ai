# 方案 A · Step 0 网络与环境验收脚本（Windows PowerShell）
# 用法：在项目根目录执行
#   powershell -ExecutionPolicy Bypass -File big-screen/scripts/verify-step0.ps1

$ErrorActionPreference = "Continue"
$pass = 0
$fail = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Block)
    Write-Host "`n--- $Name ---" -ForegroundColor Cyan
    try {
        & $Block
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            Write-Host "PASS: $Name" -ForegroundColor Green
            $script:pass++
        } else {
            Write-Host "FAIL: $Name (exit $LASTEXITCODE)" -ForegroundColor Red
            $script:fail++
        }
    } catch {
        Write-Host "FAIL: $Name — $($_.Exception.Message)" -ForegroundColor Red
        $script:fail++
    }
}

Write-Host "=== 方案 A Step 0 验收 ===" -ForegroundColor Yellow

Test-Step "DashScope 公网可达" {
    $r = Invoke-WebRequest -Uri "https://dashscope.aliyuncs.com" -Method Head -TimeoutSec 10 -UseBasicParsing
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return }
    throw "HTTP $($r.StatusCode)"
}

Test-Step "Dify 内网可达" {
    $base = $env:DIFY_API_BASE
    if (-not $base) {
        $example = Join-Path $PSScriptRoot "..\frontend\.env.local"
        if (Test-Path $example) {
            $line = Get-Content $example | Where-Object { $_ -match "^DIFY_API_BASE=" } | Select-Object -First 1
            if ($line) { $base = ($line -split "=", 2)[1].Trim() }
        }
    }
    if (-not $base) { $base = "http://zkt.medlibbot.com:8380/v1" }
    $hostUrl = $base -replace "/v1/?$", ""
    $r = Invoke-WebRequest -Uri $hostUrl -Method Head -TimeoutSec 10 -UseBasicParsing
    Write-Host "  探测: $hostUrl → $($r.StatusCode)"
}

Test-Step "voice-service /health" {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5
    $r | ConvertTo-Json -Compress | Write-Host
    if (-not $r.ok) { throw "ok=false" }
}

Test-Step "frontend .env.local 存在" {
    $p = Join-Path $PSScriptRoot "..\frontend\.env.local"
    if (-not (Test-Path $p)) {
        Write-Host "  提示: 复制 .env.local.example → .env.local 并填写 Key" -ForegroundColor Yellow
        throw ".env.local 不存在"
    }
    $content = Get-Content $p -Raw
    if ($content -notmatch "DIFY_API_KEY=app-") {
        Write-Host "  提示: DIFY_API_KEY 仍是占位符或未填" -ForegroundColor Yellow
    }
}

Test-Step "voice-service .env 存在" {
    $p = Join-Path $PSScriptRoot "..\voice-service\.env"
    if (-not (Test-Path $p)) {
        Write-Host "  提示: copy voice-service\.env.example → .env" -ForegroundColor Yellow
        throw ".env 不存在"
    }
    $content = Get-Content $p -Raw
    if ($content -match "DASHSCOPE_API_KEY=sk-xxx") {
        Write-Host "  提示: DASHSCOPE_API_KEY 仍是占位符" -ForegroundColor Yellow
    }
}

Write-Host "`n=== 结果: $pass 通过, $fail 失败 ===" -ForegroundColor Yellow
if ($fail -gt 0) {
    Write-Host "请对照 docs/learn/step-00-环境与网络验收.md 排查" -ForegroundColor Yellow
    exit 1
}
exit 0
