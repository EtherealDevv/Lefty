@echo off
REM Lefty - launcher con elevación opcional
echo Iniciando Lefty...
py -m pip install -r requirements.txt --quiet
py main.py %*
pause
