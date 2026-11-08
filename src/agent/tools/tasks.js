// @ts-check
// src/agent/tools/tasks.js
// Agent tools: create_task_list, list_tasks, complete_task_item.
// Docs: docs/modules/agent.md

const { z } = require('zod');
const prisma = require('../../db');
const { emit, KINDS } = require('../../interactions');
const { ToolInputError } = require('../toolRegistry');

/** @type {import('../toolRegistry').Tool<any>} */
const createTaskList = {
  name: 'create_task_list',
  description:
    'Create a to-do list from one or more things the user needs to do (no specific time). ' +
    'Returns the list id and numbered items; the user can reply "done 2" later.',
  permission: 'write',
  inputSchema: z.strictObject({
    title: z.string().min(1).max(80).describe('Short list name, e.g. "Acme launch" or "Today"'),
    items: z.array(z.string().min(1).max(200)).min(1).max(20),
    person: z.string().min(1).max(60).optional().describe('Client/person the list is for, lowercase'),
  }),
  async execute({ title, items, person }, { user }) {
    const task = await prisma.task.create({
      data: {
        userId: user.id, title, client: person ?? null, tags: person ? [`#${person.toLowerCase().replace(/\s+/g, '')}`] : [],
        items: /** @type {string[]} */ (items).map((text, i) => ({ id: i + 1, text, done: false, order: i })),
      },
    });
    emit({ kind: KINDS.TASK_CREATED, userId: user.id, person, summary: title, payload: { taskId: task.id, itemCount: items.length, via: 'agent' } });
    return { taskId: task.id, title, items: /** @type {string[]} */ (items).map((text, i) => ({ itemId: i + 1, text })) };
  },
};

/** @type {import('../toolRegistry').Tool<any>} */
const listTasks = {
  name: 'list_tasks',
  description: "List the user's task lists with item ids and done status, newest first. Use before completing an item when the id is unknown.",
  permission: 'read',
  inputSchema: z.strictObject({
    person: z.string().min(1).max(60).optional(),
    includeCompleted: z.boolean().default(false).describe('Include items already done'),
  }),
  async execute({ person, includeCompleted }, { user }) {
    const tasks = await prisma.task.findMany({
      where: { userId: user.id, ...(person ? { client: { equals: person, mode: 'insensitive' } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return {
      lists: tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        person: t.client,
        items: /** @type {any[]} */ (t.items)
          .filter((i) => includeCompleted || !i.done)
          .map((i) => ({ itemId: i.id, text: i.text, done: i.done })),
      })),
    };
  },
};

/** @type {import('../toolRegistry').Tool<any>} */
const completeTaskItem = {
  name: 'complete_task_item',
  description: 'Mark one item of a task list as done. Needs taskId and itemId from create_task_list or list_tasks.',
  permission: 'write',
  inputSchema: z.strictObject({
    taskId: z.string().min(1),
    itemId: z.number().int().min(1),
  }),
  async execute({ taskId, itemId }, { user }) {
    const task = await prisma.task.findFirst({ where: { id: taskId, userId: user.id } });
    if (!task) throw new ToolInputError('No such task list for this user.');

    const items = /** @type {any[]} */ (task.items);
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new ToolInputError(`List "${task.title}" has no item ${itemId}.`);
    if (item.done) return { alreadyDone: true, text: item.text };

    item.done = true;
    await prisma.task.update({ where: { id: task.id }, data: { items } });
    emit({ kind: KINDS.TASK_ITEM_COMPLETED, userId: user.id, person: task.client ?? undefined, summary: item.text, payload: { taskId, itemId, via: 'agent' } });
    return { done: item.text, remaining: items.filter((i) => !i.done).length, list: task.title };
  },
};

module.exports = { createTaskList, listTasks, completeTaskItem };
