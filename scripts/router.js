import {Socket} from "./lib/socket.js";
import {MODULE_ID} from "./main.js";
import {getSetting} from "./settings";

export class Router {
    static get #enableRouter() {
        return true;
        //return getSetting("enableRouter");
    }

    static #getUUID(uuid) {
        return uuid.uuid ?? uuid.document?.uuid ?? uuid;
    }

    static #Socket = Socket;

    static async updateDocument(uuid, data, options = {}) {
        uuid = this.#getUUID(uuid);
        if(this.#enableRouter) {
            const res = await this.#Socket.updateDocument({uuid, data, options});
            return res[0].response;
        } else {
            const document = await fromUuid(uuid);
            return await document.update(data, options);
        }
    }

    static async deleteDocument(uuid, options = {}) {
        uuid = this.#getUUID(uuid);
        if(this.#enableRouter) {
            const res = await this.#Socket.deleteDocument({uuid, options});
            return res[0].response;
        } else {
            const document = await fromUuid(uuid);
            return await document.delete( options);
        }
    }

    static async updateDocuments(uuid, documentType, data, options = {}) {
        uuid = this.#getUUID(uuid);
        if(this.#enableRouter) {
            const res = await this.#Socket.updateDocuments({uuid, documentType, data, options});
            const documents = [];
            for(const d of res[0].response) {
                documents.push(await fromUuid(d));
            }
            return documents;
        } else {
            const parent = await fromUuid(uuid);
            return await parent.updateEmbeddedDocuments(documentType, data, options);
        }
    }

    static async createActor(data) {
        if(this.#enableRouter) {
            const res = await this.#Socket.createActor({data});
            const actor = res[0].response;
            return await fromUuid(actor);
        } else {
            return await Actor.create(data);
        }
    }

    static async createEmbeddedDocuments(parent, documentType, data, options = {}) {
        parent = this.#getUUID(parent);
        if(this.#enableRouter) {
            const res = await this.#Socket.createEmbeddedDocuments({parent, documentType, data, options});
            const documents = [];
            for(const d of res[0].response) {
                documents.push(await fromUuid(d));
            }
            return documents;
        } else {
            const parentDocument = await fromUuid(parent);
            return await parentDocument.createEmbeddedDocuments(documentType, data, options);
        }
    }

}