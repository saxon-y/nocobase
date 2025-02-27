import { SchemaInitializerContext, useCollection } from '@nocobase/client';
import { useContext } from 'react';

export const ImportInitializerProvider = (props: any) => {
  const initializes = useContext(SchemaInitializerContext);
  const hasImportAction = initializes.TableActionInitializers.items[0].children.some(
    (initialize) => initialize.component === 'ImportActionInitializer',
  );
  !hasImportAction &&
    initializes.TableActionInitializers.items[0].children.push({
      type: 'item',
      title: "{{t('Import')}}",
      component: 'ImportActionInitializer',
      schema: {
        'x-align': 'right',
        'x-decorator': 'ACLActionProvider',
        'x-acl-action-props': {
          skipScopeCheck: true,
        },
      },
      visible: () => {
        const collection = useCollection();
        return collection.template !== 'view' && collection.template !== 'file';
      },
    });
  return props.children;
};
