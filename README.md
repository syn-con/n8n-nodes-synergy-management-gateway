# @synergyconsulting/n8n-nodes-synergy-management-gateway

An [n8n](https://n8n.io) community node for **SYNERGY Management Gateway for Active Directory**. It manages Active
Directory through your own SYNERGY Management Gateway installation, using an API key: users, groups, computers,
organizational units, generic directory objects, managed service accounts, delegations and service principal names,
plus read-only views of the forest, domain and sites.

Every change runs through the gateway, so its permissions, attribute policies, approval rules and audit log apply to
a workflow exactly as they do to a person in the web console.

The node can also be used as a tool by an n8n AI agent (`usableAsTool`). It then acts with the same API key as any
workflow, and the gateway supervises it the same way.

## Installation

### In n8n (self-hosted)

Go to **Settings → Community Nodes → Install** and enter
`@synergyconsulting/n8n-nodes-synergy-management-gateway`.

### Docker

The included `Dockerfile` builds an n8n image with the node bundled:

```bash
npm install
npm run build
docker build --build-arg N8N_VERSION=<your-n8n-version> -t n8n-with-synergy-management-gateway .
```

Pin `N8N_VERSION` to the n8n version you run in production.

## Credentials

Create a **SYNERGY Management Gateway for Active Directory API** credential:

| Field | What to enter |
|---|---|
| **API URL** | The API's base URL, **including `/api`** — for example `https://gateway.example.com/api`. It must start with `https://`; the credential refuses `http://` so the API key never travels unencrypted. |
| **Client ID** | The client ID of one of your API key's directory bindings. It selects which Active Directory the node works in (sent as `X-Client-Id`). |
| **API Key** | An API key issued in the gateway's web console (sent as `X-API-Key`). |
| **Ignore SSL Errors** | Turns off certificate checking. **Insecure** — only for a test server with a self-signed certificate, never in production. |

The most common mistake is leaving `/api` off the URL: the node calls paths such as `/ad/users`, which only resolve
to `https://gateway.example.com/api/ad/users` when the base URL ends in `/api`.

**Test** calls `GET /metadata`, which any valid key may read, so a green test proves the URL and the key — not that
the key may do what your workflow asks.

### What the key may do

- **Permissions.** The key can do what its role allows, and never more than its owner can do at that moment. Each
  operation needs the matching gateway permission — for example `ad:users:list` to list users, `ad:users:create` to
  create one. Saved searches need `savedfilters:execute`; *Get Waiting* needs `operations:waiting:list`. ACL,
  delegation and SPN changes have permissions of their own, which ordinary administrative roles do not include.
- **Directory.** The Client ID must name a binding of this key, to a directory the key's owner can still reach;
  otherwise the API answers `403`.

## Resources and operations

| Resource | Operations |
|---|---|
| **User** | Get Many, Get By ID, Search by State, Create, Update, Delete By ID, Enable, Disable, Unlock, Reset Password, Change Password, Set Account Expiration, Get Groups, Get Authorization Groups, Assign Group, Assign Groups, Unassign Group, Unassign Groups, Clear Groups |
| **Group** | Get Many, Get By ID, Get Members, Create, Update, Delete By ID, Assign Member, Assign Members, Unassign Member, Unassign Members, Clear Members |
| **Computer** | Get Many, Get By ID, Create, Update, Delete By ID, Enable, Disable, Reset Password |
| **Organizational Unit** | Get Many, Get By ID, Create, Update, Delete By ID, Preview Account Enable/Disable, Enable Accounts, Disable Accounts |
| **Object** (any class) | Get Many, Get By ID, Create, Update, Move, Rename, Delete By ID, Run Saved Search, Search by Saved Search |
| **Service Account** | Get Many, Get, Create, Update, Delete, Get Many Computer Service Accounts, Set Computer Link, Get Many Password Retrieval Principals, Set Password Retrieval Principals, Get KDS Readiness |
| **Security** | Get ACL, Get Many Delegation Templates, Get Many Delegations, Apply Delegation, Revoke Delegation, Set Deletion Protection, Get Service Principal Names, Set Service Principal Names |
| **Directory Context** (read-only) | Get Directory Context, Get Forest, Get Domain, Get Domain Controllers, Get Root DSE, Get Sites, Get Site Links, Get Subnets, Get Trusts, Get Optional Features, Get KDS Root Keys |
| **Operation** | Get Waiting, Get By ID, Wait for Approval |

### Reading

- **Lists need a Base DN.** *Get Many* on users, groups, computers and organizational units, and the generic object
  search, need a search root; the API refuses an empty one.
- **Paging.** Turn on **Return All** to fetch every match, or set a **Limit**.
- **Saved searches.** Both operations run a search saved in the gateway, picked from a list. *Search by Saved
  Search* always runs it on the server. *Run Saved Search* runs it through the typed list for the filter's object
  class and base DN, and falls back to the server when the filter has neither.
- **Search by State** finds users by account state — disabled, enabled, expired, inactive (for a number of days),
  locked out, password expired, password must change, password never expires, password not required — optionally
  under a base DN and narrowed by an LDAP filter.
- **Attributes the gateway blocks** are left out of every result, and a filter that names one is refused.

### Writing

- **Attribute updates** use Replace, Add, Remove and Clear. Attribute names are checked against the directory schema,
  which the node loads from the API, and values against each attribute's type: a `Bool` takes a boolean (or
  `true`/`false`); a `GeneralizedTime` takes a date — an ISO string, `$now`, or Active Directory's own
  `yyyyMMddHHmmss.0Z` — converted to UTC for you. A multi-valued attribute takes an array, or one value per line; a
  single line is one value, never split on commas.
- **Read-only attributes.** An administrator can make an attribute read-only or blocked (for example the
  Exchange-managed ones). Writing one is refused with `403` and the error code `AD.Attributes.Protected`.
- **Change Password** needs the current password and only the user's own *change password* right; **Reset Password**
  is the administrative reset.
- **Unlock** is safe to repeat; `wasLocked` in the output says whether the account was locked.
- **Set Password Retrieval Principals** decides who can read a group managed service account's password — that hands
  out a usable credential, so treat it like granting access.
- **Set Service Principal Names** replaces the whole set; writing one makes the account a Kerberos service target.

### Enabling or disabling every account in an organizational unit

*Preview Account Enable/Disable* lists what a run would change — `toChange`, `alreadyInState`, `excluded` (each with
`reasonCode` and `reason`) and `exceedsLimit` — without changing anything. *Enable Accounts* and *Disable Accounts*
then apply it. All three take **Account Kinds** (Users, Computers or All) and **Scope** (Only This OU, or Include
Sub-OUs).

- At most **100** accounts change in one run. A larger selection is refused whole
  (`OrganizationUnitAccounts.TooMany`), never split — narrow the kinds or the scope, or preview first and check
  `exceedsLimit`.
- **A run is not all-or-nothing.** When some accounts fail, the API answers `207 Multi-Status`. The node does not
  treat that as an error — the other accounts *did* change — and does not report it as a success either: the item is
  the API's `{ plan, batch }` body with the counters lifted to the top, `success` (true only when nothing failed),
  `partialFailure`, `total`, `succeeded` and `failed`. Branch on `{{ $json.partialFailure }}`, and read
  `batch.items` for each account. Turn on **Fail on Partial Failure** to fail the item instead. `batch` is absent
  when nothing needed changing.

### Licence limits

If your gateway licence limits how many enabled user accounts it manages, creating or enabling a user at the limit —
and changing a user's group memberships once over it — is refused with `403` and `License.AccountLimitReached`.
Edits, password resets, disabling, moves and deletes always work.

## When a change waits for approval

Approval in SYNERGY Management Gateway applies to **machine credentials**, not to operations: a person is never
queued, and this node always calls with an API key. Each key has a **supervision level**, set on its edit form in the
web console:

| Level | The key waits for a person before |
|---|---|
| Unsupervised | nothing (apart from the cases below) |
| **Guarded** — the default | deleting anything, and any change to ACLs, delegations, SPNs, password policies or a privileged attribute |
| Supervised | every change |

Some changes wait **at every level**:

- a change to an object Active Directory protects (`adminCount=1` — members of Domain Admins and the other protected
  groups, and those groups themselves);
- a change inside, or into, a **protected container** an administrator has set on the directory connection — this
  catches creates and moves too;
- an operation an administrator has set to *always ask agents*;
- everything the key does once it has made more than **20 destructive changes in an hour** (the volume brake), until
  the hour rolls on. Nothing already done is undone. The threshold is the server setting
  `AgentSupervision:Volume:Threshold`.

An integration that must run unattended — an overnight leavers job, say — needs its key raised to **Unsupervised**,
which only someone who may approve operations can do. Even then it cannot change a protected account unasked, and a
password change to one is refused outright rather than queued: a queued request would have to store the password in
the clear.

### What the node does with a queued change

The API answers `202 Accepted` with an operation ID instead of the result. Set **Options → On Approval Required**:

- **Error** (default) — the item fails; the error carries the operation ID.
- **Continue and Output Operation ID** — the node emits `{ approvalRequired: true, operationId, … }` so the workflow
  can branch, or wait:

```
[Create User]                         → { approvalRequired: true, operationId: "…", reason: "Level" }
[Operation → Wait for Approval]       (or Get By ID, to poll yourself)
                                      → { status: "Success", result: { entityId, distinguishedName, objectClass, action } }
[next node]                           → {{ $json.result.entityId }}
```

- **`reason`** says why it is waiting — `Level`, `ProtectedTarget`, `Pinned` or `Volume` — with `reasonDetail` in
  words. `Volume` means "wait and try again later"; `ProtectedTarget` means a person has to look at it.
- **`result`** describes the object the operation produced; for a create, `entityId` is the new object's
  `objectGUID`. It is `null` until the operation has run, and stays `null` for one that never reached the directory
  (rejected, cancelled, refused, failed early) — so its presence is the "done, and here is what it made" signal.
- **Wait for Approval** polls every **Poll Interval** seconds until the operation is decided — run (`Success`),
  failed, rejected, or cancelled by the person who asked — or its request expires undecided (`expiresAt`, 72 hours
  by default). **Fail on Rejection** is on by default, so anything but `Success` fails the item with the reason.
  Turn it off to get an item instead, with `status` and `approved` to branch on; an expired request then comes out
  as `status: "Expired"`, `expired: true`, `approved: false`, so the workflow can resubmit. A **Timeout** of `0`
  waits until the request expires; no wait runs longer than 7 days.
- **Get Waiting** lists the requests still waiting for approval that were made as the key's owner — by this key, other
  keys of theirs, or their agents.

## Errors

With **Continue on Fail** on, a failed item becomes `{ error, errorCode, httpCode }` — `errorCode` is the gateway's own
code (for example `AD.Attributes.Protected`), so a workflow can branch on it. A queued change reported as an error
also carries `approvalRequired: true` and `operationId`, so the handle is never lost.

## Upgrading

### From 1.x

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

### From the Directory Access Platform package

Up to version 1.1.0 the node was published as `@syn-con/n8n-nodes-synergy-directory-access-platform`. That package
is deprecated but keeps working. To move, uninstall it first, install this one, and follow *From 1.x* above — its
node and credential IDs are the 1.x ones.

## Development

```bash
npm install
npm run dev      # build, watch, and run inside a local n8n
npm run lint     # n8n's community-node lint rules
npm run build    # compile to dist/
npm test         # unit tests (vitest)
```

## Licence

MIT
