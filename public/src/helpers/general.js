"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isV3Vault = isV3Vault;
function isV3Vault(vault) {
    const versionMajor = vault.apiVersion?.split('.')[0];
    return versionMajor === '3' || versionMajor === '~3';
}
