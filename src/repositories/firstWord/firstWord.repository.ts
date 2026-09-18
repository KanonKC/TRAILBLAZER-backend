import TLogger, { Layer } from "@/logging/logger";
import { prisma } from "@/libs/prisma";
import { FirstWord, FirstWordChatter, FirstWordCustomReply, FirstWordGreetCount } from "generated/prisma/client";
import { AddChatter, CreateCustomReply, CreateFirstWord, UpdateCustomReply, UpdateFirstWord, ListCustomerReplyRequest } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { FirstWordWidget } from "./response";
import { Pagination } from "@/services/response";

const logger = new TLogger(Layer.REPOSITORY);

export default class FirstWordRepository {
    constructor() { }

    async create(request: CreateFirstWord, transactionId?: string): Promise<FirstWordWidget> {
        try {
        return prisma.firstWord.create({
            data: {
                reply_message: request.reply_message,
                twitch_bot_id: request.twitch_bot_id,
                widget: {
                    create: {
                        overlay_key: request.overlay_key,
                        widget_type_slug: WidgetTypeSlug.FIRST_WORD,
                        twitch_id: request.twitch_id,
                        owner_id: request.owner_id,
                    }
                }
            },
            include: { 
                widget: {
                    include: {
                        widget_type: true
                    }
                }, 
                audio: true 
            }
        });
    } catch (error) {
            logger.setContext("repository.firstWord.create", transactionId).error({ message: "create failed", error: error as Error });
            throw error;
        }
    }

    async get(id: string, transactionId?: string) {
        try {
        return prisma.firstWord.findUnique({ 
            where: { id }, 
            include: { 
                widget: {
                    include: {
                        widget_type: true
                    }
                }, 
                audio: true 
            } 
        });
    } catch (error) {
            logger.setContext("repository.firstWord.get", transactionId).error({ message: "get failed", error: error as Error });
            throw error;
        }
    }

    async getByOwnerId(ownerId: string, transactionId?: string): Promise<FirstWordWidget | null> {
        try {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                owner_id_widget_type_slug: {
                    owner_id: ownerId,
                    widget_type_slug: WidgetTypeSlug.FIRST_WORD
                }
            }
        });
        return prisma.firstWord.findUnique({ 
            where: { widget_id: widget.id }, 
            include: { 
                widget: {
                    include: {
                        widget_type: true
                    }
                }, 
                audio: true 
            } 
        });
    } catch (error) {
            logger.setContext("repository.firstWord.getByOwnerId", transactionId).error({ message: "getByOwnerId failed", error: error as Error });
            throw error;
        }
    }

    async getByTwitchId(twitchId: string, transactionId?: string): Promise<FirstWordWidget | null> {
        try {
        const widget = await prisma.widget.findUniqueOrThrow({
            where: {
                owner_id_widget_type_slug: {
                    owner_id: twitchId,
                    widget_type_slug: WidgetTypeSlug.FIRST_WORD
                }
            }
        });
        return prisma.firstWord.findUnique({ 
            where: { widget_id: widget.id }, 
            include: { 
                widget: {
                    include: {
                        widget_type: true
                    }
                }, 
                audio: true 
            } 
        });
    } catch (error) {
            logger.setContext("repository.firstWord.getByTwitchId", transactionId).error({ message: "getByTwitchId failed", error: error as Error });
            throw error;
        }
    }

    async update(id: string, request: UpdateFirstWord, transactionId?: string): Promise<FirstWordWidget> {
        try {
        return prisma.firstWord.update({
            where: { id },
            data: request,
            include: { 
                widget: {
                    include: {
                        widget_type: true
                    }
                }, 
                audio: true 
            }
        });
    } catch (error) {
            logger.setContext("repository.firstWord.update", transactionId).error({ message: "update failed", error: error as Error });
            throw error;
        }
    }

    async delete(id: string, transactionId?: string): Promise<void> {
        try {
        await prisma.firstWord.delete({ where: { id } });
    } catch (error) {
            logger.setContext("repository.firstWord.delete", transactionId).error({ message: "delete failed", error: error as Error });
            throw error;
        }
    }

    async addChatter(request: AddChatter, transactionId?: string): Promise<FirstWordChatter> {
        try {
        return prisma.firstWordChatter.create({
            data: request
        });
    } catch (error) {
            logger.setContext("repository.firstWord.addChatter", transactionId).error({ message: "addChatter failed", error: error as Error });
            throw error;
        }
    }

    async getChatter(id: string, chatterId: string, transactionId?: string): Promise<FirstWordChatter | null> {
        try {
        return prisma.firstWordChatter.findUnique({
            where: {
                twitch_chatter_id_first_word_id: {
                    first_word_id: id,
                    twitch_chatter_id: chatterId
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.firstWord.getChatter", transactionId).error({ message: "getChatter failed", error: error as Error });
            throw error;
        }
    }

    async listChatters(id: string, transactionId?: string): Promise<[FirstWordChatter[], number]> {
        try {
        const res = await prisma.firstWordChatter.findMany({
            where: {
                first_word_id: id
            }
        });

        const count = res.length;
        return [res, count];
    } catch (error) {
            logger.setContext("repository.firstWord.listChatters", transactionId).error({ message: "listChatters failed", error: error as Error });
            throw error;
        }
    }

    async listChatterIdByChannelId(channelId: string, transactionId?: string): Promise<string[]> {
        try {
        const res = await prisma.firstWordChatter.findMany({
            where: {
                twitch_channel_id: channelId
            },
            select: {
                twitch_chatter_id: true
            }
        });
        return res.map(r => r.twitch_chatter_id);
    } catch (error) {
            logger.setContext("repository.firstWord.listChatterIdByChannelId", transactionId).error({ message: "listChatterIdByChannelId failed", error: error as Error });
            throw error;
        }
    }

    async getChattersByChannelId(channelId: string, transactionId?: string): Promise<FirstWordChatter[]> {
        try {
        return prisma.firstWordChatter.findMany({
            where: {
                twitch_channel_id: channelId
            }
        });
    } catch (error) {
            logger.setContext("repository.firstWord.getChattersByChannelId", transactionId).error({ message: "getChattersByChannelId failed", error: error as Error });
            throw error;
        }
    }

    async clearChatters(id: string, transactionId?: string): Promise<void> {
        try {
        await prisma.firstWordChatter.deleteMany({
            where: {
                first_word_id: id
            }
        });
    } catch (error) {
            logger.setContext("repository.firstWord.clearChatters", transactionId).error({ message: "clearChatters failed", error: error as Error });
            throw error;
        }
    }

    async getCustomReplyByTwitchId(firstWordId: string, twitchId: string, transactionId?: string): Promise<FirstWordCustomReply | null> {
        try {
        return prisma.firstWordCustomReply.findUnique({
            where: {
                twitch_chatter_id_first_word_id: {
                    first_word_id: firstWordId,
                    twitch_chatter_id: twitchId
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.firstWord.getCustomReplyByTwitchId", transactionId).error({ message: "getCustomReplyByTwitchId failed", error: error as Error });
            throw error;
        }
    }

    async createCustomReply(request: CreateCustomReply, transactionId?: string): Promise<void> {
        try {
        await prisma.firstWordCustomReply.create({
            data: request
        });
    } catch (error) {
            logger.setContext("repository.firstWord.createCustomReply", transactionId).error({ message: "createCustomReply failed", error: error as Error });
            throw error;
        }
    }

    async updateCustomReply(id: number, request: UpdateCustomReply, transactionId?: string): Promise<void> {
        try {
        await prisma.firstWordCustomReply.update({
            where: { id },
            data: request
        });
    } catch (error) {
            logger.setContext("repository.firstWord.updateCustomReply", transactionId).error({ message: "updateCustomReply failed", error: error as Error });
            throw error;
        }
    }

    async deleteCustomReply(id: number, transactionId?: string): Promise<void> {
        try {
        await prisma.firstWordCustomReply.delete({ where: { id } });
    } catch (error) {
            logger.setContext("repository.firstWord.deleteCustomReply", transactionId).error({ message: "deleteCustomReply failed", error: error as Error });
            throw error;
        }
    }

    async listCustomReplies(request: ListCustomerReplyRequest, pagination: Pagination, transactionId?: string): Promise<[FirstWordCustomReply[], number]> {
        try {
        const where: any = {
            first_word_id: request.first_word_id
        }

        if (request.search && request.search.length >= 3) {
            where.OR = [
                { twitch_chatter_id: { contains: request.search } },
                { reply_message: { contains: request.search } }
            ]
        }

        const data = await prisma.firstWordCustomReply.findMany({
            where,
            skip: (pagination.page - 1) * pagination.limit,
            take: pagination.limit,
            orderBy: {
                created_at: 'desc'
            },
            include: { audio: true }
        })

        const count = await prisma.firstWordCustomReply.count({
            where
        })

        return [data, count]
    } catch (error) {
            logger.setContext("repository.firstWord.listCustomReplies", transactionId).error({ message: "listCustomReplies failed", error: error as Error });
            throw error;
        }
    }

    async createOrIncrementGreetCount(firstWordId: string, chatterId: string, channelId: string, transactionId?: string): Promise<void> {
        try {
        await prisma.firstWordGreetCount.upsert({
            where: {
                twitch_chatter_id_twitch_channel_id: {
                    twitch_chatter_id: chatterId,
                    twitch_channel_id: channelId
                }
            },
            update: {
                count: { increment: 1 }
            },
            create: {
                twitch_chatter_id: chatterId,
                twitch_channel_id: channelId,
                count: 1,
                first_word_id: firstWordId
            }
        });
    } catch (error) {
            logger.setContext("repository.firstWord.createOrIncrementGreetCount", transactionId).error({ message: "createOrIncrementGreetCount failed", error: error as Error });
            throw error;
        }
    }

    async getGreetCount(chatterId: string, channelId: string, transactionId?: string): Promise<FirstWordGreetCount | null> {
        try {
        return prisma.firstWordGreetCount.findUnique({
            where: {
                twitch_chatter_id_twitch_channel_id: {
                    twitch_chatter_id: chatterId,
                    twitch_channel_id: channelId
                }
            }
        });
    } catch (error) {
            logger.setContext("repository.firstWord.getGreetCount", transactionId).error({ message: "getGreetCount failed", error: error as Error });
            throw error;
        }
    }
}
