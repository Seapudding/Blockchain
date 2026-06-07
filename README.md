# 链航黑匣：无人机可信飞行日志与事故追溯平台

本仓库根据 `链航黑匣_无人机可信飞行日志与事故追溯平台.md` 启动 Fabric 区块链开发，核心目标是：

> 无人机负责执行任务，平台负责记录过程，区块链负责保证证据可信，外部接口负责支撑多部门协同。

## 当前已搭建内容

- `chaincode/uav-blackbox`：Hyperledger Fabric Node.js 链码，包含 5 个核心合约。
- `apps/api`：API 网关骨架，支持 Fabric Gateway 模式和本地 mock 账本模式。
- `infra/fabric`：Fabric test-network 部署说明与连接配置模板。
- `scripts/demo-flight.js`：一次完整“注册无人机 -> 任务备案 -> 日志存证 -> 异常事件 -> 证据包 -> 外部审计”的演示脚本。
- `docs/development-roadmap.md`：后续开发任务拆分。

## 合约模块

| 合约 | 说明 |
| --- | --- |
| `UAVIdentityContract` | 无人机链上身份注册、状态维护、身份哈希验证 |
| `MissionLogContract` | 飞行任务备案、日志哈希存证、异常事件存证 |
| `EvidenceContract` | 事故证据包存证、哈希验证、辅助分析报告挂接 |
| `AccessControlContract` | 外部系统授权、访问审计上链 |
| `EmergencyLinkageContract` | 公安/消防/应急任务请求与处理记录 |

## 本地 API 演示

默认使用 mock 账本，便于先跑通业务流程。

```powershell
npm install
npm run start:api
```

另开一个终端运行：

```powershell
npm run demo
```

API 默认地址：`http://localhost:3000/api/v1`

## 接入 Fabric test-network

1. 准备 Fabric samples，并启动 test-network。
2. 部署链码：

```powershell
.\scripts\fabric-test-network.ps1 -FabricSamplesPath C:\path\to\fabric-samples
```

3. 复制 `apps/api/.env.example` 为 `apps/api/.env`，把证书、私钥、peer、channel、chaincode 等路径改成本机 test-network 生成路径。
4. 将 `LEDGER_MODE=fabric` 后启动 API。

详细说明见 [infra/fabric/README.md](./infra/fabric/README.md)。

