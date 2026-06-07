# Fabric 部署说明

本项目链码使用 Fabric Node.js Contract API，链码路径为：

```text
chaincode/uav-blackbox
```

## 1. 准备 Fabric samples

安装 Docker、Git Bash 或 WSL，并下载 Hyperledger Fabric samples。确认能进入 `fabric-samples/test-network` 并运行 `network.sh`。

## 2. 部署链码

在仓库根目录执行：

```powershell
.\scripts\fabric-test-network.ps1 -FabricSamplesPath C:\path\to\fabric-samples
```

脚本会执行：

- `network.sh down`
- `network.sh up createChannel -ca -s couchdb -c uav-blackbox`
- `network.sh deployCC -ccn uavblackbox -ccp chaincode/uav-blackbox -ccl javascript -c uav-blackbox`

## 3. 配置 API Gateway

复制：

```powershell
Copy-Item apps\api\.env.example apps\api\.env
```

把 `.env` 中这些路径改成本机 test-network 生成的证书路径：

- `FABRIC_TLS_CERT_PATH`
- `FABRIC_SIGN_CERT_PATH`
- `FABRIC_PRIVATE_KEY_PATH`

然后设置：

```text
LEDGER_MODE=fabric
FABRIC_CHANNEL_NAME=uav-blackbox
FABRIC_CHAINCODE_NAME=uavblackbox
```

启动 API：

```powershell
npm run start:api
```

## 4. 合约调用命名

Fabric Gateway 调用多合约链码时需要指定合约名：

```text
UAVIdentityContract:RegisterUAV
MissionLogContract:CreateMission
MissionLogContract:RecordLogAnchor
EvidenceContract:CreateEvidencePackage
AccessControlContract:RecordAccessAudit
EmergencyLinkageContract:CreateEmergencyRequest
```

API 网关已经封装了这些调用，业务侧不需要直接拼交易名。

