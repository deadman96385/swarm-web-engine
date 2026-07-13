@echo off
rem Double-click launcher for the Swarm Web Engine local server (Windows).
title Swarm Web Engine
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo(
  echo Node.js is required to run the local server.
  echo Install it from https://nodejs.org/ then double-click this file again.
  echo(
  pause
  exit /b 1
)

echo Starting the Swarm Web Engine local server...
echo A browser tab will open automatically. Close this window to stop the server.
echo(
node scripts\serve.mjs --open
if errorlevel 1 pause
