param(
  [Parameter(Mandatory = $true)]
  [string]$FabricSamplesPath,

  [string]$ChannelName = "uav-blackbox",
  [string]$ChaincodeName = "uavblackbox"
)

$ErrorActionPreference = "Stop"

$networkPath = Join-Path $FabricSamplesPath "test-network"
if (-not (Test-Path $networkPath)) {
  throw "test-network was not found under $FabricSamplesPath"
}

$chaincodePath = Resolve-Path (Join-Path $PSScriptRoot "..\chaincode\uav-blackbox")
$chaincodePathForBash = $chaincodePath.Path

if (Get-Command cygpath -ErrorAction SilentlyContinue) {
  $chaincodePathForBash = (& cygpath -u $chaincodePath.Path).Trim()
}

Push-Location $networkPath
try {
  bash ./network.sh down
  bash ./network.sh up createChannel -ca -s couchdb -c $ChannelName
  bash ./network.sh deployCC -ccn $ChaincodeName -ccp $chaincodePathForBash -ccl javascript -c $ChannelName
}
finally {
  Pop-Location
}

Write-Host "Fabric test-network is ready."
Write-Host "Channel: $ChannelName"
Write-Host "Chaincode: $ChaincodeName"

