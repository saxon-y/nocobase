import { Action } from '@nocobase/resourcer';
import { assign, Toposort, ToposortOptions } from '@nocobase/utils';
import EventEmitter from 'events';
import parse from 'json-templates';
import compose from 'koa-compose';
import lodash from 'lodash';
import { ACLAvailableAction, AvailableActionOptions } from './acl-available-action';
import { ACLAvailableStrategy, AvailableStrategyOptions, predicate } from './acl-available-strategy';
import { ACLRole, ResourceActionsOptions, RoleActionParams } from './acl-role';
import { AllowManager, ConditionFunc } from './allow-manager';
import FixedParamsManager, { Merger } from './fixed-params-manager';
import SnippetManager, { SnippetOptions } from './snippet-manager';

interface CanResult {
  role: string;
  resource: string;
  action: string;
  params?: any;
}

export interface DefineOptions {
  role: string;
  allowConfigure?: boolean;
  strategy?: string | AvailableStrategyOptions;
  actions?: ResourceActionsOptions;
  routes?: any;
  snippets?: string[];
}

export interface ListenerContext {
  acl: ACL;
  role: ACLRole;
  path: string;
  actionName: string;
  resourceName: string;
  params: RoleActionParams;
}

type Listener = (ctx: ListenerContext) => void;

interface CanArgs {
  role: string;
  resource: string;
  action: string;
  ctx?: any;
}

export class ACL extends EventEmitter {
  protected availableActions = new Map<string, ACLAvailableAction>();
  public availableStrategy = new Map<string, ACLAvailableStrategy>();
  protected fixedParamsManager = new FixedParamsManager();

  protected middlewares: Toposort<any>;

  public allowManager = new AllowManager(this);
  public snippetManager = new SnippetManager();

  roles = new Map<string, ACLRole>();

  actionAlias = new Map<string, string>();

  configResources: string[] = [];

  constructor() {
    super();

    this.middlewares = new Toposort<any>();

    this.beforeGrantAction((ctx) => {
      if (lodash.isPlainObject(ctx.params) && ctx.params.own) {
        ctx.params = lodash.merge(ctx.params, predicate.own);
      }
    });

    this.beforeGrantAction((ctx) => {
      const actionName = this.resolveActionAlias(ctx.actionName);

      if (lodash.isPlainObject(ctx.params)) {
        if ((actionName === 'create' || actionName === 'update') && ctx.params.fields) {
          ctx.params = {
            ...lodash.omit(ctx.params, 'fields'),
            whitelist: ctx.params.fields,
          };
        }

        if (actionName === 'view' && ctx.params.fields) {
          const appendFields = ['id', 'createdAt', 'updatedAt'];
          ctx.params = {
            ...lodash.omit(ctx.params, 'fields'),
            fields: [...ctx.params.fields, ...appendFields],
          };
        }
      }
    });

    this.use(this.allowManager.aclMiddleware(), {
      tag: 'allow-manager',
      before: 'core',
    });

    this.addCoreMiddleware();
  }

  protected addCoreMiddleware() {
    const acl = this;

    const filterParams = (ctx, resourceName, params) => {
      if (params?.filter?.createdById) {
        const collection = ctx.db.getCollection(resourceName);
        if (!collection || !collection.getField('createdById')) {
          return lodash.omit(params, 'filter.createdById');
        }
      }

      return params;
    };

    this.middlewares.add(
      async (ctx, next) => {
        const resourcerAction: Action = ctx.action;
        const { resourceName, actionName } = ctx.action;

        const permission = ctx.permission;

        ctx.log?.info && ctx.log.info('ctx permission', permission);

        if ((!permission.can || typeof permission.can !== 'object') && !permission.skip) {
          ctx.throw(403, 'No permissions');
          return;
        }

        const params = permission.can?.params || acl.fixedParamsManager.getParams(resourceName, actionName);

        ctx.log?.info && ctx.log.info('acl params', params);

        if (params && resourcerAction.mergeParams) {
          const filteredParams = filterParams(ctx, resourceName, params);
          const parsedParams = acl.parseJsonTemplate(filteredParams, ctx);

          ctx.permission.parsedParams = parsedParams;
          ctx.log?.info && ctx.log.info('acl parsedParams', parsedParams);
          ctx.permission.rawParams = lodash.cloneDeep(resourcerAction.params);
          resourcerAction.mergeParams(parsedParams, {
            appends: (x, y) => {
              if (!x) {
                return [];
              }
              if (!y) {
                return x;
              }
              return (x as any[]).filter((i) => y.includes(i.split('.').shift()));
            },
          });
          ctx.permission.mergedParams = lodash.cloneDeep(resourcerAction.params);
        }

        await next();
      },
      {
        tag: 'core',
        group: 'core',
      },
    );
  }

  define(options: DefineOptions): ACLRole {
    const roleName = options.role;
    const role = new ACLRole(this, roleName);

    if (options.strategy) {
      role.strategy = options.strategy;
    }

    const actions = options.actions || {};

    for (const [actionName, actionParams] of Object.entries(actions)) {
      role.grantAction(actionName, actionParams);
    }

    this.roles.set(roleName, role);

    return role;
  }

  getRole(name: string): ACLRole {
    return this.roles.get(name);
  }

  removeRole(name: string) {
    return this.roles.delete(name);
  }

  registerConfigResources(names: string[]) {
    names.forEach((name) => this.registerConfigResource(name));
  }

  registerConfigResource(name: string) {
    this.configResources.push(name);
  }

  isConfigResource(name: string) {
    return this.configResources.includes(name);
  }

  setAvailableAction(name: string, options: AvailableActionOptions = {}) {
    this.availableActions.set(name, new ACLAvailableAction(name, options));

    if (options.aliases) {
      const aliases = lodash.isArray(options.aliases) ? options.aliases : [options.aliases];
      for (const alias of aliases) {
        this.actionAlias.set(alias, name);
      }
    }
  }

  getAvailableAction(name: string) {
    const actionName = this.actionAlias.get(name) || name;
    return this.availableActions.get(actionName);
  }

  getAvailableActions() {
    return this.availableActions;
  }

  setAvailableStrategy(name: string, options: AvailableStrategyOptions) {
    this.availableStrategy.set(name, new ACLAvailableStrategy(this, options));
  }

  beforeGrantAction(listener?: Listener) {
    this.addListener('beforeGrantAction', listener);
  }

  can(options: CanArgs): CanResult | null {
    const { role, resource, action } = options;
    const aclRole = this.roles.get(role);

    if (!aclRole) {
      return null;
    }

    const snippetAllowed = aclRole.snippetAllowed(`${resource}:${action}`);

    if (snippetAllowed === false) {
      return null;
    }

    const fixedParams = this.fixedParamsManager.getParams(resource, action);

    const mergeParams = (result: CanResult) => {
      const params = result['params'] || {};

      const mergedParams = assign(params, fixedParams);

      if (Object.keys(mergedParams).length) {
        result['params'] = mergedParams;
      } else {
        delete result['params'];
      }

      return result;
    };

    const aclResource = aclRole.getResource(resource);

    if (aclResource) {
      const actionParams = aclResource.getAction(action);

      if (actionParams) {
        // handle single action config
        return mergeParams({
          role,
          resource,
          action,
          params: actionParams,
        });
      } else {
        return null;
      }
    }

    const roleStrategy = aclRole.getStrategy();

    if (!roleStrategy && !snippetAllowed) {
      return null;
    }

    let roleStrategyParams = roleStrategy?.allow(resource, this.resolveActionAlias(action));

    if (!roleStrategyParams && snippetAllowed) {
      roleStrategyParams = {};
    }

    if (roleStrategyParams) {
      const result = { role, resource, action, params: {} };

      if (lodash.isPlainObject(roleStrategyParams)) {
        result['params'] = roleStrategyParams;
      }

      return mergeParams(result);
    }

    return null;
  }

  protected isAvailableAction(actionName: string) {
    return this.availableActions.has(this.resolveActionAlias(actionName));
  }

  public resolveActionAlias(action: string) {
    return this.actionAlias.get(action) ? this.actionAlias.get(action) : action;
  }

  use(fn: any, options?: ToposortOptions) {
    this.middlewares.add(fn, {
      group: 'prep',
      ...options,
    });
  }

  allow(resourceName: string, actionNames: string[] | string, condition?: string | ConditionFunc) {
    return this.skip(resourceName, actionNames, condition);
  }

  skip(resourceName: string, actionNames: string[] | string, condition?: string | ConditionFunc) {
    if (!Array.isArray(actionNames)) {
      actionNames = [actionNames];
    }

    for (const actionName of actionNames) {
      this.allowManager.allow(resourceName, actionName, condition);
    }
  }

  parseJsonTemplate(json: any, ctx: any) {
    return parse(json)({
      ctx: {
        state: JSON.parse(JSON.stringify(ctx.state)),
      },
    });
  }

  middleware() {
    const acl = this;

    return async function ACLMiddleware(ctx, next) {
      const roleName = ctx.state.currentRole || 'anonymous';
      const { resourceName, actionName } = ctx.action;

      ctx.can = (options: Omit<CanArgs, 'role'>) => {
        return acl.can({ role: roleName, ...options });
      };

      ctx.permission = {
        can: ctx.can({ resource: resourceName, action: actionName }),
      };

      return compose(acl.middlewares.nodes)(ctx, next);
    };
  }

  async getActionParams(ctx) {
    const roleName = ctx.state.currentRole || 'anonymous';
    const { resourceName, actionName } = ctx.action;

    ctx.can = (options: Omit<CanArgs, 'role'>) => {
      return this.can({ role: roleName, ...options });
    };

    ctx.permission = {
      can: ctx.can({ resource: resourceName, action: actionName }),
    };

    await compose(this.middlewares.nodes)(ctx, async () => {});
  }

  addFixedParams(resource: string, action: string, merger: Merger) {
    this.fixedParamsManager.addParams(resource, action, merger);
  }

  registerSnippet(snippet: SnippetOptions) {
    this.snippetManager.register(snippet);
  }
}
