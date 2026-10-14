
import type { AllEntities } from 'n8n-workflow';


type NodeMap = {
    object : 'create' | 'getAll' | 'getById' | 'deleteById' | 'update' | 'move' | 'rename' | 'runSavedSearch' | 'searchBySavedSearch',
    user: 'getAll' | 'create' | 'update' | 'getById' | 'getGroups' | 'getAuthorizationGroups' | 'deleteById' | 'enable' | 'disable' | 'unlock' | 'searchByState' | 'setAccountExpiration' | 'resetPassword' | 'changePassword' | 'assignGroup' | 'unassignGroup' | 'assignGroups' | 'unassignGroups' | 'clearGroups',
    group: 'getAll' | 'create' | 'update' | 'getById' | 'deleteById' | 'assignMember' | 'assignMembers' | 'unassignMember' | 'unassignMembers' | 'clearMembers' | 'getMembers',
    computer: 'getAll' | 'create' | 'update' | 'getById' | 'deleteById' | 'enable' | 'disable' | 'resetPassword',
    organizationalUnit: 'getAll' | 'create' | 'update' | 'getById' | 'deleteById' | 'previewAccountState' | 'enableAccounts' | 'disableAccounts',
    directoryContext: 'getDirectoryContext' | 'getDomain' | 'getForest' | 'getRootDse' | 'getDomainControllers' | 'getTrusts' | 'getSites' | 'getSubnets' | 'getSiteLinks' | 'getOptionalFeatures' | 'getKdsRootKeys',
    operation: 'getWaiting' | 'getById' | 'waitForApproval',
    security: 'getAcl' | 'listDelegationTemplates' | 'getDelegations' | 'applyDelegation' | 'revokeDelegation' | 'setDeletionProtection' | 'getSpns' | 'setSpns',
    serviceAccount: 'getAll' | 'getById' | 'create' | 'update' | 'deleteById' | 'getKdsReadiness' | 'getPasswordRetrievalPrincipals' | 'setPasswordRetrievalPrincipals' | 'getComputerServiceAccounts' | 'setComputerLink'
}

export type ActiveDirectoryNodeType =  AllEntities<NodeMap>;;
