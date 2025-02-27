import { Field } from '@formily/core';
import { useField, useFieldSchema } from '@formily/react';
import flat from 'flat';
import { useTranslation } from 'react-i18next';
import { useCompile } from '../..';
import { useBlockRequestContext } from '../../../block-provider';
import { mergeFilter } from '../../../block-provider/SharedFilterProvider';
import { useCollection, useCollectionManager } from '../../../collection-manager';

export const useFilterOptions = (collectionName: string) => {
  const { getCollectionFields } = useCollectionManager();
  const fields = getCollectionFields(collectionName);
  const options=useFilterFieldOptions(fields)
  const compile = useCompile();
  const { getChildrenCollections } = useCollectionManager();
  const collection = useCollection();
  const childrenCollections = getChildrenCollections(collection.name);
  if (childrenCollections.length > 0 && !options.find((v) => v.name == 'tableoid')) {
    options.push({
      name: 'tableoid',
      type: 'string',
      title: '{{t("Table OID(Inheritance)")}}',
      schema: {
        'x-component': 'Select',
        enum: [{ value: collection.name, label: compile(collection.title) }].concat(
          childrenCollections.map((v) => {
            return {
              value: v.name,
              label: compile(v.title),
            };
          }),
        ),
      },
      operators: [
        {
          label: '{{t("contains")}}',
          value: '$childIn',
          schema: {
            'x-component': 'Select',
            'x-component-props': { mode: 'tags' },
          },
        },
        {
          label: '{{t("does not contain")}}',
          value: '$childNotIn',
          schema: {
            'x-component': 'Select',
            'x-component-props': { mode: 'tags' },
          },
        },
      ],
    });
  }
  return options;
};

export const useFilterFieldOptions = (fields) => {
  const fieldSchema = useFieldSchema();
  const nonfilterable = fieldSchema?.['x-component-props']?.nonfilterable || [];
  const { getCollectionFields, getInterface } = useCollectionManager();
  const field2option = (field, depth) => {
    if (nonfilterable.length && depth === 1 && nonfilterable.includes(field.name)) {
      return;
    }
    if (!field.interface) {
      return;
    }
    const fieldInterface = getInterface(field.interface);
    if (!fieldInterface.filterable) {
      return;
    }
    const { nested, children, operators } = fieldInterface.filterable;
    const option = {
      name: field.name,
      type: field.type,
      target: field.target,
      title: field?.uiSchema?.title || field.name,
      schema: field?.uiSchema,
      operators:
        operators?.filter?.((operator) => {
          return !operator?.visible || operator.visible(field);
        }) || [],
    };
    if (field.target && depth > 2) {
      return;
    }
    if (depth > 2) {
      return option;
    }
    if (children?.length) {
      option['children'] = children;
    }
    if (nested) {
      const targetFields = getCollectionFields(field.target);
      const options = getOptions(targetFields, depth + 1).filter(Boolean);
      option['children'] = option['children'] || [];
      option['children'].push(...options);
    }
    return option;
  };
  const getOptions = (fields, depth) => {
    const options = [];
    fields.forEach((field) => {
      const option = field2option(field, depth);
      if (option) {
        options.push(option);
      }
    });
    return options;
  };
  return getOptions(fields, 1);
};

const isEmpty = (obj) => {
  return (
    (Array.isArray(obj) && obj.length === 0) ||
    (obj && Object.keys(obj).length === 0 && Object.getPrototypeOf(obj) === Object.prototype)
  );
};

export const removeNullCondition = (filter) => {
  const items = flat(filter || {});
  const values = {};
  for (const key in items) {
    const value = items[key];
    if (value != null && !isEmpty(value)) {
      values[key] = value;
    }
  }
  return flat.unflatten(values);
};

export const useFilterActionProps = () => {
  const { name } = useCollection();
  const options = useFilterOptions(name);
  const { service, props } = useBlockRequestContext();
  return useFilterFieldProps({ options, service, params: props?.params });
};

export const useFilterFieldProps = ({ options, service, params }) => {
  const { t } = useTranslation();
  const field = useField<Field>();
  return {
    options,
    onSubmit(values) {
      // filter parameter for the block
      const defaultFilter = params.filter;
      // filter parameter for the filter action
      const filter = removeNullCondition(values?.filter);

      const filters = service.params?.[1]?.filters || {};
      filters[`filterAction`] = filter;
      service.run(
        { ...service.params?.[0], page: 1, filter: mergeFilter([...Object.values(filters), defaultFilter]) },
        { filters },
      );
      const items = filter?.$and || filter?.$or;
      if (items?.length) {
        field.title = t('{{count}} filter items', { count: items?.length || 0 });
      } else {
        field.title = t('Filter');
      }
    },
    onReset() {
      const filter = params.filter;
      const filters = service.params?.[1]?.filters || {};
      delete filters[`filterAction`];
      service.run(
        {
          ...service.params?.[0],
          filter: mergeFilter([...Object.values(filters), filter]),
          page: 1,
        },
        { filters },
      );
      field.title = t('Filter');
    },
  };
};
