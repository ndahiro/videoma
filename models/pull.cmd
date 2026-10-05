@echo off
REM Pulls the two NVIDIA NIM model images used by the upstream VSS blueprint.
REM Run once on a machine with internet + nvcr.io creds + enough disk.
REM Resulting images are not committed to git (see models\.gitignore).
REM
REM Usage (PowerShell):
REM   $env:NGC_CLI_API_KEY = "nvapi-..."
REM   .\models\pull.ps1
REM
REM Or cmd:
REM   set NGC_CLI_API_KEY=nvapi-...
REM   models\pull.cmd

setlocal
if "%NGC_CLI_API_KEY%"=="" (
  if "%NGC_CLI_API_KEY%"=="" (
    echo ERROR: NGC_CLI_API_KEY is not set. 1>&2
    echo        set NGC_CLI_API_KEY=nvapi-... 1>&2
    exit /b 1
  )
)

if "%VLM_NIM_IMAGE%"=="" set VLM_NIM_IMAGE=nvcr.io/nim/nvidia/cosmos3-reasoner:1.7
if "%LLM_NIM_IMAGE%"=="" set LLM_NIM_IMAGE=nvcr.io/nim/nvidia/nemotron-3.5-lightning-30b-a3b:2.0.9-variant

echo ^^>^> docker login nvcr.io
echo %NGC_CLI_API_KEY% | docker login nvcr.io -u $oauthtoken --password-stdin

echo ^^>^> docker pull %VLM_NIM_IMAGE%
docker pull %VLM_NIM_IMAGE%

echo ^^>^> docker pull %LLM_NIM_IMAGE%
docker pull %LLM_NIM_IMAGE%

echo ^^>^> done. images present:
docker images --format "  {{.Repository}}:{{.Tag}}	{{.Size}}" | findstr /R "cosmos3-reasoner nemotron-3.5"
endlocal
