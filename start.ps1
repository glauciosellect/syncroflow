# SyncroFlow - Script de inicialização
Write-Host "Iniciando SyncroFlow..." -ForegroundColor Cyan

# Inicia a API
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "Write-Host 'API - SyncroFlow' -ForegroundColor Green; " + `
  "Set-Location 'C:\Users\tecno\OneDrive\Área de Trabalho\PROJETOS DE AUTOMAÇÃO IA\SyncroFlow\apps\api'; " + `
  "npx tsx src/index.ts" `
  -WindowStyle Normal

Start-Sleep -Seconds 5

# Inicia o Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "Write-Host 'FRONTEND - SyncroFlow' -ForegroundColor Magenta; " + `
  "Set-Location 'C:\Users\tecno\OneDrive\Área de Trabalho\PROJETOS DE AUTOMAÇÃO IA\SyncroFlow\apps\web'; " + `
  "npx next dev -p 3000" `
  -WindowStyle Normal

Write-Host "Aguarde 15 segundos e acesse: http://localhost:3000" -ForegroundColor Yellow
