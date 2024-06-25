import { Propagator } from "./lib/propagator.js";
import { MODULE_ID } from "./main.js";
import {TemplatePreview} from "./templatePreview.js";
import {FormBuilder} from "./lib/formBuilder.js";

const DEFAULT_DATA = {
    origin: null,
    distance: null,
    texture: "",
};

export class Portal {
    constructor(options = {}) {
        this.#data = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_DATA), options);
    }

    static FormBuilder = FormBuilder;

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

        if (!tokenData) ui.notifications.error(`${MODULE_ID}.ERR.NoTokenData`, { localize: true });

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
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidOrigin`, { localize: true });
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
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidNumber`, { localize: true });
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
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidNumber`, { localize: true });
        }
        return this;
    }

    texture(texture) {
        if (typeof texture === "string") {
            this.#data.texture = texture;
        } else {
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidTexture`, { localize: true });
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
            const size = firstToken ? Math.max(firstToken.width, firstToken.height) : 1;
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

    async #getTemplateData() {
        const templateDocument = new MeasuredTemplateDocument();
        templateDocument.updateSource({ distance: this.#data.distance, fillColor: this.#data.color, texture: this.#data.texture });

        if (game.Levels3DPreview?._active) {
            templateDocument.updateSource({ distance: this.#data.distance / 2 });
            const template3d = await game.Levels3DPreview.CONFIG.entityClass.Template3D.drawPreview({ document: templateDocument }, false);
            const centerCoords = canvas.grid.getCenter(template3d.x, template3d.y);
            template3d.x = centerCoords[0];
            template3d.y = centerCoords[1];
            return new MeasuredTemplateDocument(template3d);
        } else {
            const templatePreview = new TemplatePreview(templateDocument, { origin: this.#data.origin, range: this.#data.range });
            return await templatePreview.drawPreview();
        }
    }

    //final methods

    async pick(options = {}) {
        await this.#preValidateAndProcessData();

        const result = await this.#getTemplateData();

        if (result) {
            if (this.#data.origin && this.#data.range) {
                const distance = canvas.grid.measureDistance(this.#data.origin, { x: result.x, y: result.y });
                if (distance > this.#data.range) {
                    ui.notifications.error(`${MODULE_ID}.ERR.OutOfRange`, { localize: true });
                    return this.pick(options);
                }
            }
            this.#template = result;
        } else return false;

        const x = this.#template.x;
        const y = this.#template.y;
        const elevation = this.origin.elevation ?? this.#template.elevation ?? 0;

        return { x, y, elevation };
    }

    async spawn(options = {}) {
        if (Array.isArray(options) || typeof options === "string") this.addCreature(options);
        await this.#preValidateAndProcessData();
        let position;
        if (!this.#template) {
            const picked = await this.pick(options);
            if (!picked) return false;
            position = picked;
        } else {
            position = { x: this.#template.x, y: this.#template.y, elevation: this.#template.elevation ?? 0 };
        }

        const spawned = [];

        for (let ti = 0; ti < this.#tokens.length; ti++) {
            const roll = new Roll(this.#counts[ti].toString());
            const count = (await roll.evaluate()).total;
            const tokenDocument = this.#tokens[ti];
            const offsetPosition = { x: position.x - (tokenDocument.width / 2) * canvas.scene.dimensions.size, y: position.y - (tokenDocument.height / 2) * canvas.scene.dimensions.size, elevation: position.elevation };
            for (let i = 0; i < count; i++) {
                const tPos = Propagator.getFreePosition(tokenDocument, offsetPosition, true);
                tokenDocument.updateSource({ x: tPos.x, y: tPos.y, elevation: offsetPosition.elevation });
                const token = (await canvas.scene.createEmbeddedDocuments("Token", [tokenDocument]))[0];
                await this.#processPostSpawnUpdate(token, this.#updateData[ti]);
                spawned.push(token);
            }
        }

        return spawned;
    }

    async dialog(options = { spawn: true, multipleChoice: false, title: `${MODULE_ID}.DIALOG.Title` }) {
        await this.#preValidateAndProcessData();
        const dialogData = this.#tokens.map((token, index) => ({ token, count: this.#counts[index], index }));
        const html = await renderTemplate("modules/portal-lib/templates/dialog.hbs", { dialogData });
        const result = await Dialog.prompt({
            title: game.i18n.localize(options.title),
            content: html,
            close: () => {
                return false;
            },
            callback: (html) => {
                return html;
            },
            render: (html) => {
                const content = html[0];
                content.querySelectorAll("li").forEach((li, index) => {
                    if (index === 0) li.classList.add("selected");
                    li.addEventListener("click", (e) => {
                        if (!options.multipleChoice) content.querySelectorAll("li").forEach((i) => i.classList.remove("selected"));
                        li.classList.toggle("selected");
                    });
                });
            },
        });
        if (!result) return false;
        const ul = result[0].querySelector("ul");
        const selected = ul.querySelectorAll("li.selected");
        const newTokens = [];
        const newCounts = [];
        const newUpdateData = [];
        selected.forEach((li) => {
            const index = parseInt(li.dataset.index);
            const token = this.#tokens[index];
            const count = li.querySelector("input").value;
            const updateData = this.#updateData[index];
            newTokens.push(token);
            newCounts.push(count);
            newUpdateData.push(updateData);
        });
        this.#tokens = newTokens;
        this.#counts = newCounts;
        this.#updateData = newUpdateData;
        if (options.spawn) {
            return await this.spawn();
        } else {
            return this;
        }
    }

    async teleport(options = {}) {
        const targetToken = this.#data.teleportTarget;
        if (!targetToken) {
            ui.notifications.error(`${MODULE_ID}.ERR.NoTeleportTarget`, { localize: true });
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

    static async spawn(options = {}) {
        const portal = new Portal();
        portal.addCreature(options);
        return await portal.spawn();
    }
}