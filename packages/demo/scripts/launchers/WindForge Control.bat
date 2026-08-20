@echo off
rem Launches the WindForge control panel (PowerShell WinForms GUI).
powershell -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0WindForge-Control.ps1"
