import {MODULE_ID} from "./main.js";
import { Socket } from "./lib/socket.js";

export function initConfig() {

    Socket.register("updateDocument", async ({uuid, data, options}) => {
        const document = await fromUuid(uuid);
        if (!document) return false;
        const res = await document.update(data, options);
        return res.uuid;
    }, {response: true, timeout: 5000, users: Socket.USERS.FIRSTGM});

    Socket.register("deleteDocument", async ({uuid, options}) => {
        const document = await fromUuid(uuid);
        if (!document) return false;
        const res = await document.delete( options);
        return res;
    }, {response: true, timeout: 5000, users: Socket.USERS.FIRSTGM});

    Socket.register("updateDocuments", async ({uuid, documentType, data, options}) => {
        const parent = await fromUuid(uuid);
        if (!parent) return false;
        const res = await parent.updateEmbeddedDocuments(documentType, data, options);
        return res.map((d) => d.uuid);
    }, {response: true, timeout: 5000, users: Socket.USERS.FIRSTGM});
    
    Socket.register("createActor", async ({data}) => {
        const actor = await Actor.create(data);
        return actor.uuid;
    }, {response: true, timeout: 5000, users: Socket.USERS.FIRSTGM});

    Socket.register("createEmbeddedDocuments", async ({parent, documentType, data}) => {
        const parentDocument = await fromUuid(parent);
        if (!parentDocument) return false;
        const res = await parentDocument.createEmbeddedDocuments(documentType, data);
        return res.map((d) => d.uuid);
    }, {response: true, timeout: 5000, users: Socket.USERS.FIRSTGM});
}