import type { INodeProperties } from 'n8n-workflow';

import * as getDirectoryContext from './getDirectoryContext.operation';
import * as getDomain from './getDomain.operation';
import * as getForest from './getForest.operation';
import * as getRootDse from './getRootDse.operation';
import * as getDomainControllers from './getDomainControllers.operation';
import * as getTrusts from './getTrusts.operation';
import * as getSites from './getSites.operation';
import * as getSubnets from './getSubnets.operation';
import * as getSiteLinks from './getSiteLinks.operation';
import * as getOptionalFeatures from './getOptionalFeatures.operation';
import * as getKdsRootKeys from './getKdsRootKeys.operation';

export {
	getDirectoryContext,
	getDomain,
	getForest,
	getRootDse,
	getDomainControllers,
	getTrusts,
	getSites,
	getSubnets,
	getSiteLinks,
	getOptionalFeatures,
	getKdsRootKeys,
};

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['directoryContext'],
			},
		},
		options: [
			{
				name: 'Get Directory Context',
				value: 'getDirectoryContext',
				action: 'Get the full directory context',
				description:
					'Get the RootDSE, domain, forest, domain controllers, trusts, sites and optional features in one call',
			},
			{
				name: 'Get Domain',
				value: 'getDomain',
				action: 'Get the domain',
				description:
					'Get the domain, including the base DN and default container DNs that other operations need',
			},
			{
				name: 'Get Domain Controllers',
				value: 'getDomainControllers',
				action: 'Get many domain controllers',
				description: 'Get the domain controllers with their site, roles and global catalog flag',
			},
			{
				name: 'Get Forest',
				value: 'getForest',
				action: 'Get the forest',
				description: 'Get the forest, its domains, functional level and UPN suffixes',
			},
			{
				name: 'Get KDS Root Keys',
				value: 'getKdsRootKeys',
				action: 'Get many KDS root keys',
				description: 'Get the KDS root keys required before a group managed service account can be created',
			},
			{
				name: 'Get Optional Features',
				value: 'getOptionalFeatures',
				action: 'Get many optional features',
				description: 'Get the optional features and whether each is enabled, such as the AD Recycle Bin',
			},
			{
				name: 'Get Root DSE',
				value: 'getRootDse',
				action: 'Get the root DSE',
				description: 'Get the RootDSE, including the configuration and schema naming context DNs',
			},
			{
				name: 'Get Site Links',
				value: 'getSiteLinks',
				action: 'Get many site links',
				description: 'Get the replication site links with their cost and interval',
			},
			{
				name: 'Get Sites',
				value: 'getSites',
				action: 'Get many sites',
				description: 'Get the replication sites with their subnets and domain controllers',
			},
			{
				name: 'Get Subnets',
				value: 'getSubnets',
				action: 'Get many subnets',
				description: 'Get the replication subnets and the site each maps to',
			},
			{
				name: 'Get Trusts',
				value: 'getTrusts',
				action: 'Get many trusts',
				description: 'Get the domain trusts with their direction, type and SID filtering state',
			},
		],
		default: 'getDirectoryContext',
		required: true,
	},
	...getDirectoryContext.description,
	...getDomain.description,
	...getForest.description,
	...getRootDse.description,
	...getDomainControllers.description,
	...getTrusts.description,
	...getSites.description,
	...getSubnets.description,
	...getSiteLinks.description,
	...getOptionalFeatures.description,
	...getKdsRootKeys.description,
];
