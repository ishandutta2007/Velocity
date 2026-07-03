import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { AgentOrchestrator } from '../src/orchestrator/index.js';
import * as costTable from '../src/db/tables/cost-events.js';
import * as swarmsTable from '../src/db/tables/swarms.js';
import * as agentsTable from '../src/db/tables/agents.js';
import { resetForTests, getDb } from '../src/db/index.js';
import { loadConfig, getConfig, type Config } from '../src/config/index.js';

describe('Cost Caps', () => {
  let engine: AgentOrchestrator;
  const oldConfig = getConfig();

  beforeEach(async () => {
    await resetForTests();
    engine = new AgentOrchestrator();
  });

  afterEach(() => {
    process.env.MAX_COST_USD = oldConfig.maxCostUsd?.toString() ?? '0';
    process.env.COST_OVERFLOW_ACTION = oldConfig.costOverflowAction;
    loadConfig();
  });

  it('kills the agent when the cost limit is exceeded and action is "kill"', async () => {
    process.env.MAX_COST_USD = '0.1';
    process.env.COST_OVERFLOW_ACTION = 'kill';
    loadConfig();

    const agent = engine.createAgent('do something expensive', { model: 'mock' });
    const db = await getDb();
    await agent.persist();

    await costTable.record({
      agentId: agent.id,
      swarmId: null,
      provider: 'mock',
      model: 'mock',
      inputTokens: 1000,
      outputTokens: 1000,
      costUsd: 1.0,
    });

    const status = await agent.run();
    expect(status.state).toBe('failed');
    expect(agent.getStatus().error).toMatch(/Cost cap exceeded/);
  });

  it('pauses the agent when the cost limit is exceeded and action is "pause"', async () => {
    process.env.MAX_COST_USD = '0.1';
    process.env.COST_OVERFLOW_ACTION = 'pause';
    loadConfig();

    const agent = engine.createAgent('do something expensive', { model: 'mock' });
    const db = await getDb();
    await agent.persist();

    // Simulate high cost directly in DB
    await costTable.record({
      agentId: agent.id,
      swarmId: null,
      provider: 'mock',
      model: 'mock',
      inputTokens: 1000,
      outputTokens: 1000,
      costUsd: 1.0, // Exceeds 0.1
    });

    const runPromise = agent.run();

    // Wait for the agent to reach paused state
    await new Promise(r => setTimeout(r, 200));
    expect(agent.getStatus().state).toBe('paused_cost_limit');

    // Approve
    agent.approveHitL(true);

    // Wait a bit more to transition state to waiting_goal_approval
    await new Promise(r => setTimeout(r, 200));
    const status = agent.getStatus();

    // Mock gateway should eventually lead to planning then waiting_goal_approval
    expect(status.state).toBe('waiting_goal_approval');
  });

  it('downgrades the agent model when the cost limit is exceeded and action is "downgrade"', async () => {
    process.env.MAX_COST_USD = '0.1';
    process.env.COST_OVERFLOW_ACTION = 'downgrade';
    loadConfig();

    // ensure defaultModel matches what we downgrade to
    const defaultModel = getConfig().defaultModel;

    const agent = engine.createAgent('do something expensive', { model: 'expensive-model' });
    const db = await getDb();
    await agent.persist();

    // Simulate high cost directly in DB
    await costTable.record({
      agentId: agent.id,
      swarmId: null,
      provider: 'mock',
      model: 'mock',
      inputTokens: 1000,
      outputTokens: 1000,
      costUsd: 1.0, // Exceeds 0.1
    });

    const runPromise = agent.run();
    await new Promise(r => setTimeout(r, 200));

    expect(agent.config.model).toBe(defaultModel);
  });
});
