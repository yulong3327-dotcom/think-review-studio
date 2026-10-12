@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 正在安装网站依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo 安装失败，请检查网络与 Node.js。
    pause
    exit /b 1
  )
)
start "" "http://127.0.0.1:5173"
call npm run dev
pause
