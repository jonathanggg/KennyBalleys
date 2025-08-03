"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.waLabelAssociationKey = exports.waMessageID = exports.waChatKey = void 0;
const cron_1 = require("cron");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const LabelAssociation_1 = require("../Types/LabelAssociation");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const make_ordered_dictionary_1 = __importDefault(require("./make-ordered-dictionary"));
const object_repository_1 = require("./object-repository");
const waChatKey = (pin) => ({
    key: (c) => (pin ? (c.pinned ? "1" : "0") : "") +
        (c.archived ? "0" : "1") +
        (c.conversationTimestamp
            ? c.conversationTimestamp.toString(16).padStart(8, "0")
            : "") +
        c.id,
    compare: (k1, k2) => k2.localeCompare(k1),
});
exports.waChatKey = waChatKey;
const waMessageID = (m) => m.key.id || "";
exports.waMessageID = waMessageID;
exports.waLabelAssociationKey = {
    key: (la) => la.type === LabelAssociation_1.LabelAssociationType.Chat
        ? la.chatId + la.labelId
        : la.chatId + la.messageId + la.labelId,
    compare: (k1, k2) => k2.localeCompare(k1),
};
const makeMessagesDictionary = () => (0, make_ordered_dictionary_1.default)(exports.waMessageID);
const predefinedLabels = Object.freeze({
    "0": {
        id: "0",
        name: "New customer",
        predefinedId: "0",
        color: 0,
        deleted: false,
    },
    "1": {
        id: "1",
        name: "New order",
        predefinedId: "1",
        color: 1,
        deleted: false,
    },
    "2": {
        id: "2",
        name: "Pending payment",
        predefinedId: "2",
        color: 2,
        deleted: false,
    },
    "3": {
        id: "3",
        name: "Paid",
        predefinedId: "3",
        color: 3,
        deleted: false,
    },
    "4": {
        id: "4",
        name: "Order completed",
        predefinedId: "4",
        color: 4,
        deleted: false,
    },
});
exports.default = ({ logger: _logger, socket, db, filterChats, autoDeleteStatusMessage, }) => {
    const isOlderThan24Hours = (timestamp) => {
        const currentTime = (0, moment_timezone_1.default)(new Date()).tz("Asia/Jakarta");
        const hoursDifference = currentTime.diff((0, moment_timezone_1.default)(timestamp * 1000).tz("Asia/Jakarta"), "hours");
        return hoursDifference > 24;
    };
    if (autoDeleteStatusMessage) {
        if (typeof autoDeleteStatusMessage === "boolean") {
            autoDeleteStatusMessage = {
                cronTime: "0 0 * * *",
                timeZone: "Asia/Jakarta",
            };
        }
        const update = {
            $set: {
                messages: {
                    $filter: {
                        input: "$messages",
                        cond: {
                            $not: {
                                $or: [],
                            },
                        },
                    },
                },
            },
        };
        new cron_1.CronJob(autoDeleteStatusMessage.cronTime, // cronTime
        async () => {
            var _a, _b, _c, _d, _e;
            const statusMesasges = await chats.findOne({ id: "status@broadcast" }, { projection: { _id: 0 } });
            if (statusMesasges) {
                for (const m of statusMesasges === null || statusMesasges === void 0 ? void 0 : statusMesasges.messages) {
                    if (isOlderThan24Hours(typeof ((_a = m.message) === null || _a === void 0 ? void 0 : _a.messageTimestamp) === "number"
                        ? (_b = m.message) === null || _b === void 0 ? void 0 : _b.messageTimestamp
                        : (_d = (_c = m.message) === null || _c === void 0 ? void 0 : _c.messageTimestamp) === null || _d === void 0 ? void 0 : _d.low)) {
                        update.$set.messages.$filter.cond.$not.$or.push({
                            $eq: ["$$this.message.key.id", (_e = m.message) === null || _e === void 0 ? void 0 : _e.key.id],
                        });
                    }
                }
                if (update.$set.messages.$filter.cond.$not.$or.length > 0) {
                    const updateResult = await chats.updateOne({ id: "status@broadcast" }, [update]);
                    logger === null || logger === void 0 ? void 0 : logger.debug(updateResult, "updated statusMessages");
                }
            }
        }, () => {
            logger === null || logger === void 0 ? void 0 : logger.debug("cleared statusMessages");
        }, true, // start
        autoDeleteStatusMessage === null || autoDeleteStatusMessage === void 0 ? void 0 : autoDeleteStatusMessage.timeZone);
    }
    const logger = _logger ||
        Defaults_1.DEFAULT_CONNECTION_CONFIG.logger.child({ stream: "mongo-store" });
    const chats = db.collection("chats");
    const messages = {};
    const contacts = db.collection("contacts");
    const groupMetadata = {};
    const presences = {};
    const state = { connection: "close" };
    const labels = new object_repository_1.ObjectRepository(predefinedLabels);
    const labelAssociations = db.collection("labelAssociations");
    const assertMessageList = (jid) => {
        if (!messages[jid]) {
            messages[jid] = makeMessagesDictionary();
        }
        return messages[jid];
    };
    const labelsUpsert = (newLabels) => {
        for (const label of newLabels) {
            labels.upsertById(label.id, label);
        }
    };
    // const contactsUpsert = async (newContacts: Contact[]) => {
    // 	const oldContacts = new Set(await contacts
    // 		.find({}, { projection: { _id: 0 } })
    // 		.toArray());
    // 	for (const contact of newContacts) {
    // 	}
    // };
    const bind = (ev) => {
        ev.on("connection.update", (update) => {
            Object.assign(state, update);
        });
        ev.on("messaging-history.set", async ({ chats: newChats, contacts: newContacts, messages: newMessages, isLatest }) => {
            var _a;
            if (isLatest) {
                await chats.drop();
                await contacts.drop();
                for (const id in messages) {
                    delete messages[id];
                }
            }
            if (filterChats) {
                newChats = newChats
                    .map((chat) => {
                    var _a;
                    if ((_a = chat.messages) === null || _a === void 0 ? void 0 : _a.some((m) => { var _a, _b; return !((_a = m.message) === null || _a === void 0 ? void 0 : _a.message) && ((_b = m.message) === null || _b === void 0 ? void 0 : _b.messageStubType); })) {
                        return undefined;
                    }
                    return chat;
                })
                    .filter(Boolean);
            }
            if (newChats.length) {
                const chatsAdded = await chats.bulkWrite(newChats.map((chat) => {
                    return {
                        insertOne: {
                            document: chat,
                        },
                    };
                }));
                logger.debug({ chatsAdded: chatsAdded.insertedCount }, "synced chats");
            }
            else {
                logger.debug("no chats added");
            }
            const oldContacts = await contacts.bulkWrite(newContacts.map((contact) => {
                return {
                    insertOne: {
                        document: contact,
                    },
                };
            }));
            logger.debug({ insertedContacts: oldContacts.insertedCount }, "synced contacts");
            if (!oldContacts.insertedCount) {
                throw new Error("no contacts added");
            }
            for (const msg of newMessages) {
                const jid = msg.key.remoteJid;
                const list = assertMessageList(jid);
                list.upsert(msg, "prepend");
                const chat = await chats.findOne({ id: jid }, { projection: { _id: 0 } });
                if (chat) {
                    ((_a = chat.messages) === null || _a === void 0 ? void 0 : _a.push({ message: msg })) ||
                        (chat.messages = [{ message: msg }]);
                    await chats.findOneAndUpdate({ id: jid }, { $set: chat }, { upsert: true });
                }
                else {
                    logger.debug({ jid }, "chat not found");
                }
            }
            logger.debug({ messages: newMessages.length }, "synced messages");
        });
        ev.on("contacts.upsert", async (Contacts) => {
            for (const contact of Contacts) {
                await contacts.updateOne({ id: contact.id }, { $set: contact }, { upsert: true });
            }
            logger === null || logger === void 0 ? void 0 : logger.debug({ contactsUpserted: Contacts.length }, "contacts upserted");
        });
        ev.on("contacts.update", async (updates) => {
            for (const update of updates) {
                const contact = await contacts.findOne({ id: update.id }, { projection: { _id: 0 } });
                if (contact) {
                    Object.assign(contact, update);
                    await contacts.updateOne({ id: update.id }, { $set: contact }, { upsert: true });
                }
                else {
                    logger.debug("got update for non-existent contact");
                }
            }
        });
        ev.on("chats.upsert", async (newChats) => {
            await chats.bulkWrite(newChats.map((chat) => {
                return {
                    updateOne: {
                        filter: { id: chat.id },
                        update: { $set: chat },
                        upsert: true,
                    },
                };
            }));
        });
        ev.on("chats.update", async (updates) => {
            // try {
            for (const update of updates) {
                const chat = await chats.findOneAndUpdate({ id: update.id }, {
                    $set: update,
                }, { upsert: true });
                if (!chat) {
                    logger.debug("got update for non-existant chat");
                }
            }
        });
        ev.on("labels.edit", (label) => {
            if (label.deleted) {
                return labels.deleteById(label.id);
            }
            // WhatsApp can store only up to 20 labels
            if (labels.count() < 20) {
                return labels.upsertById(label.id, label);
            }
            logger.error("Labels count exceed");
        });
        ev.on("labels.association", async ({ type, association }) => {
            switch (type) {
                case "add":
                    await labelAssociations.updateOne({ id: (association === null || association === void 0 ? void 0 : association.chatId) || (association === null || association === void 0 ? void 0 : association.labelId) }, { $set: association }, { upsert: true });
                    break;
                case "remove":
                    await labelAssociations.deleteOne({
                        id: (association === null || association === void 0 ? void 0 : association.chatId) || (association === null || association === void 0 ? void 0 : association.labelId),
                    });
                    break;
                default:
                    logger.error(`unknown operation type [${type}]`);
            }
        });
        ev.on("presence.update", ({ id, presences: update }) => {
            presences[id] = presences[id] || {};
            Object.assign(presences[id], update);
        });
        ev.on("chats.delete", async (deletions) => {
            for (const item of deletions) {
                await chats.deleteOne({ id: item });
            }
        });
        ev.on("messages.upsert", async ({ messages: newMessages, type }) => {
            // try {
            switch (type) {
                case "append":
                case "notify":
                    for (const msg of newMessages) {
                        const jid = (0, WABinary_1.jidNormalizedUser)(msg.key.remoteJid);
                        const list = assertMessageList(jid);
                        list.upsert(msg, "append");
                        const chat = await chats.findOne({ id: jid });
                        if (type === "notify") {
                            if (!chat) {
                                ev.emit("chats.upsert", [
                                    {
                                        id: jid,
                                        conversationTimestamp: (0, Utils_1.toNumber)(msg.messageTimestamp),
                                        unreadCount: 1,
                                    },
                                ]);
                            }
                            else {
                                chat.messages
                                    ? chat.messages.push({ message: msg })
                                    : (chat.messages = [{ message: msg }]);
                                await chats.updateOne({ id: jid }, { $set: chat }, { upsert: true });
                            }
                        }
                    }
                    break;
            }
        });
        ev.on("messages.update", (updates) => {
            var _a;
            for (const { update, key } of updates) {
                const list = assertMessageList((0, WABinary_1.jidNormalizedUser)(key.remoteJid));
                if (update === null || update === void 0 ? void 0 : update.status) {
                    const listStatus = (_a = list.get(key.id)) === null || _a === void 0 ? void 0 : _a.status;
                    if (listStatus && (update === null || update === void 0 ? void 0 : update.status) <= listStatus) {
                        logger.debug({ update, storedStatus: listStatus }, "status stored newer then update");
                        delete update.status;
                        logger.debug({ update }, "new update object");
                    }
                }
                const result = list.updateAssign(key.id, update);
                if (!result) {
                    logger.debug("got update for non-existent message");
                }
            }
        });
        ev.on("messages.delete", (item) => {
            if ("all" in item) {
                const list = messages[item.jid];
                list === null || list === void 0 ? void 0 : list.clear();
            }
            else {
                const jid = item.keys[0].remoteJid;
                const list = messages[jid];
                if (list) {
                    const idSet = new Set(item.keys.map((k) => k.id));
                    list.filter((m) => !idSet.has(m.key.id));
                }
            }
        });
        ev.on("groups.update", (updates) => {
            for (const update of updates) {
                const id = update.id;
                if (groupMetadata[id]) {
                    Object.assign(groupMetadata[id], update);
                }
                else {
                    logger.debug({ update }, "got update for non-existant group metadata");
                }
            }
        });
        ev.on("group-participants.update", ({ id, participants, action }) => {
            const metadata = groupMetadata[id];
            if (metadata) {
                switch (action) {
                    case "add":
                        metadata.participants.push(...participants.map((id) => ({
                            id,
                            isAdmin: false,
                            isSuperAdmin: false,
                        })));
                        break;
                    case "demote":
                    case "promote":
                        for (const participant of metadata.participants) {
                            if (participants.includes(participant.id)) {
                                participant.isAdmin = action === "promote";
                            }
                        }
                        break;
                    case "remove":
                        metadata.participants = metadata.participants.filter((p) => !participants.includes(p.id));
                        break;
                }
            }
        });
        ev.on("message-receipt.update", (updates) => {
            for (const { key, receipt } of updates) {
                const obj = messages[key.remoteJid];
                const msg = obj === null || obj === void 0 ? void 0 : obj.get(key.id);
                if (msg) {
                    (0, Utils_1.updateMessageWithReceipt)(msg, receipt);
                }
            }
        });
        ev.on("messages.reaction", (reactions) => {
            for (const { key, reaction } of reactions) {
                const obj = messages[key.remoteJid];
                const msg = obj === null || obj === void 0 ? void 0 : obj.get(key.id);
                if (msg) {
                    (0, Utils_1.updateMessageWithReaction)(msg, reaction);
                }
            }
        });
    };
    const toJSON = () => ({
        chats,
        contacts,
        messages,
        labels,
        labelAssociations,
    });
    // TODO: replace upsert logic by corresponding mongodb collection methods
    const fromJSON = async (json) => {
        await chats.updateMany({}, { $set: { ...json.chats } }, { upsert: true });
        await labelAssociations.updateMany({}, { $set: { ...(json.labelAssociations || []) } }, { upsert: true });
        const contactsCollection = db.collection("contacts");
        await contactsCollection.updateMany({}, { $set: { ...Object.values(json.contacts) } }, { upsert: true });
        //
        // contactsUpsert(Object.values(json.contacts))
        labelsUpsert(Object.values(json.labels || {}));
        for (const jid in json.messages) {
            const list = assertMessageList(jid);
            for (const msg of json.messages[jid]) {
                list.upsert(WAProto_1.proto.WebMessageInfo.fromObject(msg), "append");
            }
        }
    };
    /**
     * Retrieves a chat object by its ID.
     *
     * @param {string} jid - The ID of the chat.
     * @return {Promise<Chat|null>} A promise that resolves to the chat object if found, or null if not found.
     */
    const getChatById = async (jid) => {
        return await chats.findOne({ id: jid }, { projection: { _id: 0 } });
    };
    return {
        chats,
        contacts,
        messages,
        groupMetadata,
        state,
        presences,
        labels,
        labelAssociations,
        bind,
        /** loads messages from the store, if not found -- uses the legacy connection */
        loadMessages: async (jid, count, cursor) => {
            const list = assertMessageList(jid);
            const mode = !cursor || "before" in cursor ? "before" : "after";
            const cursorKey = !!cursor
                ? "before" in cursor
                    ? cursor.before
                    : cursor.after
                : undefined;
            const cursorValue = cursorKey ? list.get(cursorKey.id) : undefined;
            let messages;
            if (list && mode === "before" && (!cursorKey || cursorValue)) {
                if (cursorValue) {
                    const msgIdx = list.array.findIndex((m) => m.key.id === (cursorKey === null || cursorKey === void 0 ? void 0 : cursorKey.id));
                    messages = list.array.slice(0, msgIdx);
                }
                else {
                    messages = list.array;
                }
                const diff = count - messages.length;
                if (diff < 0) {
                    messages = messages.slice(-count); // get the last X messages
                }
            }
            else {
                messages = [];
            }
            return messages;
        },
        /**
         * Get all available labels for profile
         *
         * Keep in mind that the list is formed from predefined tags and tags
         * that were "caught" during their editing.
         */
        getLabels: () => {
            return labels;
        },
        /**
         * Get labels for chat
         *
         * @returns Label IDs
         **/
        getChatLabels: (chatId) => {
            return labelAssociations.findOne((la) => la.chatId === chatId);
        },
        /**
         * Get labels for message
         *
         * @returns Label IDs
         **/
        getMessageLabels: async (messageId) => {
            const associations = labelAssociations.find((la) => la.messageId === messageId);
            return associations === null || associations === void 0 ? void 0 : associations.map(({ labelId }) => labelId);
        },
        loadMessage: async (jid, id) => {
            var _a, _b;
            if (messages[jid]) {
                return messages[jid].get(id);
            }
            const chat = await chats.findOne({ id: jid }, { projection: { _id: 0 } });
            for (const m of (_a = chat === null || chat === void 0 ? void 0 : chat.messages) !== null && _a !== void 0 ? _a : []) {
                if (((_b = m === null || m === void 0 ? void 0 : m.message) === null || _b === void 0 ? void 0 : _b.key.id) === id) {
                    return m.message;
                }
            }
        },
        mostRecentMessage: async (jid) => {
            var _a, _b, _c;
            const message = ((_a = messages[jid]) === null || _a === void 0 ? void 0 : _a.array.slice(-1)[0]) ||
                ((_c = (_b = (await chats.findOne({ id: jid }, { projection: { _id: 0 } }))) === null || _b === void 0 ? void 0 : _b.messages) === null || _c === void 0 ? void 0 : _c.slice(-1)[0].message) ||
                undefined;
            return message;
        },
        fetchImageUrl: async (jid, sock) => {
            const contact = await contacts.findOne({ id: jid }, { projection: { _id: 0 } });
            if (!contact) {
                return sock === null || sock === void 0 ? void 0 : sock.profilePictureUrl(jid);
            }
            if (typeof contact.imgUrl === "undefined") {
                contact.imgUrl = await (sock === null || sock === void 0 ? void 0 : sock.profilePictureUrl(jid));
                await contacts.updateOne({ id: jid }, { $set: contact }, { upsert: true });
            }
            return contact.imgUrl;
        },
        getContactInfo: async (jid, socket) => {
            const contact = await contacts.findOne({ id: jid }, { projection: { _id: 0 } });
            if (!contact) {
                return {
                    id: jid,
                    imgUrl: await (socket === null || socket === void 0 ? void 0 : socket.profilePictureUrl(jid)),
                };
            }
            // fetch image if required
            if (typeof contact.imgUrl === "undefined" ||
                contact.imgUrl === "changed") {
                contact.imgUrl = await (socket === null || socket === void 0 ? void 0 : socket.profilePictureUrl(contact.id, "image"));
                await contacts.updateOne({ id: jid }, { $set: { ...contact } }, { upsert: true });
            }
            return contact;
        },
        fetchGroupMetadata: async (jid, sock) => {
            if (!groupMetadata[jid]) {
                const metadata = await (sock === null || sock === void 0 ? void 0 : sock.groupMetadata(jid));
                if (metadata) {
                    groupMetadata[jid] = metadata;
                }
            }
            return groupMetadata[jid];
        },
        fetchMessageReceipts: async ({ remoteJid, id }) => {
            const list = messages[remoteJid];
            const msg = list === null || list === void 0 ? void 0 : list.get(id);
            return msg === null || msg === void 0 ? void 0 : msg.userReceipt;
        },
        getChatById,
        toJSON,
        fromJSON,
    };
};
