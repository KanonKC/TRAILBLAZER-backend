import RedemptionClaimService from "./redemptionClaim.service";

// The real module opens Redis connections on import, which would keep Jest from exiting
jest.mock("@/libs/redis", () => ({ __esModule: true, default: {} }));

describe("RedemptionClaimService", () => {
    const redisClient = { set: jest.fn() };
    let service: RedemptionClaimService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new RedemptionClaimService(redisClient);
    });

    it("claims a redemption nobody has claimed yet, once, for a day", async () => {
        redisClient.set.mockResolvedValue("OK");
        await expect(service.claim("redemption-1", "tx")).resolves.toBe(true);
        expect(redisClient.set).toHaveBeenCalledWith("eventsub:redemption:redemption-1", "1", {
            condition: "NX",
            expiration: { type: "EX", value: 86400 },
        });
    });

    it("does not claim a redemption another delivery already claimed", async () => {
        redisClient.set.mockResolvedValue(null);
        await expect(service.claim("redemption-1", "tx")).resolves.toBe(false);
    });

    it("fails open when Redis is unreachable", async () => {
        redisClient.set.mockRejectedValue(new Error("redis down"));
        await expect(service.claim("redemption-1", "tx")).resolves.toBe(true);
    });
});
