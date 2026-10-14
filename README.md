# @syn-con/n8n-nodes-synergy-management-gateway

An [n8n](https://n8n.io) community node for managing **Active Directory** through the
**SYNERGY Management Gateway for Active Directory** REST API — create/read/update/delete users, groups, computers, organizational
units and generic objects, manage group membership, and run saved LDAP searches.

The node talks to your own SYNERGY Management Gateway installation using an API key.

## Installation

### Via the n8n UI (self-hosted)

Settings → **Community Nodes** → **Install** → enter `@syn-con/n8n-nodes-synergy-management-gateway`.

### Upgrading from 1.x to 2.0

Version 2.0.0 renames the node and the credential to meet n8n's naming rules for verified community nodes.
n8n finds a node and a credential by these ids, so **nothing saved with 1.x carries over by itself**:

| | 1.x | 2.0 |
|---|---|---|
| Node type | `activeDirectory` | `synergyManagementGateway` |
| Credential type | `activeDirectoryApiKey` | `synergyManagementGatewayApi` |

After upgrading:

1. Create a **SYNERGY Management Gateway for Active Directory API** credential with the same API URL, Client ID
   and API key as before (the fields are unchanged).
2. In each workflow, replace every node of the old type with **SYNERGY Management Gateway for Active Directory**
   and select the new credential. Alternatively, export the workflow and replace
   `@syn-con/n8n-nodes-synergy-management-gateway.activeDirectory` with
   `@syn-con/n8n-nodes-synergy-management-gateway.synergyManagementGateway` and `activeDirectoryApiKey` with
   `synergyManagementGatewayApi`, then import it again and pick the credential on each node.

To stay on 1.x until the workflows are ready, install the package as
`@syn-con/n8n-nodes-synergy-management-gateway@1`.

### Moving from the pre-rename package

Until version 1.1.0 this node was published as `@syn-con/n8n-nodes-synergy-directory-access-platform`. That
package is deprecated but keeps working: nothing changes for an installation that leaves it in place.

To move to this package, **uninstall the old package first**, install this one, and then follow
*Upgrading from 1.x to 2.0* above: the old package's node and credential ids are the 1.x ones.

### Via Docker

Build an image that bundles the node into n8n (see the included `Dockerfile`):

```bash
npm install
npm run build
docker build --build-arg N8N_VERSION=<your-n8n-version> -t n8n-with-ad .
```

## Credentials

Create a **SYNERGY Management Gateway for Active Directory API** credential with:

| Field | Notes |
|---|---|
| **API URL** | Base URL of the API **including the `/api` prefix**, e.g. `https://ad-api.example.com/api`. **Must** be `https://` — plaintext `http://` is rejected so the API key can't be intercepted. |
| **Client ID** | The client id of an API-key → AD-connection *binding*. This selects which Active Directory the operations run against (sent as the `X-Client-Id` header). |
| **API Key** | The API key issued by the SYNERGY Management Gateway. Sent as the `X-API-Key` header. |
| **Ignore SSL Errors** | **INSECURE.** Disables TLS certificate validation. Use only against a trusted local dev server, never in production. |

> **Common setup mistake:** leaving `/api` off the URL. The node calls paths like `/ad/users` and
> `/saved-ldap-filters`, which resolve to `https://host/api/ad/users` only when the base URL ends
> in `/api`.

The credential **Test** button calls `GET /metadata`, which needs only a valid authenticated
identity — it verifies the key without requiring any specific permission.

### Permissions & bindings

- The API key's role must hold the relevant permissions (`ADUsers.*`, `ADGroups.*`,
  `ADComputers.*`, `ADOrganizationUnits.*`, `ADObjects.*`, `SavedLdapFilters.*`).
- AD operations require the **Client ID** to resolve to a binding that belongs to your key; without
  a valid binding the API returns 400/403.

## Resources & operations

| Resource | Operations |
|---|---|
| **User** | Get Many, Get By ID, Create, Update, Delete, Enable, Disable, Reset Password, Get Groups, Assign Group, Assign Groups, Unassign Group, Unassign Groups, Clear Groups |
| **Group** | Get Many, Get By ID, Create, Update, Delete, Assign Member, Assign Members, Unassign Member, Unassign Members, Clear Members |
| **Computer** | Get Many, Get By ID, Create, Update, Delete, Enable, Disable, Reset Password |
| **Organizational Unit** | Get Many, Get By ID, Create, Update, Delete, Preview Account Enable/Disable, Enable Accounts, Disable Accounts |
| **Object** (generic) | Get Many, Get By ID, Create, Update, Move, Rename, Delete, Run Saved Search, Search by Saved Search |
| **Operation** | Get Waiting, Get By ID, Wait for Approval |

### Notes

- **List operations require a Base DN.** `Get Many` on users/groups/computers/OUs and the generic
  Object search need a Base DN (search root); the API rejects an empty one.
- **Pagination.** List operations page with a continuation token; use **Return All** to fetch every
  match, or set a **Limit**.
- **Attribute updates.** Update operations support Replace / Add / Remove / Clear semantics against
  LDAP attributes. Attribute names are validated against the AD schema (loaded from the API).
  Values are checked against each attribute's type: `Bool` takes a boolean (or `true`/`false`),
  `GeneralizedTime` a date (an ISO string, `$now`, or Active Directory's own `yyyyMMddHHmmss.0Z`),
  converted to UTC for you. A multi-valued attribute (`[…[]]`) takes an array or one value per line;
  a single line is one value, never split on commas.
- **Saved searches.** *Run Saved Search* executes a saved LDAP filter; for "All"-type filters (or
  filters without a base DN) it delegates to the server-side results endpoint automatically.
- **Enabling or disabling every account in an OU.** *Preview Account Enable/Disable* lists what a run
  would change — `toChange`, `alreadyInState`, `excluded` (each with a `reasonCode` and `reason`) and
  `exceedsLimit` — without changing anything. *Enable Accounts* / *Disable Accounts* then apply it.
  Both take **Account Kinds** (Users, Computers or All) and **Scope** (Only This OU, or Include Sub-OUs).
  - At most **100** accounts change in one run. A larger selection is refused whole
    (`OrganizationUnitAccounts.TooMany`), never split — narrow the kinds or the scope, or preview first
    and check `exceedsLimit`.
  - **A run is not transactional.** When some accounts fail, the API answers `207 Multi-Status`; the
    node does not treat that as an error, because the other accounts *did* change, and does not report
    it as success either. The item is the API's `{ plan, batch }` body with the counters lifted to the
    top: `success` (true only when nothing failed), `partialFailure`, `total`, `succeeded` and
    `failed`. Branch on `{{ $json.partialFailure }}`, and read `batch.items` for the per-account
    outcome. Turn on **Fail on Partial Failure** to fail the item instead. `batch` is absent when
    nothing needed changing (a success with zero counts).
  - The platform treats this as a security change, so a **Guarded** key is normally answered with
    `202` and the run waits for a person — handled by **On Approval Required** like every other write.
- **Your API key has a supervision level, and it decides what waits.** Approval is a control on
  machine credentials, not on operations: a person is never queued, and this node always calls as an
  API key. Every key carries one of three levels, set on its edit form in the web console.

  | Level | The key waits for a person before |
  |---|---|
  | Unsupervised | nothing it does on its own account |
  | **Guarded** (the default, including for keys created before this existed) | deleting anything, and any change to ACLs, delegations, SPNs, password policies or a privileged attribute |
  | Supervised | every change it makes |

  Two things ask at **every** level, whatever the key's own: a change to an object Active Directory
  protects (`adminCount=1` — the members of Domain Admins and the other protected groups, and those
  groups themselves), and an operation an administrator has pinned "always ask agents".

  So an integration that must run unattended — an overnight leavers job, a joiners workflow that
  deletes stale accounts — needs its key raised to **Unsupervised**, which only someone who can
  approve operations may do. Raising it does not let the key touch a protected account unasked;
  nothing does, and a password change to one is refused outright rather than queued, because a queued
  request would have to store the password in the clear.

  Two more things ask whatever the key's level, and both are worth knowing before a bulk workflow
  surprises you:

  - **Protected containers.** An administrator can put an OU out of an agent's unsupervised reach on the
    connection screen. Anything your workflow writes inside one — or *into* one, which catches a create
    or a move — waits for a person.
  - **The volume brake.** More than twenty destructive changes in an hour from one key and *everything*
    that key does starts waiting, not only the deletes, until the hour rolls. Nothing already done is
    undone. A leavers run that removes more than twenty accounts will hit this: either approve the queued
    requests, or raise the threshold in the server's configuration
    (`AgentSupervision:Volume:Threshold`).

  The `202` body now carries `reason` (`ProtectedTarget`, `Pinned`, `Volume` or `Level`) and
  `reasonDetail` alongside the operation id, so a workflow can branch on *why* it is waiting — `Volume`
  in particular means "wait and retry", where `ProtectedTarget` means "a person has to look at this".
  Existing workflows need no change: the node ignores fields it does not know.

- **Approval-gated writes: getting the created object.** When a policy requires approval, the API
  answers `202` with an operation id instead of the object — the object does not exist yet, so the
  write operation cannot return it. Set the node option **On Approval Required** to *Continue and
  Output Operation ID*, then follow it with the **Operation** resource:

  ```
  [AD: Create User]        → { approvalRequired: true, operationId: "…" }
  [AD: Operation → Wait for Approval]   (or Get By ID, to poll it yourself)
      → { status: "Success", result: { entityId, distinguishedName, objectClass, action } }
  [next node]              → {{ $json.result.entityId }}
  ```

  `result` is the affected object — for a create, the `entityId` is the new object's `objectGUID`.
  It is `null` while the operation is still `WaitingToApprove`, and for operations that never
  reached the directory (rejected, blocked by policy, failed early), so `result` being present is
  itself the "it happened, here is what it produced" signal. The same block is on every row of the
  operations log, not just approval-gated ones.

  **Wait for Approval** also ends when the request's approval window closes (`expiresAt`, 72 hours by
  default): approvers no longer see an expired request, so nobody can decide it. It then emits
  `status: "Expired"`, `expired: true`, `approved: false` — or fails the item, with *Fail on
  Rejection* on — so the workflow can resubmit rather than wait. A timeout of `0` means "until the
  request expires"; no wait ever runs longer than 7 days.

## Development

```bash
npm install
npm run dev      # watch + run inside a local n8n
npm run lint     # lint (self-hosted ruleset)
npm run build    # compile to dist/
npm test         # vitest
```

## License

[MIT](LICENSE)
