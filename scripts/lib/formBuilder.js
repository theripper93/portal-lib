export class FormBuilder {

    constructor () {
        this.submitButton();
    }
    
    #tabs = [];
    #fields = [];
    #buttons = [];
    #options = {
        position: {
            width: 560,
            height: "auto",
        },
    };

    #currentTab = null;
    #currentFieldset = null;
    #object = null;

    async render() {
        const app = this.form();
        app.render(true);
        return app.promise;
    }

    form() {
        const app = new FormHelper({tabs: this.#tabs, fields: this.#fields, buttons: this.#buttons, options: this.#options});
        return app;
    }

    #addField(field) {
        if (this.#object) {
            const objectValue = foundry.utils.getProperty(this.#object, field.name);
            if(objectValue !== undefined) field.value = objectValue;
        }

        if(this.#currentFieldset) return this.#currentFieldset.fields.push(field);
        if(this.#currentTab) return this.#currentTab.fields.push(field);
        return this.#fields.push(field);
    }

    title(title) {
        this.#options.title = title;
        return this;
    }

    info(info) {
        this.#options.info = info;
        return this;
    }

    object(object) {
        this.#object = object;
        return this;
    }

    size({width, height}) {
        this.#options.position = {
            width: width ?? 560,
            height: height ?? "auto",
        }
        return this;
    }

    submitButton({enabled = true, label = "Confirm", icon = "fa-solid fa-check"} = {}) {
        const submitButton = {
            type: "submit",
            action: "submit",
            icon,
            label,
        }
        if (!enabled) this.#buttons = this.#buttons.filter(b => b.action !== "submit");
        else this.#buttons.push(submitButton);
        return this;
    }

    tab({id, group, icon, label, active = false} = {}) {
        group ??= "sheet";
        if (!id && this.#currentTab) {
            this.#currentTab = null;
            return this;
        }
        if(!id) throw new Error("You must provide an id for the tab");
        const tab = {
            id,
            group,
            icon,
            label,
            active,
            fields : [],
        }
        this.#tabs.push(tab);
        this.#currentTab = tab;
        return this;
    }

    fieldset({legend} = {}) {
        if (!legend && this.#currentFieldset) {
            this.#currentFieldset = null;
            return this;
        }
        if(!legend) throw new Error("You must provide a legend for the fieldset");
        const fieldset = {
            legend,
            fieldset: true,
            fields : [],
        }
        this.#addField(fieldset);
        this.#currentFieldset = fieldset;
        return this;
    }

    text({name, label, hint, value}) {
        const field = {
            field: new foundry.data.fields.StringField(),
            name,
            label,
            hint,
            value,
        }
        this.#addField(field)
        return this;
    }

    number({name, label, hint, value, min, max, step}) {
        const field = {
            field: new foundry.data.fields.NumberField(),
            name,
            label,
            hint,
            value,
            min,
            max,
            step,
        }
        this.#addField(field)
        return this;
    }

    checkbox({name, label, hint, value}) {
        const field = {
            field: new foundry.data.fields.BooleanField(),
            name,
            label,
            hint,
            value,
        }
        this.#addField(field)
        return this;
    }

    color({name, label, hint, value}) {
        const field = {
            field: new foundry.data.fields.ColorField(),
            name,
            label,
            hint,
            value,
        }
        this.#addField(field)
        return this;
    }

    file({name, type, label, hint, value}) {
        type ??= "imagevideo";
        const types = FILE_PICKER_TYPES[type];
        const dataField = new foundry.data.fields.FilePathField({categories: types});
        dataField.categories = [type];
        const field = {
            field: dataField,
            name,
            label,
            hint,
            type,
            value,
        }
        this.#addField(field)
        return this;
    }

    select({name, label, hint, value, options}) {
        const dType = inferSelectDataType(options);
        const field = {
            field: dType === Number ? new foundry.data.fields.NumberField({choices: options}) : new foundry.data.fields.StringField({choices: options}),
            name,
            label,
            hint,
            value,
            options,
        }
        this.#addField(field)
        return this;
    }

    multiSelect({name, label, hint, value, options}) {
        const dType = inferSelectDataType(options);
        const dataField = dType === Number ? new foundry.data.fields.NumberField({choices: options}) : new foundry.data.fields.StringField({choices: options});
        const field = {
            field: new foundry.data.fields.SetField(dataField),
            name,
            label,
            hint,
            value,
            options,
        }
        this.#addField(field)
        return this;
    }

    editor({name, label, hint, value}) {
        const field = {
            field: new foundry.data.fields.HTMLField(),
            name,
            label,
            hint,
            value,
        }
        this.#addField(field)
        return this;
    }

    textArea({name, label, hint, value}) {
        const field = {
            field: new foundry.data.fields.JSONField(),
            name,
            label,
            hint,
            value,
            stacked: true,
        }
        this.#addField(field)
        return this;
    }

    button({label, action, icon, callback}) {
        action ??= foundry.utils.randomID();
        const button = {
            action,
            type: "button",
            icon,
            label,
            callback,
        }
        this.#buttons.push(button);
        return this;
    }
}

const FILE_PICKER_TYPES = {
    "imagevideo": ["IMAGE", "VIDEO"],
    "image": ["IMAGE"],
    "video": ["VIDEO"],
    "audio": ["AUDIO"],
    "font": ["FONT"],
    "graphics": ["GRAPHICS"],
}

function inferSelectDataType(options) {
    const values = Object.keys(options);
    try {
        const isNumber = values.every(v => {
            const n = JSON.parse(v);
            return typeof n === "number";
        })
        if(isNumber) return Number;
    } catch (e) {
        return String;
    }
    return String;
}

export class FormHelper extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

    constructor (data) {
        data = data ?? testData;
        const actions = {};
        data.buttons.forEach(b => actions[b.action] = b.callback);
        super({actions, ...data.options});
        this.resolve;
        this.reject;
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this._title = data.options.title;
        this._info = data.options.info;
        this.processFormStructure(data);
    }


    #fields;

    #buttons;


    static DEFAULT_OPTIONS = {
        classes: ["form-helper"],
        tag: "form",
        window: {
            contentClasses: ["standard-form"],
        },
        position: {
            width: 560,
            height: "auto",
        },
        form: {
            handler: this.#onSubmit,
            closeOnSubmit: true,
        },
        actions: {
        },
    };

    static PARTS = {
        tabs: {
            template: "templates/generic/tab-navigation.hbs",
        },
        genericForm: {
            template: "modules/portal-lib/templates/genericForm.hbs",
        },
        footer: {
            template: "templates/generic/form-footer.hbs",
        },
    };

    get title() {
        return this._title;
    }

    processFormStructure(data) {
        if (data.tabs?.length) {
            this.__tabs = {};
            const active = data.tabs.find((t) => t.active);
            if(!active) data.tabs[0].active = true;
            for (const tab of data.tabs) {
                this.__tabs[tab.id] = {
                    id: tab.id,
                    group: tab.group,
                    icon: tab.icon,
                    label: tab.label,
                    active: tab.active ?? false,
                    fields: tab.fields ?? [],
                }
            }
        }

        this.#fields = data.fields ?? [];

        this.#buttons = data.buttons ?? [];
    }

    _onClose(options) {
        super._onClose(options);
        if(!this.promise.resolved) this.resolve(false);
    }

    async _prepareContext(options) {
        return {
            tabs: this.#getTabs(),
            fields: this.#fields,
            info: this._info,
            buttons: [
                ...this.#buttons.filter(b => b.type !== "submit"),
                ...this.#buttons.filter(b => b.type === "submit")
            ],
        };
    }

    #getTabs() {
        const tabs = this.__tabs ?? {};
        for (const v of Object.values(tabs)) {
            v.cssClass = v.active ? "active" : "";
            if (v.active) break;
        }
        return tabs;
    }

    changeTab(...args) {
        super.changeTab(...args);
    }

    _onChangeForm(formConfig, event) {
        super._onChangeForm(formConfig, event);
        const formData = new FormDataExtended(this.element);
    }

    static async #onSubmit(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        this.resolve(data);
    }
}
