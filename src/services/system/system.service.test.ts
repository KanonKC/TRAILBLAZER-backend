import SystemService from "./system.service";
import { prisma } from "../../libs/prisma";
import redis from "../../libs/redis";
import s3 from "../../libs/awsS3";
import { twitchAppAPI } from "../../libs/twurple";

jest.mock("../../libs/prisma", () => ({
    prisma: {
        $queryRaw: jest.fn(),
    },
}));

jest.mock("../../libs/redis", () => ({
    ping: jest.fn(),
}));

jest.mock("../../libs/awsS3", () => ({
    healthCheck: jest.fn(),
}));

jest.mock("../../libs/twurple", () => ({
    twitchAppAPI: {
        getTokenInfo: jest.fn(),
    },
}));

jest.mock("crypto", () => ({
    randomUUID: jest.fn().mockReturnValue("mocked_uuid"),
}));

describe("SystemService", () => {
    let service: SystemService;

    beforeEach(() => {
        service = new SystemService();
        jest.clearAllMocks();
    });

    describe("getHealth", () => {
        it("should return healthy status for all services", async () => {
            (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ 1: 1 }]);
            (redis.ping as jest.Mock).mockResolvedValue("PONG");
            (s3.healthCheck as jest.Mock).mockResolvedValue(true);
            (twitchAppAPI.getTokenInfo as jest.Mock).mockResolvedValue({ clientId: "id" });

            const result = await service.getHealth();

            expect(result.database).toBe(true);
            expect(result.libs.redis).toBe(true);
            expect(result.libs.s3).toBe(true);
            expect(result.libs.twurple).toBe(true);
        });

        it("should handle failures in database and redis", async () => {
            (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error("DB Down"));
            (redis.ping as jest.Mock).mockRejectedValue(new Error("Redis Down"));
            (s3.healthCheck as jest.Mock).mockResolvedValue(false);
            (twitchAppAPI.getTokenInfo as jest.Mock).mockRejectedValue(new Error("Twitch Error"));

            const result = await service.getHealth();

            expect(result.database).toBe(false);
            expect(result.libs.redis).toBe(false);
            expect(result.libs.s3).toBe(false);
            expect(result.libs.twurple).toBe(false);
        });

        it("should handle twurple retry/fallback logic", async () => {
            (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ 1: 1 }]);
            (redis.ping as jest.Mock).mockResolvedValue("PONG");
            (s3.healthCheck as jest.Mock).mockResolvedValue(true);
            
            // First call fails, second call succeeds
            (twitchAppAPI.getTokenInfo as jest.Mock)
                .mockRejectedValueOnce(new Error("First hit failed"))
                .mockResolvedValueOnce({ clientId: "id" });

            const result = await service.getHealth();

            expect(result.libs.twurple).toBe(true);
        });
    });
});
