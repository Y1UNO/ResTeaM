# Construit l'exe de production de ResTeaM et met à jour le raccourci du Bureau.
# Utilisation : npm run build:exe
$ErrorActionPreference = 'Stop'

$racine = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $racine 'src-tauri\target\release\ResTeaM.exe'

# Un exe ouvert est verrouillé par Windows : on ferme l'ancienne version avant de la remplacer.
$ouverts = Get-Process -Name 'ResTeaM' -ErrorAction SilentlyContinue
if ($ouverts) {
    Write-Host 'Fermeture de ResTeaM (ancienne version)...'
    $ouverts | Stop-Process -Force
    Start-Sleep -Milliseconds 800
}

Push-Location $racine
try {
    npx tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "La compilation a échoué (code $LASTEXITCODE)." }
} finally {
    Pop-Location
}

# Raccourci sur le Bureau, qui pointe toujours vers le dernier exe construit.
$bureau = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $bureau 'ResTeaM.lnk'
$shell = New-Object -ComObject WScript.Shell
$raccourci = $shell.CreateShortcut($lnk)
$raccourci.TargetPath = $exe
$raccourci.WorkingDirectory = Split-Path -Parent $exe
# Icône explicite (fichier .ico du logo) : Windows ne réutilise pas une vieille icône en cache.
$icone = Join-Path $racine 'src-tauri\icons\icon.ico'
$raccourci.IconLocation = "$icone,0"
$raccourci.Description = 'ResTeaM — vitrine pour Steam (dernière version construite)'
$raccourci.Save()

$date = (Get-Item $exe).LastWriteTime.ToString('dd/MM/yyyy HH:mm')
Write-Host "Exe à jour ($date) : $exe"
Write-Host "Raccourci : $lnk"
