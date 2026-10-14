# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.4](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/compare/2.0.3...2.0.4)

### Commits

- Drop the overrides field, which n8n's community package scan refuses [`4dfaf8b`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/4dfaf8b9a751445d2414e69a6cd7da142c9ec71f)

## [2.0.3](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/compare/2.0.2...2.0.3) - 2026-10-14

### Commits

- Add the node's codex file [`bd1007e`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/bd1007eef4abede1a9946890a899eff8415c9908)
- Release 2.0.3 [`5064d39`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/5064d393fc0ab674493f3f71aa9d93411d5d3215)
- Point the documentation links at the user guide on help.itsmcloud.lt [`5a69491`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/5a694914ba382dbad1d8084198ed2ffea08a4666)

## [2.0.2](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/compare/2.0.1...2.0.2) - 2026-10-14

### Commits

- Release 2.0.2 [`0cf1308`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/0cf1308810860dc4ec379bb2a8cd1e14059c0b6e)
- Name SYNERGY as the package author, with the support address [`6c652f8`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/6c652f8006eb31becefb754bfdd7c581f0c09dba)

## [2.0.1](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/compare/2.0.0...2.0.1) - 2026-10-14

### Commits

- Bump version from 2.0.0 to 2.0.1 [`961bfb6`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/961bfb66d3f56253de8aff8d2f6ee318cb0ebaeb)

## 2.0.0 - 2026-10-14

### Commits

- Initial commit: n8n node for SYNERGY Management Gateway for Active Directory (2.0.0) [`43b5cde`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/43b5cde0122a9e16f45154182dfb685000a4541a)
- Rename the transport to synergyManagementGatewayApiRequest [`f923df7`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/f923df74c402962976981dc64bc30c7ad8a1a3cb)
- Move to the @synergyconsulting scope, drop the Visual Studio project, rewrite the README for 2.0.0 [`6898d93`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/6898d938944e1722978868316d94128b202458b9)
- Keep a CHANGELOG.md, written by every release; add README badges [`b478c3c`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/b478c3c01410a01cb70cda5f6d02b4a600a36c2a)
- Add CI and npm publish workflows [`f53407b`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/f53407bc855fed69503ac2e9a78222ccbe1d9594)
- Add the MIT licence file [`6f9ea0b`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/6f9ea0b06096de5bab6ba46dc6b5c15bb33b9df1)
- Say on the credential that the node needs a SYNERGY Management Gateway installation [`16d92d5`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/16d92d59c0cf307d6f92b60cfbd9744cdf656c8f)
- Update the changelog for 2.0.0 [`93ec8fe`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/93ec8fe59c7b376580ca0d57d9b9d16d87699028)
- Write SYNERGY in capitals in the credential notice [`e697149`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/e697149e2bae7ed98acdce832e4946673896a77e)
- Write SYNERGY in capitals in the licence [`3d4a54e`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/3d4a54e69e1956dc01f0cd13211c8552d1c17c12)

<!-- auto-changelog-above -->
<!-- Everything above this line is regenerated from the commits by `npm run release`; write notes by hand below it. -->

## 2.0.0 — upgrade notes

### Upgrading from 1.x

Version 2.0.0 renamed the node and the credential to meet n8n's rules for verified community nodes, and moved the
package from the `@syn-con` scope to `@synergyconsulting`. n8n finds nodes and credentials by these IDs, so **nothing
saved with 1.x carries over by itself**:

| | 1.x | 2.0 |
|---|---|---|
| Package | `@syn-con/n8n-nodes-synergy-management-gateway` | `@synergyconsulting/n8n-nodes-synergy-management-gateway` |
| Node type | `activeDirectory` | `synergyManagementGateway` |
| Credential type | `activeDirectoryApiKey` | `synergyManagementGatewayApi` |

1. Uninstall the 1.x package, then install this one. Never have both installed.
2. Create a **SYNERGY Management Gateway for Active Directory API** credential with the same API URL, Client ID and
   API key (the fields have not changed).
3. In each workflow, replace every old node with **SYNERGY Management Gateway for Active Directory** and select the
   new credential. Or export the workflow, replace `@syn-con/n8n-nodes-synergy-management-gateway.activeDirectory`
   with `@synergyconsulting/n8n-nodes-synergy-management-gateway.synergyManagementGateway` and
   `activeDirectoryApiKey` with `synergyManagementGatewayApi`, import it again and pick the credential on each node.

### Moving from the Directory Access Platform package

Up to version 1.1.0 the node was published as `@syn-con/n8n-nodes-synergy-directory-access-platform`. That package
is deprecated but keeps working. To move, uninstall it first, install this one, and follow *Upgrading from 1.x* above — its
node and credential IDs are the 1.x ones.

## 1.x and earlier

Versions up to 1.x were developed inside the SYNERGY Management Gateway repository and published under the `@syn-con`
scope; their history is not part of this repository.
