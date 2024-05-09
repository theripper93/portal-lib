export class TemplatePreview {
    constructor(template) {
        this.document = template;
        this.resolve = null;
        this.promise = new Promise((resolve) => (this.resolve = resolve));
    }

    activateListeners() {
        this._onMoveFn = this.#onMove.bind(this);
        this._onMouseUpFn = this.#onMouseUp.bind(this);
        document.addEventListener("mousemove", this._onMoveFn);
        document.addEventListener("mouseup", this._onMouseUpFn);
    }

    #onMove(event) {
        let coords = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
        coords = [coords.x, coords.y];
        coords = canvas.grid.getCenter(coords[0], coords[1]);
        coords = canvas.grid.getTopLeft(coords[0], coords[1]);
        this.document.updateSource({ x: coords[0], y: coords[1] });
        this.previewObject.x = coords[0];
        this.previewObject.y = coords[1];
    }

    #onMouseUp(event) {
        const isRightClick = event.button === 2;
        const isLeftClick = event.button === 0;
        if (!isRightClick && !isLeftClick) return;
        this.cleanup();
        this.resolve(isLeftClick ? this.document : null);
    }

    async drawPreview() {
        const previewObject = new PIXI.Container();
        previewObject.alpha = 0;
        //draw a circle with border
        const circle = new PIXI.Graphics();
        const fill = this.document.fillColor;
        const stroke = this.document.borderColor;
        circle.beginFill(fill, 0.25);
        circle.drawCircle(0, 0, (this.document.distance * canvas.dimensions.distancePixels) / 2);
        circle.endFill();

        if (this.document.texture) {
            const texture = await loadTexture(this.document.texture);
            if(texture) {
                const textureWidth = texture.width;
                const textureHeight = texture.height;
                const circleWidthHeight = (this.document.distance * canvas.dimensions.distancePixels);

                const matrix = new PIXI.Matrix();
                matrix.translate(-textureWidth/2, -textureHeight/2);
                matrix.scale(circleWidthHeight / textureWidth, circleWidthHeight / textureHeight);


                circle.beginTextureFill({texture, matrix});
                circle.drawCircle(0, 0, this.document.distance * canvas.dimensions.distancePixels / 2);
                circle.endFill();
            }
        }


        circle.lineStyle(1, stroke, 1);
        circle.drawCircle(0, 0, (this.document.distance * canvas.dimensions.distancePixels) / 2);
        previewObject.addChild(circle);
        circle.x += circle.width / 2;
        circle.y += circle.height / 2;
        this.previewObject = previewObject;
        canvas.interface.grid.addChild(previewObject);
        CanvasAnimation.animate(
            [
                {
                    parent: previewObject,
                    attribute: "alpha",
                    from: 0,
                    to: 1,
                }
            ],
            {
                duration: 200,
                easing: "easeInCircle",
            },
        );
        this.activateListeners();
        return this.promise;
    }

    async cleanup() {
        document.removeEventListener("mousemove", this._onMoveFn);
        document.removeEventListener("mouseup", this._onMouseUpFn);
        await CanvasAnimation.animate(
            [
                {
                    parent: this.previewObject,
                    attribute: "alpha",
                    from: 1,
                    to: 0,
                },
            ],
            {
                duration: 200,
                easing: "easeOutCircle",
            },
        );
        this.previewObject.removeFromParent();
        this.previewObject.destroy(true);
    }
}
