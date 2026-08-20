# WindForge control panel — start/stop the data-collection worker and watch progress.
# Launched by "WindForge Control.bat". Requires the repo + pnpm on this PC.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ---- configuration -----------------------------------------------------------
$Repo = 'C:\Users\jab19\wind-site-intelligence'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Db   = Join-Path $Here 'windforge.db'
$Out  = Join-Path $Here 'heatmap.json'
$Log  = Join-Path $Here 'worker.log'
$MapUrl = 'https://wind.jamieblair.co.uk/map'
# ------------------------------------------------------------------------------

$script:proc = $null

# palette (matches the app)
$bg     = [System.Drawing.Color]::FromArgb(17, 23, 42)
$card   = [System.Drawing.Color]::FromArgb(26, 34, 56)
$text   = [System.Drawing.Color]::FromArgb(232, 237, 247)
$muted  = [System.Drawing.Color]::FromArgb(154, 166, 194)
$accent = [System.Drawing.Color]::FromArgb(107, 169, 255)
$green  = [System.Drawing.Color]::FromArgb(124, 242, 201)
$warm   = [System.Drawing.Color]::FromArgb(245, 185, 66)
$dark   = [System.Drawing.Color]::FromArgb(10, 14, 26)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'WindForge — UK Wind Data Collector'
$form.Size = New-Object System.Drawing.Size(620, 600)
$form.StartPosition = 'CenterScreen'
$form.BackColor = $bg
$form.ForeColor = $text
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

function New-Label($txtv, $x, $y, $w, $colour, $size, $bold) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $txtv; $l.Location = New-Object System.Drawing.Point($x, $y)
  $l.AutoSize = $false; $l.Size = New-Object System.Drawing.Size($w, 22)
  $l.ForeColor = $colour
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  $l.Font = New-Object System.Drawing.Font('Segoe UI', $size, $style)
  $form.Controls.Add($l); return $l
}

New-Label 'WindForge' 24 18 300 $text 16 $true | Out-Null
New-Label 'UK wind-site data collector' 26 48 400 $muted 9 $false | Out-Null
New-Label "Database:  $Db" 26 74 560 $muted 8 $false | Out-Null

# --- settings ---
New-Label 'AREA' 26 112 120 $accent 8 $true | Out-Null
$cmbArea = New-Object System.Windows.Forms.ComboBox
$cmbArea.Location = New-Object System.Drawing.Point(26, 134)
$cmbArea.Size = New-Object System.Drawing.Size(240, 24)
$cmbArea.DropDownStyle = 'DropDownList'
$cmbArea.BackColor = $card; $cmbArea.ForeColor = $text
[void]$cmbArea.Items.AddRange(@('Whole UK', 'Custom area (BBOX)'))
$cmbArea.SelectedIndex = 0
$form.Controls.Add($cmbArea)

$txtBbox = New-Object System.Windows.Forms.TextBox
$txtBbox.Location = New-Object System.Drawing.Point(276, 134)
$txtBbox.Size = New-Object System.Drawing.Size(300, 24)
$txtBbox.BackColor = $card; $txtBbox.ForeColor = $text
$txtBbox.Text = 'south,west,north,east'
$txtBbox.Enabled = $false
$form.Controls.Add($txtBbox)
$cmbArea.Add_SelectedIndexChanged({ $txtBbox.Enabled = ($cmbArea.SelectedIndex -eq 1) })

New-Label 'CELL SIZE' 26 170 120 $accent 8 $true | Out-Null
$cmbCell = New-Object System.Windows.Forms.ComboBox
$cmbCell.Location = New-Object System.Drawing.Point(26, 192)
$cmbCell.Size = New-Object System.Drawing.Size(240, 24)
$cmbCell.DropDownStyle = 'DropDownList'
$cmbCell.BackColor = $card; $cmbCell.ForeColor = $text
[void]$cmbCell.Items.AddRange(@('20 acres (recommended)', '50 acres (faster)', '5 acres (regional)', '1 acre (tiny areas only)'))
$cmbCell.SelectedIndex = 0
$form.Controls.Add($cmbCell)
$cellSpacing = @{ 0 = '0.2845'; 1 = '0.4497'; 2 = '0.1422'; 3 = '0.0636' }

$chkFarm = New-Object System.Windows.Forms.CheckBox
$chkFarm.Text = '  Skip built-up land (farmland / open only)'
$chkFarm.Location = New-Object System.Drawing.Point(296, 192)
$chkFarm.Size = New-Object System.Drawing.Size(290, 24)
$chkFarm.ForeColor = $text
$form.Controls.Add($chkFarm)

New-Label 'CONCURRENCY' 26 228 120 $accent 8 $true | Out-Null
$numConc = New-Object System.Windows.Forms.NumericUpDown
$numConc.Location = New-Object System.Drawing.Point(26, 250)
$numConc.Size = New-Object System.Drawing.Size(80, 24)
$numConc.Minimum = 1; $numConc.Maximum = 8; $numConc.Value = 2
$numConc.BackColor = $card; $numConc.ForeColor = $text
$form.Controls.Add($numConc)

New-Label 'DELAY (ms)' 140 228 120 $accent 8 $true | Out-Null
$numDelay = New-Object System.Windows.Forms.NumericUpDown
$numDelay.Location = New-Object System.Drawing.Point(140, 250)
$numDelay.Size = New-Object System.Drawing.Size(90, 24)
$numDelay.Minimum = 200; $numDelay.Maximum = 10000; $numDelay.Increment = 100; $numDelay.Value = 900
$numDelay.BackColor = $card; $numDelay.ForeColor = $text
$form.Controls.Add($numDelay)

# --- status ---
$lblDot = New-Label '●' 26 292 20 $warm 12 $true
$lblStatus = New-Label 'Stopped' 46 293 200 $muted 10 $true
$lblProgress = New-Label '' 250 293 330 $muted 9 $false

# --- buttons ---
function Style-Button($b, $fill, $fore) {
  $b.FlatStyle = 'Flat'; $b.FlatAppearance.BorderSize = 0
  $b.BackColor = $fill; $b.ForeColor = $fore
  $b.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
  $b.Size = New-Object System.Drawing.Size(130, 38)
}
$btnStart = New-Object System.Windows.Forms.Button
$btnStart.Text = 'Start'; $btnStart.Location = New-Object System.Drawing.Point(26, 326)
Style-Button $btnStart $accent $dark; $form.Controls.Add($btnStart)

$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = 'Stop'; $btnStop.Location = New-Object System.Drawing.Point(166, 326)
Style-Button $btnStop ([System.Drawing.Color]::FromArgb(45, 58, 92)) $text
$btnStop.Enabled = $false; $form.Controls.Add($btnStop)

$btnFolder = New-Object System.Windows.Forms.Button
$btnFolder.Text = 'Data folder'; $btnFolder.Location = New-Object System.Drawing.Point(306, 326)
Style-Button $btnFolder $card $text; $form.Controls.Add($btnFolder)

$btnMap = New-Object System.Windows.Forms.Button
$btnMap.Text = 'Open map'; $btnMap.Location = New-Object System.Drawing.Point(446, 326)
Style-Button $btnMap $card $text; $form.Controls.Add($btnMap)

# --- log ---
$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true; $logBox.ReadOnly = $true; $logBox.ScrollBars = 'Vertical'
$logBox.Location = New-Object System.Drawing.Point(26, 382)
$logBox.Size = New-Object System.Drawing.Size(556, 170)
$logBox.BackColor = $dark; $logBox.ForeColor = $green
$logBox.Font = New-Object System.Drawing.Font('Consolas', 8.5)
$form.Controls.Add($logBox)

function Set-Running($on) {
  $btnStart.Enabled = -not $on; $btnStop.Enabled = $on
  $cmbArea.Enabled = -not $on; $cmbCell.Enabled = -not $on; $chkFarm.Enabled = -not $on
  $numConc.Enabled = -not $on; $numDelay.Enabled = -not $on
  $txtBbox.Enabled = ((-not $on) -and ($cmbArea.SelectedIndex -eq 1))
  if ($on) { $lblDot.ForeColor = $green; $lblStatus.Text = 'Running'; $lblStatus.ForeColor = $green }
  else { $lblDot.ForeColor = $warm; $lblStatus.Text = 'Stopped'; $lblStatus.ForeColor = $muted }
}

$btnStart.Add_Click({
  $env:DB = $Db; $env:OUT = $Out; $env:HUB_M = '100'; $env:PORT = '8088'
  $env:SPACING_KM = $cellSpacing[[int]$cmbCell.SelectedIndex]
  $env:CONCURRENCY = "$($numConc.Value)"; $env:DELAY_MS = "$($numDelay.Value)"
  if ($cmbArea.SelectedIndex -eq 1) { $env:BBOX = $txtBbox.Text.Trim() } else { $env:BBOX = '' }
  $extra = ''; if ($chkFarm.Checked) { $extra = ' --farmland-only' }
  Set-Content -Path $Log -Value "Starting WindForge worker...`r`n" -Encoding utf8
  $line = "cd /d `"$Repo`" && pnpm --filter @jamieblair/windforge-demo db:init && pnpm --filter @jamieblair/windforge-demo heatmap$extra >> `"$Log`" 2>&1"
  $script:proc = Start-Process cmd.exe -ArgumentList '/c', $line -WindowStyle Hidden -PassThru
  Set-Running $true
})

$btnStop.Add_Click({
  if ($script:proc -and -not $script:proc.HasExited) {
    Start-Process taskkill -ArgumentList '/PID', "$($script:proc.Id)", '/T', '/F' -WindowStyle Hidden -Wait
  }
  $script:proc = $null
  Set-Running $false
})

$btnFolder.Add_Click({ Start-Process explorer.exe $Here })
$btnMap.Add_Click({ Start-Process $MapUrl })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500
$timer.Add_Tick({
  if (Test-Path $Log) {
    try {
      $tail = (Get-Content $Log -Tail 120 -ErrorAction SilentlyContinue) -join "`r`n"
      if ($logBox.Text -ne $tail) { $logBox.Text = $tail; $logBox.SelectionStart = $logBox.Text.Length; $logBox.ScrollToCaret() }
    } catch {}
  }
  if (Test-Path $Out) {
    try {
      $j = Get-Content $Out -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
      $done = [int]$j.meta.done; $total = [int]$j.meta.total
      $pct = if ($total -gt 0) { [math]::Round($done * 100.0 / $total, 1) } else { 0 }
      $lblProgress.Text = "Cells: $($done.ToString('N0')) / $($total.ToString('N0'))  ($pct%)"
    } catch {}
  }
  if ($script:proc -and $script:proc.HasExited) { $script:proc = $null; Set-Running $false }
})
$timer.Start()

$form.Add_FormClosing({
  if ($script:proc -and -not $script:proc.HasExited) {
    Start-Process taskkill -ArgumentList '/PID', "$($script:proc.Id)", '/T', '/F' -WindowStyle Hidden -Wait
  }
})

Set-Running $false
[void]$form.ShowDialog()
