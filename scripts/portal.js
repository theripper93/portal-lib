import { Propagator } from "./lib/propagator.js";
import { MODULE_ID } from "./main.js";
import { TemplatePreview } from "./templatePreview.js";
import { FormBuilder } from "./lib/formBuilder.js";
import { getSetting } from "./settings.js";
import { Router } from "./router.js";

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

    static sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    #data;

    #tokens = [];

    #updateData = [];

    #counts = [];

    #template = null;

    #validated = false;

    #actorAttributes = [];

    #tokenAttributes = [];

    #transformTarget = null;

    #delay = 0;

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

    get actorAttributes() {
        return this.#actorAttributes;
    }

    get tokenAttributes() {
        return this.#tokenAttributes;
    }

    get transformTarget() {
        return this.#transformTarget;
    }

    addCreature(creature, { updateData = null, count = 1 } = {}) {
        if (Array.isArray(creature)) {
            creature.forEach((c) => this.addCreature(c));
            return this;
        }

        if(creature.count){
            count = creature.count;
        }
        if(creature.creature){
            creature = creature.creature;
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
        if (origin instanceof foundry.canvas.placeables.Token || origin instanceof TokenDocument) {
            this.#data.teleportTarget = origin.document ?? origin;
            this.#transformTarget = origin.document ?? origin;
        } else if (origin instanceof Actor) {
            this.#transformTarget = origin;
        } else if (typeof target === "string") {
            this.#transformTarget = game.actors.getName(origin) ?? fromUuidSync(origin) ?? origin;
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

    snappingMode(mode) {
        if(!Object.values(CONST.GRID_SNAPPING_MODES).includes(mode)){
            ui.notifications.error(`${MODULE_ID}.ERR.InvalidSnappingMode`, { localize: true });
        }else{
            this.#data.snappingMode = mode;
        }
        return this;
    }

    delay(ms) {
        this.#delay = ms;
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

    setLocation(templateDocument) {
        templateDocument = templateDocument.document ?? templateDocument;
        if (templateDocument instanceof MeasuredTemplateDocument) {
            this.#template = templateDocument;
        } else {
            templateDocument = new MeasuredTemplateDocument(templateDocument);
            this.#template = templateDocument;
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
        if (creature instanceof Actor) {
            const tokenDocument = await creature.getTokenDocument();
            if (!tokenDocument.actor) tokenDocument.updateSource({ [`flags.${MODULE_ID}.importActor`]: creature.toObject() });
            return tokenDocument;
        }
        if (creature instanceof TokenDocument) return creature.toObject();
        if (creature instanceof Token) return creature.document.toObject();
        return null;
    }

    async #preValidateAndProcessData() {
        if (this.#validated) return this;
        this.#validated = true;
        await this.#resolveTokenData();
        if (!Number.isFinite(this.#data.distance)) {
            const firstToken = this.#tokens[0] ?? this.#data.teleportTarget;
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
        if (updateData.actor) await Router.updateDocument(tokenDocument.actor, updateData.actor);
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
                await Router.updateDocuments(actor, key, updates);
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
            const td = new MeasuredTemplateDocument(template3d);
            td.undefinedElevation = false;
            return td;
        } else {
            const templatePreview = new TemplatePreview(templateDocument, {origin: this.#data.origin, range: this.#data.range, snappingMode: this.#data.snappingMode});
            const td = await templatePreview.drawPreview();
            td.undefinedElevation = true;
            return td;
        }
    }

    async #processCompendiumImport(tokenDocument) {
        if (!tokenDocument.flags[MODULE_ID]?.importActor) return;
        const actor = game.actors.getName(tokenDocument.flags[MODULE_ID].importActor.name) ?? await Router.createActor(tokenDocument.flags[MODULE_ID].importActor);
        tokenDocument.updateSource({ actorId: actor.id, flags: { [MODULE_ID]: { importActor: null } } });
    }

    //final methods

    async pick(options = {}) {
        await this.#preValidateAndProcessData();

        const result = await this.#getTemplateData();

        if (result) {
            if (this.#data.origin && this.#data.range) {
                const distance = canvas.grid.measurePath([result, this.#data.origin], {gridSpaces: true}).distance;
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

        if (this.#delay) await Portal.sleep(this.#delay);

        const spawned = [];

        for (let ti = 0; ti < this.#tokens.length; ti++) {
            const roll = new Roll(this.#counts[ti].toString());
            const count = (await roll.evaluate()).total;
            const tokenDocument = this.#tokens[ti];
            await this.#processCompendiumImport(tokenDocument);
            const offsetPosition = { x: position.x - (tokenDocument.width / 2) * canvas.scene.dimensions.size, y: position.y - (tokenDocument.height / 2) * canvas.scene.dimensions.size, elevation: position.elevation };
            for (let i = 0; i < count; i++) {
                const tPos = Propagator.getFreePosition(tokenDocument, offsetPosition, true);
                tokenDocument.updateSource({ x: tPos.x, y: tPos.y, elevation: offsetPosition.elevation });
                const token = (await Router.createEmbeddedDocuments(canvas.scene, "Token", [tokenDocument]))[0];
                await this.#processPostSpawnUpdate(token, this.#updateData[ti]);
                spawned.push(token);
            }
        }

        return spawned;
    }

    async dialog(options = { spawn: true, multipleChoice: false, title: `${MODULE_ID}.DIALOG.Title`, transform: false }) {
        await this.#preValidateAndProcessData();
        const dialogData = this.#tokens.map((token, index) => ({ token, count: this.#counts[index], index }));
        const html = await renderTemplate("modules/portal-lib/templates/dialog.hbs", { dialogData, transform: options.transform });
        let selectedLi = [];
        const result = await foundry.applications.api.DialogV2.prompt({
            window: { title: options.title },
            position: { width: 400 },
            content: html,
            close: () => {
                return false;
            },
            render: function (e, html, c) {
                const content = html.element;
                content.querySelectorAll("li").forEach((li, index) => {
                    if (index === 0) {
                        selectedLi = [li];
                        li.classList.add("selected");
                    }
                    li.addEventListener("click", (e) => {
                        if (!options.multipleChoice) content.querySelectorAll("li").forEach((i) => i.classList.remove("selected"));
                        li.classList.toggle("selected");
                        selectedLi = [...content.querySelectorAll("li.selected")];
                    });
                });
            },
        });
        if (result !== "ok") return false;
        const selected = selectedLi;
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

    async teleport(token, range) {
        if (!token && !this.#data.teleportTarget) this.origin(canvas.tokens.controlled[0]);
        if (Number.isFinite(range)) this.range(range);
        const targetToken = this.#data.teleportTarget;
        if (!targetToken) {
            ui.notifications.error(`${MODULE_ID}.ERR.NoTeleportTarget`, { localize: true });
            return false;
        }
        await this.#preValidateAndProcessData();
        let position;
        const picked = this.#template ?? (await this.pick({}));
        if (!picked) return false;
        const useSourceElevation = this.template?.undefinedElevation ?? false;
        const centerPoint = picked;
        position = centerPoint;
        //calc offset
        const offset = { x: -targetToken.width * 0.5 * canvas.grid.size, y: -targetToken.height * 0.5 * canvas.grid.size };
        position.x += offset.x;
        position.y += offset.y;
        //fade out token
        const placeable = targetToken.object;
        position = placeable.getSnappedPosition(position, {mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER, resolution:2})
        
        const originalAlpha = placeable.mesh.alpha;
        await foundry.canvas.animation.CanvasAnimation.animate(
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

        await Router.updateDocument(targetToken, { x: position.x, y: position.y, elevation: useSourceElevation ? targetToken.elevation :position.elevation }, { animate: false });

        //fade in token
        await foundry.canvas.animation.CanvasAnimation.animate(
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

    static async teleport(token, range) {
        return new Portal().teleport(token, range);
    }

    static async spawn(options = {}) {
        const portal = new Portal();
        portal.addCreature(options);
        return await portal.spawn();
    }

    static async transform(options = {}) {
        const portal = new Portal();
        if (!options.target) {
            portal.origin(canvas.tokens.controlled[0]);
        }
        portal.addCreature(options);
        return await portal.transform();
    }

    // Transformation Logic

    addActorAttribute(attribute) {
        this.#actorAttributes.push(attribute);
        return this;
    }

    addTokenAttribute(attribute) {
        this.#tokenAttributes.push(attribute);
        return this;
    }

    async transform(options = {}) {

        await this.#preValidateAndProcessData();
        const original = typeof this.#transformTarget === "string" ? await fromUuid(this.#transformTarget) : this.#transformTarget;
        if (!original) return ui.notifications.error(`${MODULE_ID}.ERR.InvalidTransformTarget`, { localize: true });
        const actor = original instanceof Actor ? original : original.actor;
    
        if (!actor) return ui.notifications.error(`${MODULE_ID}.ERR.InvalidTransformTarget`, {localize: true});

        let originalToken = actor.token ?? actor.getActiveTokens()[0] ?? actor.prototypeToken;
        originalToken = originalToken.document ?? originalToken;
        // Check if it's already a transformed actor
        const isTransformed = originalToken.getFlag(MODULE_ID, "revertData");
        if (isTransformed) return Portal.revertTransformation(originalToken, options);

        if (this.#tokens.length === 0) return ui.notifications.error(`${MODULE_ID}.ERR.InvalidTransformCreature`, { localize: true });

        if (this.#tokens.length > 1) await this.dialog({ spawn: false, multipleChoice: false, title: `${MODULE_ID}.DIALOG.TransformTitle`, transform: true });

        const transformActor = this.#tokens[0].actor;

        if (!transformActor && !this.#tokens[0].flags[MODULE_ID]?.importActor) return ui.notifications.error(`${MODULE_ID}.ERR.InvalidTransformCreature`, { localize: true });

        const transformedActorData = this.#tokens[0].flags[MODULE_ID]?.importActor ?? transformActor.toObject();

        if(this.#tokens[0].flags[MODULE_ID]?.importActor) this.#tokens[0].updateSource({ flags: { [MODULE_ID]: { importActor: null } } });

        foundry.utils.setProperty(transformedActorData, `ownership.${game.user.id}`, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);

        for (const attribute of this.#actorAttributes) {
            const value = foundry.utils.getProperty(original, attribute);
            if (value) foundry.utils.setProperty(transformedActorData, attribute, value);
        }

        for (const attribute of this.#tokenAttributes) {
            const value = foundry.utils.getProperty(originalToken, attribute);
            if (value) foundry.utils.setProperty(transformedActorData.prototypeToken, attribute, value);
        }

        transformedActorData.name = transformedActorData.name + ` - [${original.name}]`;

        const existing = game.actors.getName(transformedActorData.name);

        const transformedActor = existing ?? (await Router.createActor(transformedActorData));

        const currentSheetPosition = { top: actor.sheet.position.top, left: actor.sheet.position.left };

        const revertData = {
            tokenData: originalToken.toObject(),
            createdActor: transformedActor.uuid,
            time: Date.now(),
        };

        //assign actor to new token
        const originalCanvasToken = actor.token ?? actor.getActiveTokens()[0];
        if (originalCanvasToken && !this.#tokenAttributes.includes("actorId")) {
            const currentTokenDocument = originalCanvasToken.document ?? originalCanvasToken;
            const newTokenDocument = await transformedActor.getTokenDocument({ x: currentTokenDocument.x, y: currentTokenDocument.y, actorId: transformedActor.id, flags: { [MODULE_ID]: { revertData } } });
            await Router.updateDocument(currentTokenDocument, newTokenDocument.toObject());
        }

        if(!options?.skipSheetRender) originalCanvasToken.actor.sheet.render(true, { ...currentSheetPosition });

        return transformedActor;
    }

    static async revertTransformation(token, transformOptions) {
        const tokenDocument = token.document ?? token;
        const revertData = tokenDocument.getFlag(MODULE_ID, "revertData");
        if (!revertData) return;
        const currentSheetPosition = { top: tokenDocument.actor.sheet.position.top, left: tokenDocument.actor.sheet.position.left };
        if(!transformOptions?.skipSheetRender) tokenDocument.actor.sheet.close();
        const toDelete = await fromUuid(revertData.createdActor);
        const autoDelete = getSetting("autoDelete");
        const confirmDelete = autoDelete || (await foundry.applications.api.DialogV2.confirm({ position: { width: 400 }, window: { title: game.i18n.localize(`${MODULE_ID}.DIALOG.DeleteTitle`) }, content: game.i18n.localize(`${MODULE_ID}.DIALOG.DeleteContent`) + "<hr>" + `<strong>${toDelete.name}</strong>` }));
        if (confirmDelete) await Router.deleteDocument(toDelete);
        const tokenData = revertData.tokenData;
        ["x", "y", "elevation"].forEach(k => delete tokenData[k]);
        foundry.utils.setProperty(tokenData, "flags." + MODULE_ID + ".revertData", null);
        await Router.updateDocument(tokenDocument, tokenData);
        if(!transformOptions?.skipSheetRender) tokenDocument.actor.sheet.render(true, { ...currentSheetPosition });
        ui.notifications.info(`${MODULE_ID}.INFO.RevertedTransformation`, { localize: true });
        return tokenDocument;
    }
}