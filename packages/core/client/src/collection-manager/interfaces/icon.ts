import { defaultProps } from './properties';
import { IField } from './types';

export const icon: IField = {
  name: 'icon',
  type: 'object',
  group: 'basic',
  order: 10,
  title: '{{t("Icon")}}',
  default: {
    type: 'string',
    // name,
    uiSchema: {
      type: 'string',
      // title,
      'x-component': 'IconPicker',
    },
  },
  availableTypes:['string'],
  hasDefaultValue: true,
  properties: {
    ...defaultProps,
  },
};
