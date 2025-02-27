import { ISchema, useField, useFieldSchema } from '@formily/react';
import { isValid, uid } from '@formily/shared';
import { Menu } from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDesignable } from '../..';
import { useCollection, useCollectionManager } from '../../../collection-manager';
import { OpenModeSchemaItems } from '../../../schema-items';
import { GeneralSchemaDesigner, SchemaSettings } from '../../../schema-settings';
import { useLinkageAction } from './hooks';

import { requestSettingsSchema } from './utils';

const MenuGroup = (props) => {
  const fieldSchema = useFieldSchema();
  const actionType = fieldSchema['x-action'] || '';
  const { t } = useTranslation();
  const actionTitles = {
    'customize:popup': t('Popup'),
    'customize:update': t('Update record'),
    'customize:save': t('Save record'),
    'customize:table:request': t('Custom request'),
    'customize:form:request': t('Custom request'),
  };
  if (
    ![
      'customize:popup',
      'customize:update',
      'customize:save',
      'customize:table:request',
      'customize:form:request',
    ].includes(actionType)
  ) {
    return <>{props.children}</>;
  }
  return <Menu.ItemGroup title={`${t('Customize')} > ${actionTitles[actionType]}`}>{props.children}</Menu.ItemGroup>;
};

export const ActionDesigner = (props) => {
  const { modalTip, linkageAction, ...restProps } = props;
  const field = useField();
  const fieldSchema = useFieldSchema();
  const { name } = useCollection();
  const { getChildrenCollections } = useCollectionManager();
  const { dn } = useDesignable();
  const { t } = useTranslation();
  const isPopupAction = ['create', 'update', 'view', 'customize:popup'].includes(fieldSchema['x-action'] || '');
  const isUpdateModePopupAction = ['customize:bulkUpdate', 'customize:bulkEdit'].includes(fieldSchema['x-action']);
  const [initialSchema, setInitialSchema] = useState<ISchema>();
  const actionType = fieldSchema['x-action'] ?? '';
  const isLinkageAction = linkageAction || useLinkageAction();
  const isChildCollectionAction = getChildrenCollections(name).length > 0 && fieldSchema['x-action'] === 'create';
  const isSupportEditButton = fieldSchema['x-action'] !== 'expandAll';
  const isLink = fieldSchema['x-component'] === 'Action.Link';
  useEffect(() => {
    const schemaUid = uid();
    const schema: ISchema = {
      type: 'void',
      'x-uid': schemaUid,
      'x-component': 'Grid',
      'x-initializer': 'CustomFormItemInitializers',
    };
    setInitialSchema(schema);
  }, [field.address]);

  const tips = {
    'customize:update': t(
      'After clicking the custom button, the following fields of the current record will be saved according to the following form.',
    ),
    'customize:save': t(
      'After clicking the custom button, the following fields of the current record will be saved according to the following form.',
    ),
  };
  return (
    <GeneralSchemaDesigner {...restProps} disableInitializer>
      <MenuGroup>
        <SchemaSettings.ModalItem
          title={t('Edit button')}
          schema={
            {
              type: 'object',
              title: t('Edit button'),
              properties: {
                title: {
                  'x-decorator': 'FormItem',
                  'x-component': 'Input',
                  title: t('Button title'),
                  default: fieldSchema.title,
                  'x-component-props': {},
                  'x-visible': isSupportEditButton,
                  // description: `原字段标题：${collectionField?.uiSchema?.title}`,
                },
                icon: {
                  'x-decorator': 'FormItem',
                  'x-component': 'IconPicker',
                  title: t('Button icon'),
                  default: fieldSchema?.['x-component-props']?.icon,
                  'x-component-props': {},
                  'x-visible': isSupportEditButton && !isLink,
                  // description: `原字段标题：${collectionField?.uiSchema?.title}`,
                },
                type: {
                  'x-decorator': 'FormItem',
                  'x-component': 'Radio.Group',
                  title: t('Button background color'),
                  default: fieldSchema?.['x-component-props']?.danger
                    ? 'danger'
                    : fieldSchema?.['x-component-props']?.type === 'primary'
                    ? 'primary'
                    : 'default',
                  enum: [
                    { value: 'default', label: '{{t("Default")}}' },
                    { value: 'primary', label: '{{t("Highlight")}}' },
                    { value: 'danger', label: '{{t("Danger red")}}' },
                  ],
                  'x-visible': !isLink,
                },
              },
            } as ISchema
          }
          onSubmit={({ title, icon, type }) => {
            fieldSchema.title = title;
            field.title = title;
            field.componentProps.icon = icon;
            field.componentProps.danger = type === 'danger';
            field.componentProps.type = type;
            fieldSchema['x-component-props'] = fieldSchema['x-component-props'] || {};
            fieldSchema['x-component-props'].icon = icon;
            fieldSchema['x-component-props'].danger = type === 'danger';
            fieldSchema['x-component-props'].type = type;
            dn.emit('patch', {
              schema: {
                ['x-uid']: fieldSchema['x-uid'],
                title,
                'x-component-props': {
                  ...fieldSchema['x-component-props'],
                },
              },
            });
            dn.refresh();
          }}
        />
        {isLinkageAction && <SchemaSettings.LinkageRules collectionName={name} />}
        <OpenModeSchemaItems openMode={isPopupAction} openSize={isPopupAction}></OpenModeSchemaItems>
        {isUpdateModePopupAction && (
          <SchemaSettings.SelectItem
            title={t('Data will be updated')}
            options={[
              { label: t('Selected'), value: 'selected' },
              { label: t('All'), value: 'all' },
            ]}
            value={fieldSchema?.['x-action-settings']?.['updateMode']}
            onChange={(value) => {
              fieldSchema['x-action-settings']['updateMode'] = value;
              dn.emit('patch', {
                schema: {
                  'x-uid': fieldSchema['x-uid'],
                  'x-action-settings': fieldSchema['x-action-settings'],
                },
              });
              dn.refresh();
            }}
          />
        )}

        {isValid(fieldSchema?.['x-action-settings']?.assignedValues) && (
          <SchemaSettings.ActionModalItem
            title={t('Assign field values')}
            initialSchema={initialSchema}
            initialValues={fieldSchema?.['x-action-settings']?.assignedValues}
            modalTip={tips[actionType]}
            uid={fieldSchema?.['x-action-settings']?.schemaUid}
            onSubmit={(assignedValues) => {
              fieldSchema['x-action-settings']['assignedValues'] = assignedValues;
              dn.emit('patch', {
                schema: {
                  ['x-uid']: fieldSchema['x-uid'],
                  'x-action-settings': fieldSchema['x-action-settings'],
                },
              });
              dn.refresh();
            }}
          />
        )}
        {isValid(fieldSchema?.['x-action-settings']?.requestSettings) && (
          <SchemaSettings.ActionModalItem
            title={t('Request settings')}
            schema={requestSettingsSchema}
            initialValues={fieldSchema?.['x-action-settings']?.requestSettings}
            onSubmit={(requestSettings) => {
              fieldSchema['x-action-settings']['requestSettings'] = requestSettings;
              dn.emit('patch', {
                schema: {
                  ['x-uid']: fieldSchema['x-uid'],
                  'x-action-settings': fieldSchema['x-action-settings'],
                },
              });
              dn.refresh();
            }}
          />
        )}
        {isValid(fieldSchema?.['x-action-settings']?.skipValidator) && (
          <SchemaSettings.SwitchItem
            title={t('Skip required validation')}
            checked={!!fieldSchema?.['x-action-settings']?.skipValidator}
            onChange={(value) => {
              fieldSchema['x-action-settings'].skipValidator = value;
              dn.emit('patch', {
                schema: {
                  ['x-uid']: fieldSchema['x-uid'],
                  'x-action-settings': {
                    ...fieldSchema['x-action-settings'],
                  },
                },
              });
            }}
          />
        )}
        {/* {isValid(fieldSchema?.['x-action-settings']?.overwriteValues) && (
          <SchemaSettings.ModalItem
            title={t('Form values')}
            schema={
              {
                type: 'object',
                properties: {
                  overwriteValues: {
                    title: t('When submitting the following fields, the saved values are'),
                    'x-decorator': 'FormItem',
                    'x-component': 'Input.TextArea',
                    default: JSON.stringify(fieldSchema?.['x-action-settings']?.overwriteValues),
                  },
                },
              } as ISchema
            }
            onSubmit={({ overwriteValues }) => {
              try {
                const values = JSON.parse(overwriteValues);
                fieldSchema['x-action-settings'].overwriteValues = values;
                dn.emit('patch', {
                  schema: {
                    ['x-uid']: fieldSchema['x-uid'],
                    'x-action-settings': {
                      ...fieldSchema['x-action-settings'],
                    },
                  },
                });
                dn.refresh();
              } catch (e) {}
            }}
          />
        )} */}
        {isValid(fieldSchema?.['x-action-settings']?.['onSuccess']) && (
          <SchemaSettings.ModalItem
            title={
              {
                'customize:save': t('After successful save'),
                'customize:update': t('After successful update'),
                'customize:table:request': t('After successful request'),
                'customize:form:request': t('After successful request'),
                'customize:bulkUpdate': t('After successful bulk update'),
              }[actionType]
            }
            initialValues={fieldSchema?.['x-action-settings']?.['onSuccess']}
            schema={
              {
                type: 'object',
                title: {
                  'customize:save': t('After successful save'),
                  'customize:update': t('After successful update'),
                  'customize:table:request': t('After successful request'),
                  'customize:form:request': t('After successful request'),
                  'customize:bulkUpdate': t('After successful bulk update'),
                }[actionType],
                properties: {
                  successMessage: {
                    title: t('Popup message'),
                    'x-decorator': 'FormItem',
                    'x-component': 'Input.TextArea',
                    'x-component-props': {},
                  },
                  manualClose: {
                    title: t('Popup close method'),
                    default: false,
                    enum: [
                      { label: t('Automatic close'), value: false },
                      { label: t('Manually close'), value: true },
                    ],
                    'x-decorator': 'FormItem',
                    'x-component': 'Radio.Group',
                    'x-component-props': {},
                  },
                  redirecting: {
                    title: t('Then'),
                    default: false,
                    enum: [
                      { label: t('Stay on current page'), value: false },
                      { label: t('Redirect to'), value: true },
                    ],
                    'x-decorator': 'FormItem',
                    'x-component': 'Radio.Group',
                    'x-component-props': {},
                    'x-reactions': {
                      target: 'redirectTo',
                      fulfill: {
                        state: {
                          visible: '{{!!$self.value}}',
                        },
                      },
                    },
                  },
                  redirectTo: {
                    title: t('Link'),
                    'x-decorator': 'FormItem',
                    'x-component': 'Input',
                    'x-component-props': {},
                  },
                },
              } as ISchema
            }
            onSubmit={(onSuccess) => {
              fieldSchema['x-action-settings']['onSuccess'] = onSuccess;
              dn.emit('patch', {
                schema: {
                  ['x-uid']: fieldSchema['x-uid'],
                  'x-action-settings': fieldSchema['x-action-settings'],
                },
              });
            }}
          />
        )}

        {isChildCollectionAction && <SchemaSettings.EnableChildCollections collectionName={name} />}
        <SchemaSettings.Divider />
        <SchemaSettings.Remove
          removeParentsIfNoChildren
          breakRemoveOn={(s) => {
            return s['x-component'] === 'Space' || s['x-component'].endsWith('ActionBar');
          }}
          confirm={{
            title: t('Delete action'),
          }}
        />
      </MenuGroup>
    </GeneralSchemaDesigner>
  );
};
