import { randomInt } from 'crypto';
import { BadRequestError } from '@/errors';
export function poolState(pool: {
  deleted_at: Date | null;
  moderation_status: string;
  items: unknown[];
}) {
  if (pool.deleted_at) return 'DELETED';
  if (pool.moderation_status !== 'VISIBLE') return 'HIDDEN';
  return pool.items.length ? 'READY' : 'EMPTY';
}
export function drawItem<Item extends { id: string }>(
  items: Item[],
  mode: string,
  settings: { item_id: string; weight: number }[],
  random = () => randomInt(0, 2 ** 47) / 2 ** 47
): Item {
  if (!items.length) throw new BadRequestError('Pool is empty');
  const weights = items.map((item) =>
    mode === 'WEIGHTED' ? (settings.find((setting) => setting.item_id === item.id)?.weight ?? 1) : 1
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0) || !Number.isFinite(total))
    throw new BadRequestError('Invalid weights');
  let cursor = random() * total;
  for (const [index, item] of items.entries()) {
    cursor -= weights[index];
    if (cursor < 0) return item;
  }
  return items[items.length - 1];
}
export function chatMessage(
  itemMessage: string | null | undefined,
  defaultMessage: string | null | undefined,
  user: string,
  item: string | null
) {
  const template = itemMessage || defaultMessage || '';
  return Array.from(
    template.replace(/\{(user|item)\}/g, (_, variable) =>
      variable === 'user' ? user || '' : item || ''
    )
  )
    .slice(0, 500)
    .join('');
}
