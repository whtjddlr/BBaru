$ErrorActionPreference = "Stop"

if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

. ".\.venv\Scripts\Activate.ps1"
pip install -r requirements.txt

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ".env 파일을 생성했습니다. 필요하면 SAFEETA_SERVICE_KEY를 직접 입력하세요."
}

python -m uvicorn app.main:app --reload

