@call npx web-ext lint --source-dir "%~dp0..\src" --warnings-as-errors=false
@if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
@echo {}
