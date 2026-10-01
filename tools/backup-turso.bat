@echo off
REM Backup Turso -> MySQL lokal (XAMPP). Contoh:
REM   tools\backup-turso.bat            -> buat file .sql saja
REM   tools\backup-turso.bat --import   -> buat file .sql + impor ke MySQL (phpMyAdmin)
setlocal
set "PHP=%~dp0..\..\..\php\php.exe"
if not exist "%PHP%" set "PHP=php"
"%PHP%" "%~dp0backup-turso.php" %*
exit /b %ERRORLEVEL%
