import {ACL} from '@nocobase/acl';
import {Database, HasManyRepository} from '@nocobase/database';
import UsersPlugin from '@nocobase/plugin-users';
import {MockServer} from '@nocobase/test';
import {prepareApp} from './prepare';

describe('association test', () => {
  let app: MockServer;
  let db: Database;
  let acl: ACL;

  let user;
  let userAgent;
  let admin;
  let adminAgent;

  afterEach(async () => {
    await app.destroy();
  });

  beforeEach(async () => {
    app = await prepareApp();
    db = app.db;
    acl = app.acl;
  });

  it('should set association actions', async () => {
    await db.getRepository('collections').create({
      values: {
        name: 'posts',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'userComments', type: 'hasMany', target: 'comments', interface: 'linkTo' },
        ],
      },
      context: {},
    });


    await db.getRepository('collections').create({
      values: {
        name: 'comments',
        fields: [{ name: 'content', type: 'string' }],
      },
      context: {},
    });

    await db.getRepository('roles').create({
      values: {
        name: 'test-role',
      },
      context: {},
    });

    await db.getRepository('roles.resources', 'test-role').create({
      values: {
        name: 'posts',
        usingActionsConfig: true,
        actions: [
          {
            name: 'view',
            fields: ['userComments'],
          },
        ],
      },
      context: {},
    });

    const role = acl.getRole('test-role');

    expect(
      acl.can({
        role: 'test-role',
        action: 'list',
        resource: 'posts.userComments',
      }),
    ).not.toBeNull();

    const post = await db.getRepository('posts').create({
      values: {
        title: 'hello world',
        userComments: [{ content: 'comment 1' }],
      },
    });

    const UserRepo = db.getCollection('users').repository;
    const user = await UserRepo.create({
      values: {
        roles: ['test-role'],
      },
    });

    const userPlugin = app.getPlugin('users') as UsersPlugin;

    const userAgent = app.agent().auth(
      userPlugin.jwtService.sign({
        userId: user.get('id'),
      }),
      { type: 'bearer' },
    );

    //@ts-ignore
    const response = await userAgent.resource('posts').list({});
    expect(response.statusCode).toEqual(200);
    const post1 = response.body.data[0];
    expect(post1.userComments).not.toBeDefined();
  });
});

describe('association field acl', () => {
  let app: MockServer;
  let db: Database;
  let acl: ACL;

  let user;
  let userAgent;
  let admin;
  let adminAgent;

  afterEach(async () => {
    await app.destroy();
  });

  beforeEach(async () => {
    app = await prepareApp();
    db = app.db;
    acl = app.acl;

    await db.getRepository('roles').create({
      values: {
        name: 'new',
      },
    });

    await db.getRepository('roles').create({
      values: {
        name: 'testAdmin',
        snippets: ['pm.*'],
      },
    });

    const UserRepo = db.getCollection('users').repository;

    user = await UserRepo.create({
      values: {
        roles: ['new'],
      },
    });

    admin = await UserRepo.create({
      values: {
        roles: ['testAdmin'],
      },
    });

    const userPlugin = app.getPlugin('users') as UsersPlugin;
    userAgent = app.agent().auth(
      userPlugin.jwtService.sign({
        userId: user.get('id'),
      }),
      { type: 'bearer' },
    );

    adminAgent = app.agent().auth(
      userPlugin.jwtService.sign({
        userId: admin.get('id'),
      }),
      { type: 'bearer' },
    );

    await db.getRepository('collections').create({
      values: {
        name: 'orders',
      },
      context: {},
    });

    await db.getRepository('collections.fields', 'users').create({
      values: {
        name: 'name',
        type: 'string',
      },
      context: {},
    });

    await db.getRepository('collections.fields', 'users').create({
      values: {
        name: 'age',
        type: 'integer',
      },
      context: {},
    });

    await db.getRepository('collections.fields', 'users').create({
      values: {
        interface: 'linkTo',
        name: 'orders',
        type: 'hasMany',
        target: 'orders',
      },
      context: {},
    });

    await db.getRepository('collections.fields', 'orders').create({
      values: {
        name: 'content',
        type: 'string',
      },
      context: {},
    });

    await adminAgent.resource('roles.resources', 'new').create({
      values: {
        name: 'users',
        usingActionsConfig: true,
        actions: [
          {
            name: 'create',
            fields: ['orders'],
          },
          {
            name: 'view',
            fields: ['orders'],
          },
        ],
      },
    });

    await adminAgent.resource('roles.resources', 'new').create({
      values: {
        name: 'orders',
        usingActionsConfig: true,
        actions: [
          {
            name: 'view',
          },
        ],
      },
    });
  });

  // skip because of disable grant associations target action
  it.skip('should revoke target action on association action revoke', async () => {
    expect(
      acl.can({
        role: 'new',
        resource: 'orders',
        action: 'list',
      }),
    ).toMatchObject({
      role: 'new',
      resource: 'orders',
      action: 'list',
    });

    await adminAgent.resource('roles.resources', 'new').update({
      values: {
        name: 'users',
        usingActionsConfig: true,
        actions: [],
      },
    });

    expect(
      acl.can({
        role: 'new',
        resource: 'orders',
        action: 'list',
      }),
    ).toBeNull();
  });

  it('should revoke association action on action revoke', async () => {
    expect(
      acl.can({
        role: 'new',
        resource: 'users.orders',
        action: 'add',
      }),
    ).toMatchObject({
      role: 'new',
      resource: 'users.orders',
      action: 'add',
    });

    const viewAction = await db.getRepository('rolesResourcesActions').findOne({
      filter: {
        name: 'view',
      },
    });

    const actionId = viewAction.get('id') as number;

    const response = await adminAgent.resource('roles.resources', 'new').update({
      filterByTk: 'users',
      values: {
        name: 'users',
        usingActionsConfig: true,
        actions: [
          {
            id: actionId,
          },
        ],
      },
    });

    expect(response.statusCode).toEqual(200);

    expect(
      acl.can({
        role: 'new',
        resource: 'users.orders',
        action: 'add',
      }),
    ).toBeNull();
  });

  it('should revoke association action on field deleted', async () => {
    await adminAgent.resource('roles.resources', 'new').update({
      filterByTk: 'users',
      values: {
        name: 'users',
        usingActionsConfig: true,
        actions: [
          {
            name: 'create',
            fields: ['name', 'age'],
          },
        ],
      },
    });

    expect(
      acl.can({
        role: 'new',
        resource: 'users',
        action: 'create',
      }),
    ).toMatchObject({
      role: 'new',
      resource: 'users',
      action: 'create',
      params: {
        whitelist: ['age', 'name'],
      },
    });

    const roleResource = await db.getRepository('rolesResources').findOne({
      filter: {
        name: 'users',
      },
    });

    const action = await db
      .getRepository<HasManyRepository>('rolesResources.actions', roleResource.get('id') as string)
      .findOne({
        filter: {
          name: 'create',
        },
      });

    expect(action.get('fields').includes('name')).toBeTruthy();

    // remove field
    await db.getRepository<HasManyRepository>('collections.fields', 'users').destroy({
      filter: {
        name: 'name',
      },
      context: {},
    });

    expect(
      acl.can({
        role: 'new',
        resource: 'users',
        action: 'create',
      }),
    ).toMatchObject({
      role: 'new',
      resource: 'users',
      action: 'create',
      params: {
        whitelist: ['age'],
      },
    });
  });

  it('should allow association fields access', async () => {
    const createResponse = await userAgent.resource('users').create({
      values: {
        orders: [
          {
            content: 'apple',
          },
        ],
      },
    });

    expect(createResponse.statusCode).toEqual(200);

    const user = await db.getRepository('users').findOne({
      filterByTk: createResponse.body.data.id,
    });
    // @ts-ignore
    expect(await user.countOrders()).toEqual(1);

    expect(
      acl.can({
        role: 'new',
        resource: 'users.orders',
        action: 'list',
      }),
    ).toMatchObject({
      role: 'new',
      resource: 'users.orders',
      action: 'list',
    });

    expect(
      acl.can({
        role: 'new',
        resource: 'orders',
        action: 'list',
      }),
    ).toMatchObject({
      role: 'new',
      resource: 'orders',
      action: 'list',
    });
  });
});
