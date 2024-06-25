import {FormHelper} from "./formHelper.js";

export class FormBuilder {

    constructor () {
        this.submitButton();
    }
    
    #tabs = [];
    #fields = [];
    #buttons = [];
    #options = {};

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

    object(object) {
        this.#object = object;
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