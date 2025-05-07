import {initConfig} from "./config.js";
import {registerSettings} from "./settings.js";
import {Portal} from "./portal.js";

export const MODULE_ID = "portal-lib";

globalThis.Portal = Portal;

Hooks.on("init", () => {
    initConfig();
    registerSettings();
});

Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
    const actor = app.document ?? app.actor;
    const canRevert = actor.token?.flags[MODULE_ID]?.revertData;
    if(!canRevert) return;
    buttons.unshift({
        label: "Revert Transformation",
        class: "revert",
        icon: "fas fa-undo",
        onclick: () => {
            Portal.revertTransformation(actor.token);
        }
    });
});

Hooks.on("getHeaderControlsActorSheetV2", (app, buttons) => {
    const actor = app.document ?? app.actor;
    const canRevert = actor.token?.flags[MODULE_ID]?.revertData;
    if(!canRevert) return;
    buttons.unshift({
        label: "Revert Transformation",
        action: "revert",
        icon: "fas fa-undo",
        onClick: () => {
            Portal.revertTransformation(actor.token);
        }
    });
});