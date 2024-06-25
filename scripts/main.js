import {initConfig} from "./config.js";
import {registerSettings} from "./settings.js";
import {Portal} from "./portal.js";
import {FormHelper} from "./lib/formHelper.js";
import {FormBuilder} from "./lib/formBuilder.js";

export const MODULE_ID = "portal-lib";

globalThis.Portal = Portal;

Hooks.on("init", () => {
    initConfig();
    registerSettings();
});