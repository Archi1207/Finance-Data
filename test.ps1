$base = "http://localhost:3000"
$pass = 0; $fail = 0

function OK  { param($label) Write-Host ("  [PASS] " + $label) -ForegroundColor Green;  $script:pass++ }
function FAIL { param($label, $reason) Write-Host ("  [FAIL] " + $label + " --> " + $reason) -ForegroundColor Red; $script:fail++ }
function Section { param($t) Write-Host ("`n--- " + $t + " ---") -ForegroundColor Cyan }

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "   FINANCE BACKEND — FULL TEST SUITE   " -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

# ── 1. Health ─────────────────────────────────────────────────────────────────
Section "1. HEALTH CHECK"
try {
    $r = Invoke-RestMethod "$base/health"
    if ($r.status -eq "ok") { OK "GET /health" } else { FAIL "GET /health" $r.status }
} catch { FAIL "GET /health" $_.Exception.Message }

# ── 2. Auth ───────────────────────────────────────────────────────────────────
Section "2. AUTH"
try {
    $r = Invoke-RestMethod -Method POST "$base/api/auth/login" -ContentType 'application/json' -Body '{"email":"admin@example.com","password":"Admin@123"}'
    $adminToken = $r.data.token
    if ($r.data.user.role -eq "admin") { OK "Login admin → role=admin" } else { FAIL "Login admin" $r.data.user.role }
} catch { FAIL "Login admin" $_.Exception.Message; exit }

try {
    $r = Invoke-RestMethod -Method POST "$base/api/auth/login" -ContentType 'application/json' -Body '{"email":"analyst@example.com","password":"Analyst@123"}'
    $analystToken = $r.data.token
    OK "Login analyst → role=analyst"
} catch { FAIL "Login analyst" $_.Exception.Message; exit }

try {
    $r = Invoke-RestMethod -Method POST "$base/api/auth/login" -ContentType 'application/json' -Body '{"email":"viewer@example.com","password":"Viewer@123"}'
    $viewerToken = $r.data.token
    OK "Login viewer → role=viewer"
} catch { FAIL "Login viewer" $_.Exception.Message; exit }

try {
    Invoke-RestMethod -Method POST "$base/api/auth/login" -ContentType 'application/json' -Body '{"email":"admin@example.com","password":"wrongpass"}' | Out-Null
    FAIL "Bad password → should be 401" "no error thrown"
} catch { OK "Bad password → 401" }

try {
    Invoke-RestMethod "$base/api/auth/me" -Headers @{Authorization="Bearer $adminToken"} | Out-Null
    OK "GET /api/auth/me"
} catch { FAIL "GET /api/auth/me" $_.Exception.Message }

# ── 3. Transactions ───────────────────────────────────────────────────────────
Section "3. TRANSACTIONS"

# No token
try {
    Invoke-RestMethod "$base/api/transactions" | Out-Null
    FAIL "No token → should be 401" "no error"
} catch { OK "No token → 401" }

# List (viewer can read)
try {
    $r = Invoke-RestMethod "$base/api/transactions" -Headers @{Authorization="Bearer $viewerToken"}
    OK "GET /api/transactions (viewer) → $($r.data.pagination.total) records"
} catch { FAIL "GET /api/transactions (viewer)" $_.Exception.Message }

# Filter by type
try {
    $r = Invoke-RestMethod "$base/api/transactions?type=income" -Headers @{Authorization="Bearer $viewerToken"}
    OK "GET /api/transactions?type=income → $($r.data.pagination.total) records"
} catch { FAIL "GET ?type=income" $_.Exception.Message }

# Filter by date range
try {
    $r = Invoke-RestMethod "$base/api/transactions?from=2026-01-01&to=2026-03-31" -Headers @{Authorization="Bearer $viewerToken"}
    OK "GET /api/transactions?from=..&to=.. → $($r.data.pagination.total) records"
} catch { FAIL "GET date filter" $_.Exception.Message }

# Create (admin)
$txBody = '{"amount":9999,"type":"income","category":"TestBonus","date":"2026-04-05","notes":"test entry"}'
try {
    $r = Invoke-RestMethod -Method POST "$base/api/transactions" -ContentType 'application/json' -Headers @{Authorization="Bearer $adminToken"} -Body $txBody
    $txId = $r.data.transaction.id
    OK "POST /api/transactions (admin) → id=$txId"
} catch { FAIL "POST /api/transactions (admin)" $_.Exception.Message }

# Create blocked for viewer
try {
    Invoke-RestMethod -Method POST "$base/api/transactions" -ContentType 'application/json' -Headers @{Authorization="Bearer $viewerToken"} -Body $txBody | Out-Null
    FAIL "POST (viewer) → should be 403" "no error"
} catch { OK "POST /api/transactions (viewer) → 403" }

# Create blocked for analyst
try {
    Invoke-RestMethod -Method POST "$base/api/transactions" -ContentType 'application/json' -Headers @{Authorization="Bearer $analystToken"} -Body $txBody | Out-Null
    FAIL "POST (analyst) → should be 403" "no error"
} catch { OK "POST /api/transactions (analyst) → 403" }

# Get single
try {
    $r = Invoke-RestMethod "$base/api/transactions/$txId" -Headers @{Authorization="Bearer $analystToken"}
    OK "GET /api/transactions/$txId → amount=$($r.data.transaction.amount)"
} catch { FAIL "GET /api/transactions/:id" $_.Exception.Message }

# Update (admin)
try {
    $r = Invoke-RestMethod -Method PUT "$base/api/transactions/$txId" -ContentType 'application/json' -Headers @{Authorization="Bearer $adminToken"} -Body '{"notes":"updated note"}'
    OK "PUT /api/transactions/$txId → notes updated"
} catch { FAIL "PUT /api/transactions/:id" $_.Exception.Message }

# Validation — missing amount
try {
    Invoke-RestMethod -Method POST "$base/api/transactions" -ContentType 'application/json' -Headers @{Authorization="Bearer $adminToken"} -Body '{"type":"income","category":"X","date":"2026-04-05"}' | Out-Null
    FAIL "Missing amount → should be 422" "no error"
} catch { OK "Missing amount → 422" }

# Soft delete (admin)
try {
    $r = Invoke-RestMethod -Method DELETE "$base/api/transactions/$txId" -Headers @{Authorization="Bearer $adminToken"}
    OK "DELETE /api/transactions/$txId (soft delete)"
} catch { FAIL "DELETE /api/transactions/:id" $_.Exception.Message }

# Verify deleted record is gone
try {
    Invoke-RestMethod "$base/api/transactions/$txId" -Headers @{Authorization="Bearer $adminToken"} | Out-Null
    FAIL "Deleted tx should return 404" "still found"
} catch { OK "Deleted transaction → 404" }

# ── 4. Dashboard ──────────────────────────────────────────────────────────────
Section "4. DASHBOARD"

try {
    $r = Invoke-RestMethod "$base/api/dashboard/summary" -Headers @{Authorization="Bearer $viewerToken"}
    OK "GET /dashboard/summary → income=$($r.data.total_income) expenses=$($r.data.total_expenses) net=$($r.data.net_balance)"
} catch { FAIL "GET /dashboard/summary" $_.Exception.Message }

try {
    $r = Invoke-RestMethod "$base/api/dashboard/recent?limit=3" -Headers @{Authorization="Bearer $viewerToken"}
    OK "GET /dashboard/recent → $($r.data.recent.Count) items"
} catch { FAIL "GET /dashboard/recent" $_.Exception.Message }

try {
    $r = Invoke-RestMethod "$base/api/dashboard/category-totals" -Headers @{Authorization="Bearer $analystToken"}
    OK "GET /dashboard/category-totals (analyst) → $($r.data.categories.Count) categories"
} catch { FAIL "GET /dashboard/category-totals (analyst)" $_.Exception.Message }

try {
    Invoke-RestMethod "$base/api/dashboard/category-totals" -Headers @{Authorization="Bearer $viewerToken"} | Out-Null
    FAIL "category-totals (viewer) → should be 403" "no error"
} catch { OK "GET /dashboard/category-totals (viewer) → 403" }

try {
    $r = Invoke-RestMethod "$base/api/dashboard/trends?year=2026&period=monthly" -Headers @{Authorization="Bearer $analystToken"}
    OK "GET /dashboard/trends → $($r.data.trends.Count) months"
} catch { FAIL "GET /dashboard/trends" $_.Exception.Message }

try {
    $r = Invoke-RestMethod "$base/api/dashboard/top-categories?type=expense&limit=3" -Headers @{Authorization="Bearer $adminToken"}
    OK "GET /dashboard/top-categories (expense) → $($r.data.top_categories.Count) categories"
} catch { FAIL "GET /dashboard/top-categories" $_.Exception.Message }

# ── 5. User Management ────────────────────────────────────────────────────────
Section "5. USER MANAGEMENT"

try {
    $r = Invoke-RestMethod "$base/api/users" -Headers @{Authorization="Bearer $adminToken"}
    OK "GET /api/users (admin) → $($r.data.pagination.total) users"
} catch { FAIL "GET /api/users (admin)" $_.Exception.Message }

try {
    Invoke-RestMethod "$base/api/users" -Headers @{Authorization="Bearer $analystToken"} | Out-Null
    FAIL "GET /api/users (analyst) → should be 403" "no error"
} catch { OK "GET /api/users (analyst) → 403" }

try {
    Invoke-RestMethod "$base/api/users" -Headers @{Authorization="Bearer $viewerToken"} | Out-Null
    FAIL "GET /api/users (viewer) → should be 403" "no error"
} catch { OK "GET /api/users (viewer) → 403" }

# Register a temp user then update role
try {
    $ts = Get-Date -Format "HHmmss"
    $newBody = "{`"name`":`"Temp$ts`",`"email`":`"temp$ts@test.com`",`"password`":`"Temp@123`",`"role`":`"viewer`"}"
    $nr = Invoke-RestMethod -Method POST "$base/api/auth/register" -ContentType 'application/json' -Body $newBody
    $newId = $nr.data.user.id
    OK "Register temp user → id=$newId"

    # Update role
    $r = Invoke-RestMethod -Method PATCH "$base/api/users/$newId/role" -ContentType 'application/json' -Headers @{Authorization="Bearer $adminToken"} -Body '{"role":"analyst"}'
    if ($r.data.user.role -eq "analyst") { OK "PATCH /api/users/:id/role → analyst" } else { FAIL "PATCH role" $r.data.user.role }

    # Deactivate
    $r = Invoke-RestMethod -Method PATCH "$base/api/users/$newId/status" -ContentType 'application/json' -Headers @{Authorization="Bearer $adminToken"} -Body '{"status":"inactive"}'
    if ($r.data.user.status -eq "inactive") { OK "PATCH /api/users/:id/status → inactive" } else { FAIL "PATCH status" $r.data.user.status }

    # Delete temp user (no transactions)
    $r = Invoke-RestMethod -Method DELETE "$base/api/users/$newId" -Headers @{Authorization="Bearer $adminToken"}
    OK "DELETE /api/users/$newId"
} catch { FAIL "User lifecycle test" $_.Exception.Message }

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host ("   RESULTS:  " + $pass + " passed   " + $fail + " failed   ") -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================`n" -ForegroundColor Yellow
