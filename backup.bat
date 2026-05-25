@echo off
REM 数据库备份脚本 — Database Backup Script
REM 使用方式: backup.bat [备份目录]

setlocal enabledelayedexpansion

set BACKUP_DIR=%~1
if "%BACKUP_DIR%"=="" set BACKUP_DIR=.\backups

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_FILE=%BACKUP_DIR%\bishe_backup_%TIMESTAMP%.sql

echo [%date% %time%] 开始数据库备份...
mysqldump -u root -proot bishe > "%BACKUP_FILE%" 2>&1

if %ERRORLEVEL% EQU 0 (
  echo [%date% %time%] 备份成功: %BACKUP_FILE%
  REM 保留最近7天的备份
  forfiles /p "%BACKUP_DIR%" /m "bishe_backup_*.sql" /d -7 /c "cmd /c del @file" 2>nul
) else (
  echo [%date% %time%] 备份失败，请检查数据库连接
  exit /b 1
)
