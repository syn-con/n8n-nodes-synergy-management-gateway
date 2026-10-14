import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

export function getAccountPolicyFromParams(
    context: IExecuteFunctions,
    itemIndex: number,
    paramName = 'accountPolicy',
): IDataObject | undefined {
    const raw = context.getNodeParameter(paramName, itemIndex, {}) as IDataObject;

    if (!raw || Object.keys(raw).length === 0) {
        return undefined;
    }

    const policy: IDataObject = {};

    const flags: Array<keyof typeof raw> = [
        'enabled',
        'passwordNeverExpires',
        'smartcardLogonRequired',
        'trustedForDelegation',
        'accountNotDelegated',
        'passwordNotRequired',
        'cannotChangePassword',
        'allowReversiblePasswordEncryption',
        'changePasswordAtLogon',
        'compoundIdentitySupported',
    ];

    for (const flag of flags) {
        if (raw[flag] !== undefined && raw[flag] !== null) {
            policy[flag] = raw[flag];
        }
    }

    return Object.keys(policy).length > 0 ? policy : undefined;
}
