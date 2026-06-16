import { prisma } from "@/libs/prisma";
import { FirstWord, FirstWordChatter, FirstWordCustomReply, FirstWordGreetCount } from "generated/prisma/client";
import { AddChatter, CreateCustomReply, CreateFirstWord, UpdateCustomReply, UpdateFirstWord, ListCustomerReplyRequest } from "./request";
import { WidgetTypeSlug } from "@/services/widget/constant";
import { FirstWordWidget } from "./response";
import { Pagination } from "@/services/response";

export default class FirstWordRepository {
    constructor() { }

    async create(request: CreateFirstWord): Promise<FirstWordWidget> {
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
    }

    async get(id: string) {
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
    }

    async getByOwnerId(ownerId: string): Promise<FirstWordWidget | null> {
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
    }

    async getByTwitchId(twitchId: string): Promise<FirstWordWidget | null> {
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
    }

    async update(id: string, request: UpdateFirstWord): Promise<FirstWordWidget> {
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
    }

    async delete(id: string): Promise<void> {
        await prisma.firstWord.delete({ where: { id } });
    }

    async addChatter(request: AddChatter): Promise<FirstWordChatter> {
        return prisma.firstWordChatter.create({
            data: request
        });
    }

    async getChatter(id: string, chatterId: string): Promise<FirstWordChatter | null> {
        return prisma.firstWordChatter.findUnique({
            where: {
                twitch_chatter_id_first_word_id: {
                    first_word_id: id,
                    twitch_chatter_id: chatterId
                }
            }
        });
    }

    async listChatters(id: string): Promise<[FirstWordChatter[], number]> {
        const res = await prisma.firstWordChatter.findMany({
            where: {
                first_word_id: id
            }
        });

        const count = res.length;
        return [res, count];
    }

    async listChatterIdByChannelId(channelId: string): Promise<string[]> {
        const res = await prisma.firstWordChatter.findMany({
            where: {
                twitch_channel_id: channelId
            },
            select: {
                twitch_chatter_id: true
            }
        });
        return res.map(r => r.twitch_chatter_id);
    }

    async getChattersByChannelId(channelId: string): Promise<FirstWordChatter[]> {
        return prisma.firstWordChatter.findMany({
            where: {
                twitch_channel_id: channelId
            }
        });
    }

    async clearChatters(id: string): Promise<void> {
        await prisma.firstWordChatter.deleteMany({
            where: {
                first_word_id: id
            }
        });
    }

    async getCustomReplyByTwitchId(firstWordId: string, twitchId: string): Promise<FirstWordCustomReply | null> {
        return prisma.firstWordCustomReply.findUnique({
            where: {
                twitch_chatter_id_first_word_id: {
                    first_word_id: firstWordId,
                    twitch_chatter_id: twitchId
                }
            }
        });
    }

    async createCustomReply(request: CreateCustomReply): Promise<void> {
        await prisma.firstWordCustomReply.create({
            data: request
        });
    }

    async updateCustomReply(id: number, request: UpdateCustomReply): Promise<void> {
        await prisma.firstWordCustomReply.update({
            where: { id },
            data: request
        });
    }

    async deleteCustomReply(id: number): Promise<void> {
        await prisma.firstWordCustomReply.delete({ where: { id } });
    }

    async listCustomReplies(request: ListCustomerReplyRequest, pagination: Pagination): Promise<[FirstWordCustomReply[], number]> {
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
    }

    async createOrIncrementGreetCount(firstWordId: string, chatterId: string, channelId: string): Promise<void> {
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
    }

    async getGreetCount(chatterId: string, channelId: string): Promise<FirstWordGreetCount | null> {
        return prisma.firstWordGreetCount.findUnique({
            where: {
                twitch_chatter_id_twitch_channel_id: {
                    twitch_chatter_id: chatterId,
                    twitch_channel_id: channelId
                }
            }
        });
    }
}
