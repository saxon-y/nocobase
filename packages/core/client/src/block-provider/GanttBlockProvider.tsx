import { useField } from '@formily/react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { BlockProvider, useBlockRequestContext } from './BlockProvider';
import { TableBlockProvider } from './TableBlockProvider';
import { useACLRoleContext } from '../acl/ACLProvider';
import { useCollection } from '../collection-manager/hooks';

export const GanttBlockContext = createContext<any>({});

const formatData = (
  data = [],
  fieldNames,
  tasks: any[] = [],
  projectId: any = undefined,
  hideChildren: boolean = false,
  checkPermassion?: Function,
) => {
  data.forEach((item: any) => {
    const disable = checkPermassion(item);
    const percent = item[fieldNames.progress] * 100;
    if (item.children && item.children.length) {
      tasks.push({
        start: new Date(item[fieldNames.start]),
        end: new Date(item[fieldNames.end]),
        name: item[fieldNames.title],
        id: item.id + '',
        type: 'project',
        progress: percent > 100 ? 100 : percent || 0,
        hideChildren: hideChildren,
        project: projectId,
        color: item.color,
        isDisabled: disable,
      });
      formatData(item.children, fieldNames, tasks, item.id + '', hideChildren, checkPermassion);
    } else {
      tasks.push({
        start: item[fieldNames.start] ? new Date(item[fieldNames.start]) : undefined,
        end: new Date(item[fieldNames.end] || item[fieldNames.start]),
        name: item[fieldNames.title],
        id: item.id + '',
        type: fieldNames.end ? 'task' : 'milestone',
        progress: percent > 100 ? 100 : percent || 0,
        project: projectId,
        color: item.color,
        isDisabled: disable,
      });
    }
  });
  return tasks;
};
const InternalGanttBlockProvider = (props) => {
  const { fieldNames, timeRange, resource } = props;
  const field = useField();
  const { service } = useBlockRequestContext();
  // if (service.loading) {
  //   return <Spin />;
  // }
  return (
    <GanttBlockContext.Provider
      value={{
        field,
        service,
        resource,
        fieldNames,
        timeRange,
      }}
    >
      {props.children}
    </GanttBlockContext.Provider>
  );
};

export const GanttBlockProvider = (props) => {
  return (
    <BlockProvider {...props} params={{ tree: true, paginate: false, sort: props.fieldNames.start }}>
      <TableBlockProvider {...props} params={{ tree: true, paginate: false, sort: props.fieldNames.start }}>
        <InternalGanttBlockProvider {...props} />
      </TableBlockProvider>
    </BlockProvider>
  );
};

export const useGanttBlockContext = () => {
  return useContext(GanttBlockContext);
};

export const useGanttBlockProps = () => {
  const ctx = useGanttBlockContext();
  const [tasks, setTasks] = useState<any>([]);
  const { getPrimaryKey, name, template } = useCollection();
  const { parseAction } = useACLRoleContext();
  const primaryKey = getPrimaryKey();
  const checkPermassion = (record) => {
    const actionPath = `${name}:update`;
    const schema = {};
    const recordPkValue = record?.[primaryKey];
    const params = parseAction(actionPath, { schema, recordPkValue });
    return template === 'view' || !params;
  };

  const onExpanderClick = (task: any) => {
    const data = ctx.field.data;
    const tasksData = data.map((t: any) => (t.id === task.id ? task : t));
    setTasks(tasksData);
    ctx.field.data = tasksData;
  };
  const expandAndCollapseAll = (flag) => {
    const data = formatData(ctx.service.data?.data, ctx.fieldNames, [], undefined, flag, checkPermassion);
    setTasks(data);
    ctx.field.data = data;
  };
  useEffect(() => {
    if (!ctx?.service?.loading) {
      const data = formatData(ctx.service.data?.data, ctx.fieldNames, [], undefined, false, checkPermassion);
      setTasks(data);
      ctx.field.data = data;
    }
  }, [ctx?.service?.loading]);
  return {
    fieldNames: ctx.fieldNames,
    timeRange: ctx.timeRange,
    onExpanderClick,
    expandAndCollapseAll,
    tasks,
  };
};
