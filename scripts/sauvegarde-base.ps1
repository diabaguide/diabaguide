<#
  Sauvegarde de la base Diaba Guide dans deux fichiers locaux :
    - …-public.dump : toutes les données et la structure de l'application (tables, règles d'accès, fonctions) ;
    - …-comptes.dump : les comptes des utilisateurs (tables auth.users et auth.identities, données seulement).

  Ce script ne MODIFIE RIEN : il lit la base (pg_dump) et écrit un fichier dans le dossier
  « sauvegardes » du projet (ignoré par git). À lancer depuis la racine du projet :

      powershell -ExecutionPolicy Bypass -File scripts/sauvegarde-base.ps1

  Il demande l'adresse de connexion de la base, saisie masquée : elle contient le mot de passe,
  elle n'est jamais écrite dans un fichier ni affichée. Où la trouver : tableau de bord Supabase,
  bouton « Connect », rubrique « Session pooler » (compatible avec les réseaux sans IPv6),
  en remplaçant [YOUR-PASSWORD] par le mot de passe de la base.

  Nécessite Docker (l'outil pg_dump est pris dans l'image officielle de PostgreSQL, rien à installer).
  Ne garde que les 8 dernières sauvegardes (de chaque type).
#>
param(
  [string]$Dossier = 'sauvegardes',
  [int]$Garder = 8,
  [string]$Image = 'postgres:18-alpine'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker est introuvable. Installez Docker Desktop, ou suivez la méthode manuelle de docs/sauvegarde-restauration.md."
}

$secure = Read-Host 'Adresse de connexion de la base (saisie masquée)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $conn = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if ($conn -notmatch '^postgres(ql)?://') { throw "L'adresse doit commencer par postgresql:// (voir l'aide en tête de ce script)." }
if ($conn -match '\[YOUR-PASSWORD\]') { throw "Remplacez [YOUR-PASSWORD] par le mot de passe de la base." }

New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
$dossierAbs = (Resolve-Path $Dossier).Path
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$nomPublic = "diaba-guide-$stamp-public.dump"
$nomComptes = "diaba-guide-$stamp-comptes.dump"

# L'adresse passe par une variable d'environnement : elle n'apparaît pas dans la ligne de commande de docker.
$env:DIABA_CONN = $conn
try {
  # Structure et données de l'application, avec les droits d'accès (indispensables : ils protègent les données des voyageurs).
  docker run --rm -e DIABA_CONN -v "${dossierAbs}:/out" $Image sh -c "pg_dump `"`$DIABA_CONN`" --schema=public --no-owner -Fc -f /out/$nomPublic"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump a échoué (code $LASTEXITCODE). Vérifiez l'adresse et le mot de passe." }
  # Comptes des utilisateurs : données seulement (la structure de auth appartient à Supabase).
  docker run --rm -e DIABA_CONN -v "${dossierAbs}:/out" $Image sh -c "pg_dump `"`$DIABA_CONN`" --data-only --table=auth.users --table=auth.identities --no-owner -Fc -f /out/$nomComptes"
  if ($LASTEXITCODE -ne 0) { throw "La sauvegarde des comptes a échoué (code $LASTEXITCODE)." }
} finally {
  Remove-Item Env:\DIABA_CONN -ErrorAction SilentlyContinue
  $conn = $null
}

function Verifier($nom, $motif) {
  $f = Join-Path $dossierAbs $nom
  if (-not (Test-Path $f) -or (Get-Item $f).Length -lt 500) { throw "La sauvegarde est vide ou absente : $f" }
  # Le fichier doit être relisible par pg_restore et contenir ce qu'on attend.
  $liste = docker run --rm -v "${dossierAbs}:/out" $Image pg_restore --list "/out/$nom"
  if ($LASTEXITCODE -ne 0 -or -not ($liste -match $motif)) { throw "La sauvegarde ne se relit pas correctement : $f" }
  return [math]::Round((Get-Item $f).Length / 1MB, 2)
}
$tPublic = Verifier $nomPublic 'TABLE public profiles'
$tComptes = Verifier $nomComptes 'TABLE DATA auth users'

# On ne garde que les dernières sauvegardes de chaque type.
foreach ($type in 'public', 'comptes') {
  Get-ChildItem $dossierAbs -Filter "diaba-guide-*-$type.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Garder | Remove-Item
}

Write-Host "Sauvegarde terminée et vérifiée :" -ForegroundColor Green
Write-Host "  $(Join-Path $dossierAbs $nomPublic) ($tPublic Mo)"
Write-Host "  $(Join-Path $dossierAbs $nomComptes) ($tComptes Mo)"
Write-Host "Copiez ces deux fichiers hors de cet ordinateur (disque externe, stockage en ligne privé) : une sauvegarde au même endroit que l'original ne protège pas d'une panne du disque. Ils contiennent les données des voyageurs : ne les partagez pas."
