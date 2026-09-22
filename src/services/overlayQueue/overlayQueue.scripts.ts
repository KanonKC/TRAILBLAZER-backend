import redis from "@/libs/redis"

/**
 * Redis runs one command at a time, but a *sequence* of commands issued from
 * Node is not atomic — another instance (or another concurrent webhook on this
 * one) can slip in between them. These three scripts are the places where that
 * gap would reintroduce the very bug the queue exists to fix:
 *
 *   GET busy -> (both see it free) -> LPOP, LPOP -> two items play at once.
 *
 * A script is sent as one unit and Redis finishes it before accepting anything
 * else, so the check and the mutation can never be split.
 */

/**
 * KEYS: list, job, dedupe, due
 * ARGV: jobId, jobJson, ttlMs, maxItems, dedupeTtlMs, nowMs, queueMember, priority
 * Returns: { 1, jobId } | { 0, reason }
 */
export const ENQUEUE_SCRIPT = `
local dedupeTtl = tonumber(ARGV[5])
if dedupeTtl > 0 then
  if redis.call("SET", KEYS[3], "1", "NX", "PX", dedupeTtl) == false then
    return {0, "duplicate"}
  end
end

if redis.call("LLEN", KEYS[1]) >= tonumber(ARGV[4]) then
  return {0, "queue_full"}
end

redis.call("SET", KEYS[2], ARGV[2], "PX", tonumber(ARGV[3]))

if ARGV[8] == "front" then
  redis.call("LPUSH", KEYS[1], ARGV[1])
else
  redis.call("RPUSH", KEYS[1], ARGV[1])
end

-- NX so an enqueue never drags a cooling-down queue forward past its gap.
redis.call("ZADD", KEYS[4], "NX", tonumber(ARGV[6]), ARGV[7])
return {1, ARGV[1]}
`

/**
 * KEYS: busy, list, due
 * ARGV: lockToken, bootstrapMs, jobKeyPrefix, queueMember, maxSkip, nowMs
 * Returns: job JSON, or false when the queue is cooling down, held, or drained.
 */
export const TRY_DISPATCH_SCRIPT = `
-- The gap is re-checked here, inside the same script that takes the lock.
-- A sweeper decides to pump from a snapshot of the due times; without this
-- check, one that read "due" just before the current item finished would grab
-- the lock the instant it was released and skip the gap entirely.
local due = redis.call("ZSCORE", KEYS[3], ARGV[4])
if due and tonumber(due) > tonumber(ARGV[6]) then
  return false
end

if redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", tonumber(ARGV[2])) == false then
  return false
end

for _ = 1, tonumber(ARGV[5]) do
  local id = redis.call("LPOP", KEYS[2])
  if not id then
    redis.call("DEL", KEYS[1])
    redis.call("ZREM", KEYS[3], ARGV[4])
    return false
  end

  local jobKey = ARGV[3] .. id
  local job = redis.call("GET", jobKey)
  if job then
    redis.call("DEL", jobKey)
    return job
  end
  -- job expired while it waited; keep popping rather than playing stale content
end

return false
`

/**
 * KEYS: busy, due
 * ARGV: lockToken, nextDueMs, queueMember
 *
 * The lock is only released by whoever still owns it — a slow instance must not
 * release a lock a sweeper already took over after it expired. The gap is
 * applied here rather than in the caller's timer so a sweeper-driven recovery
 * honours it too.
 */
export const FINISH_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
end
redis.call("ZADD", KEYS[2], "GT", tonumber(ARGV[2]), ARGV[3])
return 1
`

const shaCache = new Map<string, string>()

/**
 * Runs a script by its SHA, falling back to a full EVAL (and re-caching) when
 * Redis has not seen it — which happens after a Redis restart or a FLUSH.
 */
export async function runScript(
    script: string,
    keys: string[],
    args: string[]
): Promise<unknown> {
    let sha = shaCache.get(script)
    if (!sha) {
        sha = await redis.scriptLoad(script)
        shaCache.set(script, sha)
    }

    try {
        return await redis.evalSha(sha, { keys, arguments: args })
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("NOSCRIPT")) {
            throw error
        }
        shaCache.delete(script)
        return await redis.eval(script, { keys, arguments: args })
    }
}
