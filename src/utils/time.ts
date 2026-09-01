export function generateTierExpireDate() {
    const now = new Date()
    return new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000))
}

export function parseRFC3339(value: string): Date {
    const date = new Date(value)
    if (isNaN(date.getTime())) {
        throw new Error(`Invalid RFC3339 date string: ${value}`)
    }
    return date
}