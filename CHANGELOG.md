# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.0

### Commits

- Initial commit: n8n node for SYNERGY Management Gateway for Active Directory (2.0.0) [`43b5cde`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/43b5cde0122a9e16f45154182dfb685000a4541a)
- Rename the transport to synergyManagementGatewayApiRequest [`f923df7`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/f923df74c402962976981dc64bc30c7ad8a1a3cb)
- Move to the @synergyconsulting scope, drop the Visual Studio project, rewrite the README for 2.0.0 [`6898d93`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/6898d938944e1722978868316d94128b202458b9)
- Add CI and npm publish workflows [`f53407b`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/f53407bc855fed69503ac2e9a78222ccbe1d9594)
- Add the MIT licence file [`6f9ea0b`](https://github.com/syn-con/n8n-nodes-synergy-management-gateway/commit/6f9ea0b06096de5bab6ba46dc6b5c15bb33b9df1)

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
