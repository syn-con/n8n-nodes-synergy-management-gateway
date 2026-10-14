import type { INodeProperties } from 'n8n-workflow';

export const accountPolicyProperties: INodeProperties = {
    displayName: 'Account Policy',
    name: 'accountPolicy',
    type: 'collection',
    placeholder: 'Add Policy Flag',
    default: {},
    options: [
        {
            displayName: 'Account Not Delegated',
            name: 'accountNotDelegated',
            type: 'boolean',
            default: false,
        },
        {
            displayName: 'Allow Reversible Password Encryption',
            name: 'allowReversiblePasswordEncryption',
            type: 'boolean',
            default: false,
        },
        {
            displayName: 'Cannot Change Password',
            name: 'cannotChangePassword',
            type: 'boolean',
            default: false,
        },
        {
            displayName: 'Change Password At Logon',
            name: 'changePasswordAtLogon',
            type: 'boolean',
            default: false,
        },
        {
            displayName: 'Compound Identity Supported',
            name: 'compoundIdentitySupported',
            type: 'boolean',
            default: false,
        },
        {
            displayName: 'Enabled',
            name: 'enabled',
            type: 'boolean',
            default: true,
            description: 'Whether the account is enabled. If true and no password is provided, you must also set Password Not Required to true.',
        },
        {
            displayName: 'Password Never Expires',
            name: 'passwordNeverExpires',
            type: 'boolean',
            default: false,
        },
        {
            displayName: 'Password Not Required',
            name: 'passwordNotRequired',
            type: 'boolean',
            default: false,
        },
        {
            displayName: 'Smartcard Logon Required',
            name: 'smartcardLogonRequired',
            type: 'boolean',
            default: false,
        },
        {
            displayName: 'Trusted For Delegation',
            name: 'trustedForDelegation',
            type: 'boolean',
            default: false,
        },
    ],
};
