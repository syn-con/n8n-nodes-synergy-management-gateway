import {
	NodeOperationError,
	type ILoadOptionsFunctions,
	type INodeListSearchItems,
	type INodeListSearchResult,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../transport/synergyManagementGatewayApiRequest';

interface PartitionRoot {
	distinguishedName: string;
	partition: string;
}

interface DirectoryNode {
	distinguishedName: string;
	name: string;
	objectClass?: string | null;
	mayHaveChildren: boolean;
}

interface ChildrenPage {
	nodes: DirectoryNode[];
	continuationToken?: string | null;
}

/** A container still to be expanded: its DN, the path shown for it, and where its listing stopped. */
interface Pending {
	d: string;
	p: string;
	c?: string;
}

/** What n8n hands back as the pagination token: the containers not yet expanded, in walk order. */
interface WalkState {
	q: Pending[];
}

/** Results per call; n8n asks for the next batch as the list is scrolled. */
const BATCH = 50;
/** Directory reads per call, so one scroll never stalls on a very wide OU full of accounts. */
const MAX_REQUESTS = 15;
/** The children endpoint's own cap; containers are mixed in with accounts, so read wide. */
const PAGE_SIZE = 500;

/** `DC=example,DC=com` → `example.com`; anything else is shown as given. */
export function domainLabel(dn: string): string {
	const parts = dn.split(',').map((p) => p.trim());
	if (parts.length > 0 && parts.every((p) => /^dc=/i.test(p))) {
		return parts.map((p) => p.slice(3)).join('.');
	}
	return dn;
}

function encodeState(state: WalkState): string | undefined {
	return state.q.length > 0 ? JSON.stringify(state) : undefined;
}

function decodeState(token: string): WalkState {
	try {
		const parsed = JSON.parse(token) as WalkState;
		if (parsed && Array.isArray(parsed.q)) return parsed;
	} catch {
		// fall through: a token we did not write starts the walk again
	}
	return { q: [] };
}

/**
 * Lists the directory's containers for the "Base DN" resource locator by walking the tree breadth-first
 * through the browser API (`/ad/browser/roots`, `/ad/browser/children`) — domain partition only, since
 * accounts are never searched for under Configuration.
 *
 * Each call returns about one batch and hands the unexpanded part of the walk back as the pagination token, so
 * a large directory is read only as far as the person scrolls. Rows are shown as a path from the domain
 * (`example.com/Staff/Sales`) and the typed filter matches that path or the DN, case-insensitively.
 */
export async function searchContainers(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const needle = (filter ?? '').trim().toLowerCase();
	const matches = (item: Pending) =>
		!needle || item.p.toLowerCase().includes(needle) || item.d.toLowerCase().includes(needle);

	const results: INodeListSearchItems[] = [];
	const add = (item: Pending) => {
		if (matches(item)) results.push({ name: item.p, value: item.d });
	};

	let state: WalkState;
	try {
		if (paginationToken) {
			state = decodeState(paginationToken);
		} else {
			const roots = (await synergyManagementGatewayApiRequest.call(
				this,
				'GET',
				'/ad/browser/roots',
				undefined,
				undefined,
			)) as PartitionRoot[];
			const domains = (roots ?? []).filter((r) => r.partition === 'Domain');
			state = { q: domains.map((r) => ({ d: r.distinguishedName, p: domainLabel(r.distinguishedName) })) };
			state.q.forEach(add);
		}

		let requests = 0;
		while (state.q.length > 0 && results.length < BATCH && requests < MAX_REQUESTS) {
			const head = state.q[0];
			const qs: Record<string, string | number> = { dn: head.d, pageSize: PAGE_SIZE };
			if (head.c) qs.continuationToken = head.c;

			const page = (await synergyManagementGatewayApiRequest.call(
				this,
				'GET',
				'/ad/browser/children',
				qs,
				undefined,
			)) as ChildrenPage;
			requests++;

			for (const node of page?.nodes ?? []) {
				if (!node.mayHaveChildren) continue;
				const child: Pending = { d: node.distinguishedName, p: `${head.p}/${node.name}` };
				add(child);
				state.q.push(child);
			}

			if (page?.continuationToken) {
				head.c = page.continuationToken;
			} else {
				state.q.shift();
			}
		}
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, {
			message: 'Could not read the directory tree',
			description:
				'Listing containers needs the API key to read the directory and the Directory Browser licence. ' +
				'Switch the field to "By DN" to type the distinguished name instead.',
		});
	}

	return { results, paginationToken: encodeState(state) };
}
