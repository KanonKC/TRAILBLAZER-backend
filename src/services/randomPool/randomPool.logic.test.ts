import { configSchema, poolSchema } from './request';
import { chatMessage, drawItem, poolState } from './randomPool.logic';
const itemId = '11111111-1111-4111-8111-111111111111';
const poolId = '22222222-2222-4222-8222-222222222222';
const config = {
  name: 'Test',
  pool_id: poolId,
  twitch_reward_id: 'reward',
  mode: 'UNIFORM',
  visualization: 'SHUFFLE',
  items: [],
};
describe('Random Pool validation and draws', () => {
  it('rejects public pools, empty items, long names and item counts over 50', () => {
    expect(poolSchema.safeParse({ name: 'Pool', visibility: 'PUBLIC', items: [] }).success).toBe(
      false
    );
    expect(poolSchema.safeParse({ name: 'Pool', items: [{}] }).success).toBe(false);
    expect(poolSchema.safeParse({ name: 'Pool', items: [{ name: 'a'.repeat(33) }] }).success).toBe(
      false
    );
    expect(
      poolSchema.safeParse({
        name: 'Pool',
        items: Array.from({ length: 51 }, () => ({ name: 'item' })),
      }).success
    ).toBe(false);
  });
  it('accepts name-only and image-only items, including an empty pool', () => {
    expect(
      poolSchema.parse({ name: 'Pool', items: [{ name: 'item' }, { image_key: 'key' }] }).items
    ).toHaveLength(2);
    expect(poolSchema.parse({ name: 'Pool', items: [] }).items).toHaveLength(0);
  });
  it('rejects duplicate item IDs and duplicate settings', () => {
    expect(
      poolSchema.safeParse({
        name: 'Pool',
        items: [
          { id: itemId, name: 'one' },
          { id: itemId, name: 'two' },
        ],
      }).success
    ).toBe(false);
    expect(
      configSchema.safeParse({ ...config, items: [{ item_id: itemId }, { item_id: itemId }] })
        .success
    ).toBe(false);
  });
  it.each([
    ['UNIFORM', 'SHUFFLE', true],
    ['UNIFORM', 'SLIDE', true],
    ['UNIFORM', 'WHEEL', false],
    ['WEIGHTED', 'SHUFFLE', false],
    ['WEIGHTED', 'SLIDE', false],
    ['WEIGHTED', 'WHEEL', true],
  ])('validates %s × %s', (mode, visualization, accepted) => {
    expect(configSchema.safeParse({ ...config, mode, visualization }).success).toBe(accepted);
  });
  it.each([0, -1, Infinity, NaN])('rejects invalid weight %s', (weight) => {
    expect(
      configSchema.safeParse({ ...config, items: [{ item_id: itemId, weight }] }).success
    ).toBe(false);
  });
  it('rejects messages over 500', () => {
    expect(
      configSchema.safeParse({ ...config, default_chat_message: 'a'.repeat(501) }).success
    ).toBe(false);
  });
  it('uses uniform odds regardless of configured weight', () => {
    const items = [{ id: 'one' }, { id: 'two' }];
    expect(drawItem(items, 'UNIFORM', [{ item_id: 'one', weight: 99 }], () => 0.5).id).toBe('two');
  });
  it('honours weighted boundaries and defaults new item weight to 1', () => {
    const items = [{ id: 'one' }, { id: 'two' }, { id: 'new' }];
    const weights = [
      { item_id: 'one', weight: 8 },
      { item_id: 'two', weight: 1 },
    ];
    expect(drawItem(items, 'WEIGHTED', weights, () => 0.799).id).toBe('one');
    expect(drawItem(items, 'WEIGHTED', weights, () => 0.8).id).toBe('two');
    expect(drawItem(items, 'WEIGHTED', weights, () => 0.9).id).toBe('new');
    expect(() => drawItem([], 'UNIFORM', [])).toThrow('empty');
  });
  it('uses item/default precedence, replaces missing variables, and truncates after replacement', () => {
    expect(chatMessage('{user} got {item}', 'default', 'viewer', null)).toBe('viewer got ');
    expect(chatMessage('', '{item}', '', 'item')).toBe('item');
    expect(chatMessage(null, null, 'viewer', 'item')).toBe('');
    expect(Array.from(chatMessage('{user}', null, '😀'.repeat(600), '')).length).toBe(500);
  });
  it.each([
    [new Date(), 'VISIBLE', [{}], 'DELETED'],
    [null, 'HIDDEN', [{}], 'HIDDEN'],
    [null, 'VISIBLE', [], 'EMPTY'],
    [null, 'VISIBLE', [{}], 'READY'],
  ])('reports pool state', (deleted_at, moderation_status, items, expected) => {
    expect(poolState({ deleted_at, moderation_status, items })).toBe(expected);
  });
});
