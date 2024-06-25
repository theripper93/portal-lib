export const testData = {
    tabs: [
        {
            id: "basic",
            group: "sheet",
            icon: "fa-solid fa-lightbulb",
            label: "AMBIENT_LIGHT.SECTIONS.BASIC",
            fields: [
                {
                    field: new foundry.data.fields.StringField(),
                    name: "test",
                    label: "Test",
                    type: "text",
                    value: "test",
                    hint: "this is a hint",
                },
                {
                    fieldset: true,
                    legend: "Test",
                    fields: [
                        {
                            field: new foundry.data.fields.StringField(),
                            name: "test2",
                            label: "Test 2",
                            type: "text",
                            value: "test",
                            hint: "this is a hint",
                        },
                        {
                            field: new foundry.data.fields.StringField(),
                            name: "test3",
                            label: "Test 3",
                            type: "text",
                            value: "test",
                            hint: "this is a hint",
                        },
                    ]
                }
            ]
        },
        {
            id: "animation",
            group: "sheet",
            icon: "fa-solid fa-play",
            label: "AMBIENT_LIGHT.SECTIONS.ANIMATION",
        },
        {
            id: "advanced",
            group: "sheet",
            icon: "fa-solid fa-cogs",
            label: "AMBIENT_LIGHT.SECTIONS.ADVANCED",
        },
    ],
    fields: [
        {
            field: new foundry.data.fields.StringField(),
            name: "test4",
            label: "Test 2",
            type: "text",
            value: "test",
            hint: "this is a hint",
        },
        {
            field: new foundry.data.fields.StringField(),
            name: "test6",
            label: "Test 3",
            type: "text",
            value: "test",
            hint: "this is a hint",
        },
    ],
    buttons: [
        {
            action: "test",
            type: "button",
            icon: "fas fa-cube",
            label: "TEST",
            callback: (event, element) => console.log(event, element)
        }
    ]
}



export class FormHelper extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

    constructor (data) {
        console.log(data)
        data = data ?? testData;
        const actions = {};
        data.buttons.forEach(b => actions[b.action] = b.callback);
        super({actions});
        this.resolve;
        this.reject;
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this._title = data.options.title;
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
