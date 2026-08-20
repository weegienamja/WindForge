@echo off
setlocal
title WindForge data worker (20-acre, UK)

rem ---- configuration -------------------------------------------------------
set "REPO=C:\Users\jab19\wind-site-intelligence"
set "DB=F:\WindForge database\windforge.db"
set "OUT=F:\WindForge database\heatmap.json"
set "SPACING_KM=0.2845"
set "HUB_M=100"
set "CONCURRENCY=2"
set "DELAY_MS=900"
set "PORT=8088"
rem --------------------------------------------------------------------------

cd /d "%REPO%" || (echo Could not find the repo at %REPO% & pause & exit /b 1)

echo ============================================================
echo  WindForge data collector
echo  Repo : %REPO%
echo  Data : %DB%
echo  Cells: ~20 acres  (SPACING_KM=%SPACING_KM%)
echo  Feed : http://localhost:%PORT%/heatmap.json
echo ============================================================
echo  Leave this window open. Close it (or press Ctrl+C) to stop.
echo  It resumes where it left off when restarted.
echo.

call pnpm --filter @jamieblair/windforge-demo db:init
call pnpm --filter @jamieblair/windforge-demo heatmap

echo.
echo Worker stopped.
pause
