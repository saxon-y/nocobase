import { Context } from '@nocobase/actions';
import { Collection } from '@nocobase/database';

export const dateTemplate = async (ctx: Context, next) => {
  const { resourceName, actionName } = ctx.action;
  const { isTemplate, fields } = ctx.action.params;

  await next();

  if (isTemplate && actionName === 'get' && fields.length > 0) {
    ctx.body = traverseJSON(ctx.body?.toJSON(), {
      collection: ctx.db.getCollection(resourceName),
      include: fields,
    });
  }
};

type TraverseOptions = {
  collection: Collection;
  exclude?: string[];
  include?: string[];
  through?: string;
};

const traverseHasMany = (arr: any[], { collection, exclude = [], include = [] }: TraverseOptions) => {
  if (!arr) {
    return arr;
  }
  return arr.map((item) => traverseJSON(item, { collection, exclude, include }));
};

const traverseBelongsToMany = (arr: any[], { collection, exclude = [], through }: TraverseOptions) => {
  if (!arr) {
    return arr;
  }
  const throughCollection = collection.db.getCollection(through);
  return arr.map((item) => {
    const data = traverseJSON(item[through], { collection: throughCollection, exclude });
    if (Object.keys(data).length) {
      item[through] = data;
    } else {
      delete item[through];
    }
    return item;
  });
};

const parseInclude = (keys: string[]) => {
  const map = {};
  for (const key of keys) {
    const args = key.split('.');
    const field = args.shift();
    map[field] = map[field] || [];
    if (args.length) {
      map[field].push(args.join('.'));
    }
  }
  return map;
};

const traverseJSON = (data, options: TraverseOptions) => {
  const { collection, exclude = [], include = [] } = options;
  const map = parseInclude(include);
  const result = {};
  for (const key of Object.keys(data)) {
    const subInclude = map[key];
    if (include.length > 0 && !subInclude) {
      continue;
    }
    if (exclude.includes(key)) {
      continue;
    }
    if (['createdAt', 'updatedAt', 'createdBy', 'createdById', 'updatedById', 'updatedBy'].includes(key)) {
      continue;
    }
    const field = collection.getField(key);
    if (!field) {
      result[key] = data[key];
      continue;
    }
    if (field.options.primaryKey) {
      continue;
    }
    if (['sort', 'password', 'sequence'].includes(field.type)) {
      continue;
    }
    if (field.type === 'hasOne') {
      result[key] = traverseJSON(data[key], {
        collection: collection.db.getCollection(field.target),
        exclude: [field.foreignKey],
        include: subInclude,
      });
    } else if (field.type === 'hasMany') {
      result[key] = traverseHasMany(data[key], {
        collection: collection.db.getCollection(field.target),
        exclude: [field.foreignKey],
        include: subInclude,
      });
    } else if (field.type === 'belongsTo') {
      result[key] = data[key];
    } else if (field.type === 'belongsToMany') {
      result[key] = traverseBelongsToMany(data[key], {
        collection: collection.db.getCollection(field.target),
        exclude: [field.foreignKey, field.otherKey],
        through: field.through,
      });
    } else {
      result[key] = data[key];
    }
  }
  return result;
};
