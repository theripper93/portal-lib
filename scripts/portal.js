import { Propagator } from "./lib/propagator.js";
import { MODULE_ID } from "./main.js";
import { TemplatePreview } from "./templatePreview.js";

const DEFAULT_DATA = {
    origin: null,
    distance: null,
    texture: "",
};

export class Portal {
    constructor(options) {
        this.#data = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_DATA), options);
    }

    #data;

    #tokens = [];

    #updateData = [];

    #counts = [];

    #template = null;

    #validated = false;

    get template() {
        return this.#template;
    }

    get tokens() {
        return this.#tokens;
    }

    get origin() {
        return this.#data.origin;
    }

    get radius() {
        return this.#data.radius;
    }

    get texture() {
        return this.#data.texture;
    }

    addCreature(creature, { updateData = null, count = 1 } = {}) {
        if (Array.isArray(creature)) {
            creature.forEach((c) => this.addCreature(c));
            return this;
        }

        let tokenData = null;

        if (creature instanceof Token) tokenData = creature.document.toObject();
        if (creature instanceof TokenDocument) tokenData = creature.toObject();
        if (creature instanceof Actor || typeof creature === "string") tokenData = this.#processAsyncCreature(creature);

        if (!tokenData) ui.notifications.error(`${MODULE_ID}.ERR.NoTokenData`);

        this.#tokens.push(tokenData);
        this.#updateData.push(updateData);
        this.#counts.push(count);

        return this;
    }

    origin(origin) {
        if (origin instanceof Token || origin instanceof TokenDocument) {
            this.#data.teleportTarget = origin.document ?? origin;
        }

        if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidOrigin`);
            return this;
        }
        if (origin.center) {
            this.#data.origin = {
                x: origin.center.x,
                y: origin.center.y,
                elevation: origin.document.elevation,
            };
        } else {
            this.#data.origin = {
                x: origin.x,
                y: origin.y,
                elevation: origin.elevation,
            };
        }
        return this;
    }

    size(radius) {
        if (Number.isFinite(radius)) {
            this.#data.distance = radius;
        } else {
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidNumber`);
        }
        return this;
    }

    color(color) {
        this.#data.color = color;
        return this;
    }

    range(range) {
        if (Number.isFinite(range)) {
            this.#data.range = range;
        } else {
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidNumber`);
        }
        return this;
    }

    texture(texture) {
        if (typeof texture === "string") {
            this.#data.texture = texture;
        } else {
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidTexture`);
        }
        return this;
    }

    async #resolveTokenData() {
        const resolved = [];
        for (const token of this.#tokens) {
            resolved.push(await token);
        }

        this.#tokens = resolved.map((t) => new TokenDocument(t));

        for (let i = 0; i < this.#tokens.length; i++) {
            const token = this.#tokens[i];
            if (this.#updateData[i]?.token) token.updateSource(this.#updateData[i].token);
        }

        return this;
    }

    async #processAsyncCreature(creature) {
        const originalCreature = creature;
        if (typeof creature === "string") creature = await fromUuid(creature);
        if (!creature) creature = game.actors.getName(originalCreature);
        if (!creature) return null;
        if (creature instanceof Actor) return await creature.getTokenDocument();
        if (creature instanceof TokenDocument) return creature.toObject();
        if (creature instanceof Token) return creature.document.toObject();
        return null;
    }

    async #preValidateAndProcessData() {
        if (this.#validated) return this;
        this.#validated = true;
        await this.#resolveTokenData();
        if (!Number.isFinite(this.#data.distance)) {
            const firstToken = this.#tokens[0];
            const size = Math.max(firstToken.width, firstToken.height);
            this.#data.distance = size * canvas.scene.dimensions.distance;
        }
        if (typeof this.#data.color !== "string") this.#data.color = game.user.color.toString();
        return this;
    }

    async #processPostSpawnUpdate(tokenDocument, updateData) {
        if (!updateData) return;
        const actor = tokenDocument.actor;
        if (!actor) return;
        if (updateData.actor) await tokenDocument.actor.update(updateData.actor);
        if (updateData.embedded) {
            for (const [key, value] of Object.entries(updateData.embedded)) {
                const collection = actor.getEmbeddedCollection(key);
                //prepare updates
                const updates = [];
                collection.forEach((entry) => {
                    const entityUpdateData = value[entry.id] ?? value[entry.name];
                    if (entityUpdateData) {
                        updates.push({
                            _id: entry.id,
                            ...entityUpdateData,
                        });
                    }
                });
                await collection.update(updates);
            }
        }
    }

    //final methods

    async pick(options = {}) {
        await this.#preValidateAndProcessData();

        const templateDocument = new MeasuredTemplateDocument();
        templateDocument.updateSource({ distance: this.#data.distance, fillColor: this.#data.color, texture: this.#data.texture });

        const templatePreview = new TemplatePreview(templateDocument, { origin: this.#data.origin, range: this.#data.range });
        const result = await templatePreview.drawPreview();

        if (result) {
            if (this.#data.origin && this.#data.range) {
                const distance = canvas.grid.measureDistance(this.#data.origin, { x: result.x, y: result.y });
                if (distance > this.#data.range) {
                    ui.notifications.error(`${MODULE_ID}.ERR.OutOfRange`);
                    return this.pick(options);
                }
            }
            this.#template = result;
        } else return false;

        const x = this.#template.x;
        const y = this.#template.y;
        const elevation = this.origin.elevation ?? this.#template.elevation;

        return { x, y, elevation };
    }

    async spawn(options = {}) {
        await this.#preValidateAndProcessData();
        let position;
        if (!this.#template) {
            const picked = await this.pick(options);
            if (!picked) return false;
            position = picked;
        }

        const spawned = [];

        for (let ti = 0; ti < this.#tokens.length; ti++) {
            const count = this.#counts[ti];
            const tokenDocument = this.#tokens[ti];
            for (let i = 0; i < count; i++) {
                const tPos = Propagator.getFreePosition(tokenDocument, position, true);
                tokenDocument.updateSource({ x: tPos.x, y: tPos.y, elevation: position.elevation });
                const token = await canvas.scene.createEmbeddedDocuments("Token", [tokenDocument])[0];
                await this.#processPostSpawnUpdate(token, this.#updateData[ti]);
                spawned.push(token);
            }
        }

        return this;
    }

    async teleport(options = {}) {
        const targetToken = this.#data.teleportTarget;
        if (!targetToken) {
            ui.notifications.error(`${MODULE_ID}.ERR.NoTeleportTarget`);
            return false;
        }
        await this.#preValidateAndProcessData();
        let position;
        if (!this.#template) {
            const picked = await this.pick(options);
            if (!picked) return false;
            position = picked;
        }
        //fade out token
        const placeable = targetToken.object;
        const originalAlpha = placeable.mesh.alpha;
        await CanvasAnimation.animate(
            [
                {
                    parent: placeable.mesh,
                    attribute: "alpha",
                    to: 0,
                },
            ],
            {
                duration: 300,
                easing: "easeOutCircle",
            },
        );

        await targetToken.update({ x: position.x, y: position.y, elevation: position.elevation }, { animate: false });

        //fade in token
        await CanvasAnimation.animate(
            [
                {
                    parent: placeable.mesh,
                    attribute: "alpha",
                    from: 0,
                    to: originalAlpha,
                },
            ],
            {
                duration: 300,
                easing: "easeInCircle",
            },
        );
        return this;
    }
}

//example
/*
new Portal()
    .addCreature("Aboleth", {count: 3})
    .color("#ff0000")
    .texture("icons/svg/dice-target.svg")
    .origin(token)
    .range(60)
    .spawn();

    */
