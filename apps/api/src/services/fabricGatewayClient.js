'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function decodeResult(result) {
  if (!result || result.length === 0) {
    return null;
  }

  const text = Buffer.isBuffer(result) ? result.toString('utf8') : String(result);
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function readPemFile(fileOrDir) {
  const stat = fs.statSync(fileOrDir);
  if (!stat.isDirectory()) {
    return fs.readFileSync(fileOrDir);
  }

  const files = fs.readdirSync(fileOrDir).filter((name) => !name.startsWith('.'));
  if (files.length === 0) {
    throw new Error(`No PEM file found in ${fileOrDir}`);
  }

  return fs.readFileSync(path.join(fileOrDir, files[0]));
}

class FabricGatewayClient {
  constructor(config, gateway, grpcClient) {
    this.config = config;
    this.gateway = gateway;
    this.grpcClient = grpcClient;
    this.network = gateway.getNetwork(config.channelName);
  }

  static async create(config) {
    const grpc = require('@grpc/grpc-js');
    const { connect, signers } = require('@hyperledger/fabric-gateway');

    for (const [name, value] of Object.entries({
      tlsCertPath: config.tlsCertPath,
      signCertPath: config.signCertPath,
      privateKeyPath: config.privateKeyPath
    })) {
      if (!value) {
        throw new Error(`Missing Fabric config: ${name}`);
      }
    }

    const tlsRootCert = fs.readFileSync(config.tlsCertPath);
    const grpcClient = new grpc.Client(
      config.peerEndpoint,
      grpc.credentials.createSsl(tlsRootCert),
      { 'grpc.ssl_target_name_override': config.peerHostAlias }
    );

    const identity = {
      mspId: config.mspId,
      credentials: readPemFile(config.signCertPath)
    };

    const privateKeyPem = readPemFile(config.privateKeyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const signer = signers.newPrivateKeySigner(privateKey);

    const gateway = connect({
      client: grpcClient,
      identity,
      signer
    });

    return new FabricGatewayClient(config, gateway, grpcClient);
  }

  getContract(contractName) {
    return this.network.getContract(this.config.chaincodeName, contractName);
  }

  async evaluate(contractName, transactionName, ...args) {
    const result = await this.getContract(contractName).evaluateTransaction(transactionName, ...args);
    return decodeResult(result);
  }

  async submit(contractName, transactionName, ...args) {
    const result = await this.getContract(contractName).submitTransaction(transactionName, ...args);
    return decodeResult(result);
  }

  close() {
    this.gateway.close();
    this.grpcClient.close();
  }
}

module.exports = {
  FabricGatewayClient
};
